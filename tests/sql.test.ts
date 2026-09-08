import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BoundaryError } from "../src/boundary/errors.js";
import { WorkspaceBoundary } from "../src/boundary/workspace.js";
import type { PlanTerms } from "../src/plans/plan.js";
import { SqlStore } from "../src/records/sql.js";
import { DemoExchange } from "../src/execution/demo.js";
import { RecoveryWorker } from "../src/execution/recovery.js";

const terms: PlanTerms = {
  title: "BTC purchase",
  intent: "Buy 250 USDT of BTC once",
  accountId: "foreign-account",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  quoteAmount: "250",
  product: "SPOT",
  action: "BUY",
  schedule: "ONCE",
};

describe("SQL workspace records", () => {
  it("persists only one attempt for concurrent submissions", async () => {
    const store = await SqlStore.memory();
    try {
      const app = new WorkspaceBoundary(store);
      const session = await app.openSession();
      const plan = await app.create(session.token, terms);
      await app.review(session.token, plan.id, 1);
      await app.approve(session.token, plan.id, 1);
      const results = await Promise.allSettled([
        app.submit(session.token, plan.id, 1), app.submit(session.token, plan.id, 1),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect((await app.read(session.token)).orders).toHaveLength(1);
    } finally {
      await store.close();
    }
  }, 30_000);

  it(
    "rejects stale revisions when two writes race",
    async () => {
      const store = await SqlStore.memory();
      try {
        const app = new WorkspaceBoundary(store);
        const session = await app.openSession();
        const plan = await app.create(session.token, terms);
        const results = await Promise.allSettled([
          app.revise(session.token, plan.id, 1, { ...terms, quoteAmount: "100" }),
          app.revise(session.token, plan.id, 1, { ...terms, quoteAmount: "120" }),
        ]);
        const accepted = results.filter((result) => result.status === "fulfilled");
        const rejected = results.filter((result) => result.status === "rejected");
        expect(accepted).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
          BoundaryError,
        );
        expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
          status: 409,
          code: "CONFLICT",
        });
      } finally {
        await store.close();
      }
    },
    30_000,
  );

  it(
    "reloads persisted workspace and order records",
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "virgil-sql-"));
      const first = await SqlStore.open(dir);
      try {
        const app = new WorkspaceBoundary(first);
        const session = await app.openSession();
        const plan = await app.create(session.token, terms);
        await app.review(session.token, plan.id, 1);
        await app.approve(session.token, plan.id, 1);
        await app.submit(session.token, plan.id, 1);
        await first.close();
        const second = await SqlStore.open(dir);
        try {
          const restored = new WorkspaceBoundary(second);
          const state = await restored.read(session.token);
          expect(state.plans).toHaveLength(1);
          expect(state.plans[0]?.status).toBe("APPROVED");
          expect(state.plans[0]?.terms.quoteAmount).toBe("250");
          expect(state.workspace.account.balance).toBe("500");
          expect(state.orders).toHaveLength(1);
          expect(state.orders[0]?.status).toBe("UNKNOWN");
          expect(state.orders[0].approvedPlan?.terms.quoteAmount).toBe("250");
          expect(state.reserved).toBe("250");
          expect(state.available).toBe("250");
          expect(state.planHistory.map((entry) => entry.plan.status)).toEqual([
            "DRAFT", "IN_REVIEW", "APPROVED",
          ]);
          expect((await restored.reconcile(session.token, state.orders[0].id)).status).toBe("FILLED");
          const settled = await restored.read(session.token);
          expect(settled.workspace.account.balance).toBe("250");
          expect(settled.reserved).toBe("0");
          expect(settled.available).toBe("250");
        } finally {
          await second.close();
        }
      } finally {
        await first.close().catch(() => undefined);
        await rm(dir, { recursive: true, force: true });
      }
    },
    30_000,
  );

  it("rejects changes to immutable history", async () => {
    const store = await SqlStore.memory();
    try {
      const app = new WorkspaceBoundary(store);
      const session = await app.openSession();
      await app.create(session.token, terms);
      await expect(store.transaction((db) => {
        db.planHistory[0].plan.terms.quoteAmount = "1";
      })).rejects.toThrow("planHistory records are immutable");
    } finally {
      await store.close();
    }
  }, 30_000);

  it("recovers a lost acknowledgement after a store restart", async () => {
    const dir = await mkdtemp(join(tmpdir(), "virgil-sql-recover-"));
    const first = await SqlStore.open(dir);
    try {
      const exchange = new DemoExchange("filled", first);
      const submit = exchange.submitSpotBuy.bind(exchange);
      exchange.submitSpotBuy = async (request) => {
        await submit(request);
        throw new Error("Acknowledgement lost");
      };
      const app = new WorkspaceBoundary(first, exchange);
      const session = await app.openSession();
      const plan = await app.create(session.token, terms);
      await app.review(session.token, plan.id, 1);
      await app.approve(session.token, plan.id, 1);
      await expect(app.submit(session.token, plan.id, 1)).rejects.toThrow("Acknowledgement lost");
      const attempt = (await app.read(session.token)).orders[0];
      await first.close();
      const second = await SqlStore.open(dir);
      try {
        const worker = new RecoveryWorker(
          second,
          new DemoExchange("filled", second),
          () => Date.parse(attempt.submittedAt) + 30_001,
        );
        expect(await worker.runOnce()).toBe(1);
        const recovered = await new WorkspaceBoundary(second).read(session.token);
        expect(recovered.orders[0]?.status).toBe("FILLED");
        expect(recovered.orders[0]?.exchangeOrderId).toBe(`demo-${attempt.id}`);
        expect(recovered.planHistory).toHaveLength(3);
      } finally {
        await second.close();
      }
    } finally {
      await first.close().catch(() => undefined);
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
