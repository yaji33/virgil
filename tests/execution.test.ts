import { describe, expect, it } from "vitest";
import { LiveExchange } from "../src/execution/live.js";
import { DemoExchange } from "../src/execution/demo.js";
import { WorkspaceBoundary } from "../src/boundary/workspace.js";
import { RecordStore } from "../src/records/store.js";
import type { PlanTerms } from "../src/plans/plan.js";
import type { ExecutionAdapter } from "../src/execution/adapter.js";
import { orderForRevision } from "../src/execution/gate.js";

const terms: PlanTerms = {
  title: "BTC purchase",
  intent: "Buy 250 USDT of BTC once",
  accountId: "demo-account",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  quoteAmount: "250",
  product: "SPOT",
  action: "BUY",
  schedule: "ONCE",
};

async function approved(exchange?: ExecutionAdapter, store = RecordStore.memory(), amount = "250") {
  const app = new WorkspaceBoundary(store, exchange);
  const session = await app.openSession();
  const draft = await app.create(session.token, { ...terms, quoteAmount: amount });
  await app.review(session.token, draft.id, 1);
  const plan = await app.approve(session.token, draft.id, 1);
  return { app, session, plan };
}

describe("Demo execution", () => {
  it("does not submit on approval and fills only after reconcile", async () => {
    const { app, session, plan } = await approved();
    const state = await app.read(session.token);
    expect(state.orders).toEqual([]);
    const submitted = await app.submit(session.token, plan.id, 1);
    expect(submitted.status).toBe("UNKNOWN");
    expect(plan.status).toBe("APPROVED");
    const filled = await app.reconcile(session.token, submitted.id);
    expect(filled.status).toBe("FILLED");
    if (filled.status === "FILLED") {
      expect(filled.filledQuoteAmount).toBe("250");
      expect(filled.environment).toBe("DEMO");
    }
  });

  it("rejects a second submit while an order is in flight", async () => {
    const { app, session, plan } = await approved();
    await app.submit(session.token, plan.id, 1);
    await expect(app.submit(session.token, plan.id, 1)).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
    });
  });

  it("rejects submit without approval", async () => {
    const app = new WorkspaceBoundary(RecordStore.memory());
    const session = await app.openSession();
    const plan = await app.create(session.token, terms);
    await expect(app.submit(session.token, plan.id, 1)).rejects.toMatchObject({
      status: 400,
      code: "INVALID",
    });
  });

  it("records a demo rejection without a fill", async () => {
    const app = new WorkspaceBoundary(
      RecordStore.memory(),
      new DemoExchange("rejected"),
    );
    const session = await app.openSession();
    const plan = await app.create(session.token, terms);
    await app.review(session.token, plan.id, 1);
    await app.approve(session.token, plan.id, 1);
    const submitted = await app.submit(session.token, plan.id, 1);
    const rejected = await app.reconcile(session.token, submitted.id);
    expect(rejected.status).toBe("REJECTED");
    const retried = await app.submit(session.token, plan.id, 1);
    expect(retried.status).toBe("UNKNOWN");
    expect(retried.exchangeOrderId).not.toBe(submitted.exchangeOrderId);
    await expect(app.submit(session.token, plan.id, 1)).rejects.toMatchObject({ status: 409 });
    expect(orderForRevision((await app.read(session.token)).orders, plan.id, 1)?.id).toBe(retried.id);
  });

  it("records the attempt before the adapter runs and blocks concurrent submits", async () => {
    const store = RecordStore.memory();
    let calls = 0;
    const exchange: ExecutionAdapter = {
      environment: "DEMO",
      async submitSpotBuy(request) {
        calls++;
        expect(store.snapshot().orders).toHaveLength(1);
        expect(store.snapshot().orders[0].id).toBe(request.idempotencyKey);
        return { status: "UNKNOWN", exchangeOrderId: `demo-${request.idempotencyKey}` };
      },
      async fetchOrder(exchangeOrderId) { return { status: "UNKNOWN", exchangeOrderId }; },
    };
    const { app, session, plan } = await approved(exchange, store);
    const results = await Promise.allSettled([
      app.submit(session.token, plan.id, 1), app.submit(session.token, plan.id, 1),
    ]);
    expect(calls).toBe(1);
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
  });

  it("keeps an uncertain attempt when submission throws", async () => {
    const exchange = new DemoExchange();
    exchange.submitSpotBuy = async () => { throw new Error("Response lost"); };
    const { app, session, plan } = await approved(exchange);
    await expect(app.submit(session.token, plan.id, 1)).rejects.toThrow("Response lost");
    expect((await app.read(session.token)).orders[0].status).toBe("UNKNOWN");
    await expect(app.submit(session.token, plan.id, 1)).rejects.toMatchObject({ status: 409 });
  });

  it("reconstructs acknowledged demo orders after an adapter restart", async () => {
    const store = RecordStore.memory();
    const { app, session, plan } = await approved(new DemoExchange(), store);
    const order = await app.submit(session.token, plan.id, 1);
    const restarted = new WorkspaceBoundary(store, new DemoExchange());
    expect((await restarted.reconcile(session.token, order.id)).status).toBe("FILLED");
  });

  it("does not invent rejection for an unrecognized demo order", async () => {
    expect((await new DemoExchange().fetchOrder("missing")).status).toBe("UNKNOWN");
  });

  it.each(["50", "0.000000000000000002"])("conserves quantities for a %s partial fill", async (amount) => {
    const { app, session, plan } = await approved(new DemoExchange("partial"), RecordStore.memory(), amount);
    const order = await app.submit(session.token, plan.id, 1);
    const partial = await app.reconcile(session.token, order.id);
    expect(partial.status).toBe("PARTIAL");
    if (partial.status === "PARTIAL") expect(partial.filledQuoteAmount).toBe(partial.remainingQuoteAmount);
  });

  it("preserves execution terms and visibility after a revision", async () => {
    const { app, session, plan } = await approved();
    const order = await app.submit(session.token, plan.id, 1);
    await app.revise(session.token, plan.id, 1, { ...terms, title: "Changed", quoteAmount: "100" });
    await app.review(session.token, plan.id, 2);
    await app.approve(session.token, plan.id, 2);
    const state = await app.read(session.token);
    expect(orderForRevision(state.orders, plan.id, 2)?.id).toBe(order.id);
    await expect(app.submit(session.token, plan.id, 2)).rejects.toMatchObject({ status: 409 });
    const filled = await app.reconcile(session.token, order.id);
    expect(filled.approvedPlan?.terms.quoteAmount).toBe("250");
    const event = (await app.read(session.token)).activity[0];
    expect(event.revision).toBe(1);
    expect(event.title).toBe(terms.title);
  });

  it("rejects changed exchange identity and excessive fills", async () => {
    const exchange = new DemoExchange();
    const { app, session, plan } = await approved(exchange);
    const order = await app.submit(session.token, plan.id, 1);
    exchange.fetchOrder = async () => ({ status: "UNKNOWN", exchangeOrderId: "different" });
    await expect(app.reconcile(session.token, order.id)).rejects.toThrow("identity changed");
    exchange.fetchOrder = async (exchangeOrderId) => ({
      status: "FILLED", exchangeOrderId, filledQuoteAmount: "999", receiptId: "bad",
    });
    await expect(app.reconcile(session.token, order.id)).rejects.toThrow("approved amount");
    expect((await app.read(session.token)).orders[0].status).toBe("UNKNOWN");
  });

  it("does not lose a partial fill to stale reconciliation", async () => {
    const exchange = new DemoExchange("partial");
    const { app, session, plan } = await approved(exchange);
    const order = await app.submit(session.token, plan.id, 1);
    await app.reconcile(session.token, order.id);
    exchange.fetchOrder = async (exchangeOrderId) => ({ status: "UNKNOWN", exchangeOrderId });
    expect((await app.reconcile(session.token, order.id)).status).toBe("PARTIAL");
    exchange.fetchOrder = async (exchangeOrderId) => ({
      status: "PARTIAL", exchangeOrderId, filledQuoteAmount: "50", remainingQuoteAmount: "200",
    });
    await expect(app.reconcile(session.token, order.id)).rejects.toThrow("discard a recorded fill");
  });

  it("does not enable live Binance execution", async () => {
    const live = new LiveExchange();
    await expect(
      live.submitSpotBuy({
        idempotencyKey: "x",
        accountId: "demo-account",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        quoteAmount: "250",
      }),
    ).rejects.toThrow("Live Binance execution is not enabled");
  });
});
