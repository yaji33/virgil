import { describe, expect, it } from "vitest";
import { approvePlan, createPlan, requestPlanReview, revisePlan } from "../src/plans/lifecycle.js";
import { PlanSchema, PlanTermsSchema, type Plan, type PlanTerms } from "../src/plans/plan.js";

const terms: PlanTerms = {
  title: "Buy BTC",
  intent: "Buy 150 USDT of BTC once",
  accountId: "account-1",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  quoteAmount: "150",
  product: "SPOT",
  action: "BUY",
  schedule: "ONCE",
};

function draft(source: Plan["source"] = { kind: "CONSUMER", userId: "user-1" }): Plan {
  return createPlan({ workspaceId: "workspace-1", source, terms });
}

describe("Plan lifecycle", () => {
  it.each<Plan["source"]>([
    { kind: "CONSUMER", userId: "user-1" },
    { kind: "INTEGRATION", integrationId: "strategy-1" },
  ])("uses the same review flow for $kind plans", (source) => {
    const plan = draft(source);
    const review = requestPlanReview(plan, 1);
    const approved = approvePlan(review, 1, "user-1");
    expect(approved.status).toBe("APPROVED");
    expect(approved.source).toEqual(source);
    expect(approved).toMatchObject({ approval: { userId: "user-1", revision: 1 } });
    expect(plan.status).toBe("DRAFT");
    expect(review.status).toBe("IN_REVIEW");
  });

  it("invalidates approval when the amount changes", () => {
    const approved = approvePlan(requestPlanReview(draft(), 1), 1, "user-1");
    const revised = revisePlan(approved, 1, { ...terms, quoteAmount: "200" });
    expect(revised).toMatchObject({ id: approved.id, revision: 2, status: "DRAFT" });
    expect(revised).not.toHaveProperty("approval");
    expect(approved.terms.quoteAmount).toBe("150");
    const review = requestPlanReview(revised, 2);
    expect(() => approvePlan(review, 1, "user-1")).toThrow("Plan changed");
    expect(approvePlan(review, 2, "user-1").status).toBe("APPROVED");
  });

  it("rejects skipped and repeated transitions", () => {
    const plan = draft();
    expect(() => approvePlan(plan, 1, "user-1")).toThrow("in review");
    const review = requestPlanReview(plan, 1);
    expect(() => requestPlanReview(review, 1)).toThrow("draft");
    const approved = approvePlan(review, 1, "user-1");
    expect(() => approvePlan(approved, 1, "user-1")).toThrow("in review");
  });

  it("rejects stale revisions for edits and review", () => {
    expect(() => revisePlan(draft(), 2, terms)).toThrow("Plan changed");
    expect(() => requestPlanReview(draft(), 2)).toThrow("Plan changed");
  });

  it("rejects approval records for another revision", () => {
    const approved = approvePlan(requestPlanReview(draft(), 1), 1, "user-1");
    expect(PlanSchema.safeParse({ ...approved, revision: 2 }).success).toBe(false);
  });

  it("copies input terms rather than retaining mutable references", () => {
    const input = { ...terms };
    const plan = createPlan({
      workspaceId: "workspace-1",
      source: { kind: "CONSUMER", userId: "user-1" },
      terms: input,
    });
    input.quoteAmount = "999";
    expect(plan.terms.quoteAmount).toBe("150");
  });
});

describe("Plan terms", () => {
  it.each(["0", "0.000", "-1", "NaN", "Infinity", "1e3", "01", " 1", "1.", "0.0000000000000000001"])(
    "rejects invalid quote amount %s", (quoteAmount) => {
      expect(PlanTermsSchema.safeParse({ ...terms, quoteAmount }).success).toBe(false);
    },
  );

  it("preserves decimal precision without converting to a number", () => {
    const quoteAmount = "12345678901234567890.123456789012345678";
    expect(PlanTermsSchema.parse({ ...terms, quoteAmount }).quoteAmount).toBe(quoteAmount);
  });

  it("rejects identical assets and unsupported execution options", () => {
    expect(PlanTermsSchema.safeParse({ ...terms, baseAsset: "USDT" }).success).toBe(false);
    expect(PlanTermsSchema.safeParse({ ...terms, leverage: 10 }).success).toBe(false);
    expect(PlanTermsSchema.safeParse({ ...terms, schedule: "WEEKLY" }).success).toBe(false);
  });
});
