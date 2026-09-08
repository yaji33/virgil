import { approvePlan, createPlan, requestPlanReview, revisePlan } from "../src/plans/lifecycle.js";

const plan = createPlan({
  workspaceId: "demo-workspace",
  source: { kind: "INTEGRATION", integrationId: "btc-strategy" },
  terms: {
    title: "Buy BTC",
    intent: "Buy 150 USDT of BTC once",
    accountId: "demo-account",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    quoteAmount: "150",
    product: "SPOT",
    action: "BUY",
    schedule: "ONCE",
  },
});

const review = requestPlanReview(plan, 1);
const approved = approvePlan(review, 1, "demo-user");
const revised = revisePlan(approved, 1, {
  ...plan.terms,
  intent: "Buy 200 USDT of BTC once",
  quoteAmount: "200",
});

console.log("Virgil plan lifecycle demo - local simulation, no orders submitted");
for (const snapshot of [plan, review, approved, revised]) {
  console.log(JSON.stringify(snapshot, null, 2));
}
console.log("Changed terms require a new review and approval.");
