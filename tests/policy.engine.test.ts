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
