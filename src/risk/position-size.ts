import type { Mandate, Proposal } from "../types/mandate.js";
import type { RiskResult } from "../types/decision.js";

/**
 * Position Size Risk Agent
 * Evaluates whether the proposed size is acceptable under the mandate and current context.
 */
export function evaluatePositionSize(
  mandate: Mandate,
  proposal: Proposal,
  currentExposureUsd: number = 0
): RiskResult {
  const sizeUsd = proposal.quoteQuantityUsd ?? 0;
  const remaining = mandate.maxCapitalUsd - currentExposureUsd;

  if (sizeUsd <= 0) {
    return {
      agent: "position-size",
      passed: false,
      message: "Position size must be positive",
      details: { sizeUsd },
    };
  }

  if (sizeUsd > mandate.maxPositionSizeUsd) {
    return {
      agent: "position-size",
      passed: false,
      score: 0,
      message: `Size $${sizeUsd.toFixed(2)} exceeds max position size $${mandate.maxPositionSizeUsd}`,
      details: { sizeUsd, max: mandate.maxPositionSizeUsd },
    };
  }

  if (sizeUsd > remaining) {
    return {
      agent: "position-size",
      passed: false,
      score: 0.2,
      message: `Size $${sizeUsd.toFixed(2)} would exceed remaining capital $${remaining.toFixed(2)}`,
      details: { sizeUsd, remaining, maxCapital: mandate.maxCapitalUsd },
    };
  }

  const utilization = sizeUsd / mandate.maxPositionSizeUsd;

  return {
    agent: "position-size",
    passed: true,
    score: 1 - utilization,
    message: `Position size within limits (${(utilization * 100).toFixed(1)}% of max)`,
    details: { sizeUsd, utilization },
  };
}
