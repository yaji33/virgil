import { describe, it, expect } from "vitest";
import { evaluatePolicy } from "../src/policy/engine.js";
import { evaluatePositionSize } from "../src/risk/position-size.js";
import type { Mandate, Proposal } from "../src/types/mandate.js";

const baseMandate: Mandate = {
  name: "Test Conservative",
  maxCapitalUsd: 10000,
  maxPositionSizeUsd: 1000,
  maxDailyLossUsd: 300,
  allowedAssets: ["BTC", "ETH", "USDT"],
  allowedProducts: ["SPOT"],
  requireHumanApprovalAboveUsd: 500,
  maxConcentrationPct: 40,
  blockedActions: [],
};

describe("Policy Engine", () => {
  it("blocks failed risk checks even above the human approval threshold", () => {
    const proposal: Proposal = {
      action: "BUY",
      symbol: "ETHUSDT",
      product: "SPOT",
      quoteQuantityUsd: 750,
    };
    const result = evaluatePositionSize(baseMandate, proposal, 9500);
    expect(result.passed).toBe(false);
    const decision = evaluatePolicy(baseMandate, proposal, { "position-size": result });
    expect(decision.decision).toBe("BLOCK");
    expect(decision.reasons).toContain(`[position-size] ${result.message}`);
  });

  it("approves a valid small spot buy", () => {
    const proposal: Proposal = {
      action: "BUY",
      symbol: "BTCUSDT",
      product: "SPOT",
      quoteQuantityUsd: 200,
    };

    const riskResults = {
      "position-size": evaluatePositionSize(baseMandate, proposal, 0),
    };

    const decision = evaluatePolicy(baseMandate, proposal, riskResults);

    expect(decision.decision).toBe("APPROVE");
    expect(decision.reasons.some((r) => r.includes("passed"))).toBe(true);
    expect(decision.auditId).toBeDefined();
  });

  it("blocks asset not in allowlist", () => {
    const proposal: Proposal = {
      action: "BUY",
      symbol: "DOGEUSDT",
      product: "SPOT",
      quoteQuantityUsd: 100,
    };

    const riskResults = {
      "position-size": evaluatePositionSize(baseMandate, proposal, 0),
    };

    const decision = evaluatePolicy(baseMandate, proposal, riskResults);

    expect(decision.decision).toBe("BLOCK");
    expect(decision.reasons.some((r) => r.includes("not in the allowed list"))).toBe(true);
  });

  it("blocks size above maxPositionSizeUsd", () => {
    const proposal: Proposal = {
      action: "BUY",
      symbol: "BTCUSDT",
      product: "SPOT",
      quoteQuantityUsd: 2500,
    };

    const riskResults = {
      "position-size": evaluatePositionSize(baseMandate, proposal, 0),
    };

    const decision = evaluatePolicy(baseMandate, proposal, riskResults);

    expect(decision.decision).toBe("BLOCK");
  });

  it("requires human approval above threshold", () => {
    const proposal: Proposal = {
      action: "BUY",
      symbol: "ETHUSDT",
      product: "SPOT",
      quoteQuantityUsd: 750,
    };

    const riskResults = {
      "position-size": evaluatePositionSize(baseMandate, proposal, 0),
    };

    const decision = evaluatePolicy(baseMandate, proposal, riskResults);

    expect(decision.decision).toBe("NEEDS_HUMAN");
  });

  it("blocks futures when only SPOT is allowed", () => {
    const proposal: Proposal = {
      action: "BUY",
      symbol: "BTCUSDT",
      product: "FUTURES",
      quoteQuantityUsd: 100,
    };

    const riskResults = {
      "position-size": evaluatePositionSize(baseMandate, proposal, 0),
    };

    const decision = evaluatePolicy(baseMandate, proposal, riskResults);

    expect(decision.decision).toBe("BLOCK");
    expect(decision.reasons.some((r) => r.includes("Product FUTURES"))).toBe(true);
  });
});
