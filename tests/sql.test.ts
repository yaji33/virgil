import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BoundaryError } from "../src/boundary/errors.js";
import { WorkspaceBoundary } from "../src/boundary/workspace.js";
import type { PlanTerms } from "../src/plans/plan.js";
import { SqlStore } from "../src/records/sql.js";

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
          expect((await restored.reconcile(session.token, state.orders[0].id)).status).toBe("FILLED");
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
});
