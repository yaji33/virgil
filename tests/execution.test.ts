import { describe, expect, it } from "vitest";
import { LiveExchange } from "../src/execution/live.js";
import { DemoExchange } from "../src/execution/demo.js";
import { WorkspaceBoundary } from "../src/boundary/workspace.js";
import { RecordStore } from "../src/records/store.js";
import type { PlanTerms } from "../src/plans/plan.js";
import type { ExecutionAdapter } from "../src/execution/adapter.js";
import { orderForRevision } from "../src/execution/gate.js";
import { RecoveryWorker } from "../src/execution/recovery.js";

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

async function waitUntil(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for recovery.");
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
    const settled = await app.read(session.token);
    expect(settled.workspace.account.balance).toBe("250");
    expect(settled.reserved).toBe("0");
    expect(settled.available).toBe("250");
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
    expect((await app.read(session.token)).reserved).toBe("250");
    const rejected = await app.reconcile(session.token, submitted.id);
    expect(rejected.status).toBe("REJECTED");
    const released = await app.read(session.token);
    expect(released.reserved).toBe("0");
    expect(released.workspace.account.balance).toBe("500");
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

  it("recovers an accepted attempt after its acknowledgement is lost", async () => {
    const store = RecordStore.memory();
    const exchange = new DemoExchange("filled", store);
    const submit = exchange.submitSpotBuy.bind(exchange);
    exchange.submitSpotBuy = async (request) => {
      await submit(request);
      throw new Error("Acknowledgement lost");
    };
    const { app, session, plan } = await approved(exchange, store);
    await expect(app.submit(session.token, plan.id, 1)).rejects.toThrow("Acknowledgement lost");
    const attempt = (await app.read(session.token)).orders[0];
    expect(attempt.exchangeOrderId).toBe(`pending-${attempt.id}`);

    const worker = new RecoveryWorker(
      store,
      new DemoExchange("filled", store),
      () => Date.parse(attempt.submittedAt) + 30_001,
    );
    expect(await worker.runOnce()).toBe(1);
    const recovered = (await app.read(session.token)).orders[0];
    expect(recovered.status).toBe("FILLED");
    expect(recovered.exchangeOrderId).toBe(`demo-${attempt.id}`);
    expect(recovered.recovery?.attempts).toBe(1);
  });

  it("keeps lookup misses unresolved and schedules another recovery", async () => {
    const store = RecordStore.memory();
    const exchange: ExecutionAdapter = {
      environment: "DEMO",
      async submitSpotBuy() { throw new Error("Response lost"); },
      async fetchOrder(exchangeOrderId) { return { status: "UNKNOWN", exchangeOrderId }; },
      async lookupOrder() { return undefined; },
    };
    const { app, session, plan } = await approved(exchange, store);
    await expect(app.submit(session.token, plan.id, 1)).rejects.toThrow("Response lost");
    const attempt = (await app.read(session.token)).orders[0];
    const now = Date.parse(attempt.submittedAt) + 30_001;
    const worker = new RecoveryWorker(store, exchange, () => now);
    expect(await worker.runOnce()).toBe(0);
    const unresolved = (await app.read(session.token)).orders[0];
    expect(unresolved.status).toBe("UNKNOWN");
    expect(unresolved.recovery).toMatchObject({ attempts: 1 });
    expect(Date.parse(unresolved.recovery!.nextAttemptAt)).toBeGreaterThan(now);
    await expect(app.submit(session.token, plan.id, 1)).rejects.toMatchObject({ status: 409 });
  });

  it("leases recovery so concurrent workers perform one lookup", async () => {
    const store = RecordStore.memory();
    let lookups = 0;
    const exchange: ExecutionAdapter = {
      environment: "DEMO",
      async submitSpotBuy() { throw new Error("Response lost"); },
      async fetchOrder(exchangeOrderId) { return { status: "UNKNOWN", exchangeOrderId }; },
      async lookupOrder(request) {
        lookups++;
        return {
          request,
          snapshot: {
            status: "FILLED", exchangeOrderId: `demo-${request.idempotencyKey}`,
            filledQuoteAmount: request.quoteAmount, receiptId: `receipt-${request.idempotencyKey}`,
          },
        };
      },
    };
    const { app, session, plan } = await approved(exchange, store);
    await expect(app.submit(session.token, plan.id, 1)).rejects.toThrow("Response lost");
    const attempt = (await app.read(session.token)).orders[0];
    const now = () => Date.parse(attempt.submittedAt) + 30_001;
    const results = await Promise.all([
      new RecoveryWorker(store, exchange, now).runOnce(),
      new RecoveryWorker(store, exchange, now).runOnce(),
    ]);
    expect(results.reduce((total, value) => total + value, 0)).toBe(1);
    expect(lookups).toBe(1);
  });

  it("lets another worker recover after a lease expires", async () => {
    const store = RecordStore.memory();
    let lookups = 0;
    let finishFirst: ((
      result: { request: { idempotencyKey: string; accountId: string; baseAsset: string; quoteAsset: string; quoteAmount: string }; snapshot: { status: "UNKNOWN"; exchangeOrderId: string } },
    ) => void) | undefined;
    const firstLookup = new Promise<{
      request: { idempotencyKey: string; accountId: string; baseAsset: string; quoteAsset: string; quoteAmount: string };
      snapshot: { status: "UNKNOWN"; exchangeOrderId: string };
    }>((resolve) => {
      finishFirst = resolve;
    });
    const exchange: ExecutionAdapter = {
      environment: "DEMO",
      async submitSpotBuy() { throw new Error("Response lost"); },
      async fetchOrder(exchangeOrderId) { return { status: "UNKNOWN", exchangeOrderId }; },
      async lookupOrder(request) {
        lookups++;
        if (lookups === 1) return firstLookup;
        return {
          request,
          snapshot: {
            status: "FILLED", exchangeOrderId: `demo-${request.idempotencyKey}`,
            filledQuoteAmount: request.quoteAmount, receiptId: `receipt-${request.idempotencyKey}`,
          },
        };
      },
    };
    const { app, session, plan } = await approved(exchange, store);
    await expect(app.submit(session.token, plan.id, 1)).rejects.toThrow("Response lost");
    const attempt = (await app.read(session.token)).orders[0];
    const clock = { now: Date.parse(attempt.submittedAt) + 30_001 };
    const first = new RecoveryWorker(store, exchange, () => clock.now).runOnce();
    await waitUntil(() => lookups === 1);
    clock.now += 30_001;
    expect(await new RecoveryWorker(store, exchange, () => clock.now).runOnce()).toBe(1);
    expect((await app.read(session.token)).orders[0].status).toBe("FILLED");
    finishFirst!({
      request: {
        idempotencyKey: attempt.id, accountId: "demo-account",
        baseAsset: "BTC", quoteAsset: "USDT", quoteAmount: "250",
      },
      snapshot: { status: "UNKNOWN", exchangeOrderId: "stale-lookup" },
    });
    expect(await first).toBe(0);
    const recovered = (await app.read(session.token)).orders[0];
    expect(recovered.status).toBe("FILLED");
    expect(recovered.exchangeOrderId).toBe(`demo-${attempt.id}`);
    expect(lookups).toBe(2);
  });

  it("starts recovery immediately and does not look up after shutdown", async () => {
    const store = RecordStore.memory();
    let lookups = 0;
    const exchange: ExecutionAdapter = {
      environment: "DEMO",
      async submitSpotBuy() { throw new Error("Response lost"); },
      async fetchOrder(exchangeOrderId) { return { status: "UNKNOWN", exchangeOrderId }; },
      async lookupOrder() {
        lookups++;
        return undefined;
      },
    };
    const { app, session, plan } = await approved(exchange, store);
    await expect(app.submit(session.token, plan.id, 1)).rejects.toThrow("Response lost");
    const attempt = (await app.read(session.token)).orders[0];
    const worker = new RecoveryWorker(
      store,
      exchange,
      () => Date.parse(attempt.submittedAt) + 30_001,
    );
    worker.start();
    worker.start();
    await waitUntil(() => lookups >= 1);
    await worker.stop();
    const afterStop = lookups;
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(lookups).toBe(afterStop);
    expect((await app.read(session.token)).orders[0].status).toBe("UNKNOWN");
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

  it("reserves quote so overlapping submits cannot spend the same funds", async () => {
    const app = new WorkspaceBoundary(RecordStore.memory());
    const session = await app.openSession();
    const first = await app.create(session.token, { ...terms, quoteAmount: "300" });
    const second = await app.create(session.token, {
      ...terms,
      title: "ETH purchase",
      baseAsset: "ETH",
      quoteAmount: "300",
    });
    await app.review(session.token, first.id, 1);
    await app.approve(session.token, first.id, 1);
    await app.review(session.token, second.id, 1);
    await app.approve(session.token, second.id, 1);
    const results = await Promise.allSettled([
      app.submit(session.token, first.id, 1),
      app.submit(session.token, second.id, 1),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const state = await app.read(session.token);
    expect(state.reserved).toBe("300");
    expect(state.available).toBe("200");
  });

  it("rechecks execution policy at submit even after approval", async () => {
    const { app, session, plan } = await approved();
    await app.setExampleHold(session.token, true);
    await expect(app.submit(session.token, plan.id, 1)).rejects.toThrow(
      "available USDT balance",
    );
    expect((await app.read(session.token)).orders).toEqual([]);
  });

  it("blocks a disallowed asset at approval", async () => {
    const app = new WorkspaceBoundary(RecordStore.memory());
    const session = await app.openSession();
    const plan = await app.create(session.token, { ...terms, baseAsset: "DOGE" });
    await app.review(session.token, plan.id, 1);
    await expect(app.approve(session.token, plan.id, 1)).rejects.toThrow("DOGE is not allowed");
  });

  it("rejects a stale account snapshot", async () => {
    const store = RecordStore.memory();
    const { session, plan } = await approved(undefined, store);
    const stale: ExecutionAdapter = {
      environment: "DEMO",
      async submitSpotBuy() {
        return { status: "UNKNOWN", exchangeOrderId: "stale" };
      },
      async fetchOrder(exchangeOrderId) {
        return { status: "UNKNOWN", exchangeOrderId };
      },
      async accountSnapshot(accountId) {
        return {
          accountId,
          quoteAsset: "USDT",
          balance: "500",
          capturedAt: "2020-01-01T00:00:00.000Z",
          freshness: "STALE",
        };
      },
    };
    const app = new WorkspaceBoundary(store, stale);
    await expect(app.submit(session.token, plan.id, 1)).rejects.toThrow("not current enough");
  });

  it("does not enable live Binance execution without credentials", async () => {
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

  it("uses the live snapshot balance and still waits for a query before a receipt", async () => {
    const exchange: ExecutionAdapter = {
      environment: "LIVE",
      async submitSpotBuy() {
        return { status: "UNKNOWN", exchangeOrderId: "99" };
      },
      async fetchOrder(exchangeOrderId) {
        return {
          status: "FILLED",
          exchangeOrderId,
          filledQuoteAmount: "50",
          receiptId: `binance-${exchangeOrderId}`,
        };
      },
      async accountSnapshot(accountId) {
        return {
          accountId,
          quoteAsset: "USDT",
          balance: "80",
          capturedAt: new Date().toISOString(),
          freshness: "CURRENT",
        };
      },
    };
    const store = RecordStore.memory();
    const app = new WorkspaceBoundary(store, exchange);
    const session = await app.openSession();
    const plan = await app.create(session.token, { ...terms, quoteAmount: "50" });
    await app.review(session.token, plan.id, 1);
    await app.approve(session.token, plan.id, 1);
    expect((await app.read(session.token)).workspace.account.balance).toBe("80");
    const submitted = await app.submit(session.token, plan.id, 1);
    expect(submitted.environment).toBe("LIVE");
    expect(submitted.status).toBe("UNKNOWN");
    expect((await app.read(session.token)).reserved).toBe("50");
    const filled = await app.reconcile(session.token, submitted.id);
    expect(filled.status).toBe("FILLED");
    expect((await app.read(session.token)).activity[0]?.message).toContain("Binance order query");
  });

  it("refuses a live submit when Binance free quote is insufficient", async () => {
    let balance = "500";
    const exchange: ExecutionAdapter = {
      environment: "LIVE",
      async submitSpotBuy() {
        return { status: "UNKNOWN", exchangeOrderId: "99" };
      },
      async fetchOrder(exchangeOrderId) {
        return { status: "UNKNOWN", exchangeOrderId };
      },
      async accountSnapshot(accountId) {
        return {
          accountId,
          quoteAsset: "USDT",
          balance,
          capturedAt: new Date().toISOString(),
          freshness: "CURRENT",
        };
      },
    };
    const { app, session, plan } = await approved(exchange);
    balance = "10";
    await expect(app.submit(session.token, plan.id, 1)).rejects.toThrow(
      "available USDT balance",
    );
  });
});

describe("Live workspace snapshots", () => {
  it("loads the current exchange balance before rendering a live workspace", async () => {
    const store = RecordStore.memory();
    const exchange: ExecutionAdapter = {
      environment: "LIVE",
      async submitSpotBuy(request) {
        return { status: "UNKNOWN", exchangeOrderId: `live-${request.idempotencyKey}` };
      },
      async fetchOrder(exchangeOrderId) { return { status: "UNKNOWN", exchangeOrderId }; },
      async accountSnapshot(accountId) {
        return {
          accountId, quoteAsset: "USDT", balance: "9990.5",
          capturedAt: new Date().toISOString(), freshness: "CURRENT",
        };
      },
    };
    const app = new WorkspaceBoundary(store, exchange);
    const session = await app.openSession();
    const state = await app.read(session.token);
    expect(state.environment).toBe("LIVE");
    expect(state.workspace.account.balance).toBe("9990.5");
    expect(state.available).toBe("9990.5");
  });

  it("rejects a live snapshot for another account", async () => {
    const exchange: ExecutionAdapter = {
      environment: "LIVE",
      async submitSpotBuy(request) {
        return { status: "UNKNOWN", exchangeOrderId: `live-${request.idempotencyKey}` };
      },
      async fetchOrder(exchangeOrderId) { return { status: "UNKNOWN", exchangeOrderId }; },
      async accountSnapshot() {
        return {
          accountId: "another-account", quoteAsset: "USDT", balance: "500",
          capturedAt: new Date().toISOString(), freshness: "CURRENT",
        };
      },
    };
    const app = new WorkspaceBoundary(RecordStore.memory(), exchange);
    const session = await app.openSession();
    await expect(app.read(session.token)).rejects.toThrow("does not match this workspace");
  });
});
