import { describe, expect, it } from "vitest";
import { evaluateExecution } from "../src/policy/execution.js";
import type { PlanTerms } from "../src/plans/plan.js";

const terms: PlanTerms = {
  title: "BTC purchase",
  intent: "Buy BTC once",
  accountId: "demo-account",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  quoteAmount: "250",
  product: "SPOT",
  action: "BUY",
  schedule: "ONCE",
};

describe("Execution policy", () => {
  it("allows a one-time spot buy within available capital", () => {
    expect(evaluateExecution(terms, "500").decision).toBe("ALLOW");
  });

  it("blocks a disallowed asset even when capital is available", () => {
    const decision = evaluateExecution({ ...terms, baseAsset: "DOGE" }, "500");
    expect(decision.decision).toBe("BLOCK");
    expect(decision.reasons[0]).toContain("DOGE is not allowed");
  });

  it("blocks when the amount exceeds available capital", () => {
    const decision = evaluateExecution(terms, "100");
    expect(decision.decision).toBe("BLOCK");
    expect(decision.reasons[0]).toContain("available USDT balance");
  });
});
