import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BoundaryError } from "../src/boundary/errors.js";
import { WorkspaceBoundary } from "../src/boundary/workspace.js";
import type { PlanTerms } from "../src/plans/plan.js";
import { RecordStore } from "../src/records/store.js";

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

function boundary(store = RecordStore.memory()): WorkspaceBoundary {
  return new WorkspaceBoundary(store);
}

describe("Authenticated workspace boundary", () => {
  it("rejects callers without a session", async () => {
    const app = boundary();
    await expect(app.read(undefined)).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
  });

  it("scopes plans and accounts to the signed-in workspace", async () => {
    const app = boundary();
    const first = await app.openSession();
    const second = await app.openSession();
    const plan = await app.create(first.token, terms);
    expect(plan.source).toEqual({
      kind: "CONSUMER",
      userId: first.actor.userId,
    });
    expect(plan.terms.accountId).toBe("demo-account");
    expect(plan.workspaceId).toBe(first.actor.workspaceId);
    await expect(app.review(second.token, plan.id, 1)).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
    const other = await app.read(second.token);
    expect(other.plans).toEqual([]);
  });

  it("binds approval to the authenticated user", async () => {
    const app = boundary();
    const session = await app.openSession();
    const plan = await app.create(session.token, terms);
    await app.review(session.token, plan.id, 1);
    const approved = await app.approve(session.token, plan.id, 1);
    expect(approved.status).toBe("APPROVED");
    if (approved.status === "APPROVED") {
      expect(approved.approval.userId).toBe(session.actor.userId);
    }
  });

  it("rejects stale revisions when two writes race", async () => {
    const app = boundary();
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
  });

  it("rejects invalid transitions and stale approvals", async () => {
    const app = boundary();
    const session = await app.openSession();
    const plan = await app.create(session.token, terms);
    await expect(app.approve(session.token, plan.id, 1)).rejects.toMatchObject({
      status: 400,
      code: "INVALID",
    });
    await app.review(session.token, plan.id, 1);
    await app.revise(session.token, plan.id, 1, { ...terms, quoteAmount: "200" });
    await expect(app.approve(session.token, plan.id, 1)).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
    });
  });

  it("checks persisted decimal balances before approval", async () => {
    const app = boundary();
    const session = await app.openSession();
    const plan = await app.create(session.token, terms);
    await app.review(session.token, plan.id, 1);
    await app.setExampleHold(session.token, true);
    await expect(app.approve(session.token, plan.id, 1)).rejects.toThrow(
      "illustrative available balance",
    );
  });

  it("reloads persisted workspace records from disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "virgil-records-"));
    const file = join(dir, "workspace.json");
    try {
      const first = new WorkspaceBoundary(await RecordStore.open(file));
      const session = await first.openSession();
      await first.create(session.token, terms);
      const second = new WorkspaceBoundary(await RecordStore.open(file));
      const restored = await second.read(session.token);
      expect(restored.plans).toHaveLength(1);
      expect(restored.plans[0]?.terms.quoteAmount).toBe("250");
      expect(restored.workspace.account.balance).toBe("500");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
