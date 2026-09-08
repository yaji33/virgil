import { randomUUID } from "node:crypto";
import type { Mandate, Proposal } from "../types/mandate.js";
import type { Decision, RiskResult } from "../types/decision.js";

/**
 * Deterministic Policy Engine
 *
 */
export function evaluatePolicy(
  mandate: Mandate,
  proposal: Proposal,
  riskResults: Record<string, RiskResult>
): Decision {
  const reasons: string[] = [];
  let decision: Decision["decision"] = "APPROVE";

    // 1. Asset allowlist
  // Properly extract base asset (e.g. "DOGEUSDT" → "DOGE", "BTCUSDT" → "BTC")
  const baseAsset =
    proposal.symbol.replace(/USDT$|BUSD$|USDC$|USD$/i, "").replace(/BTC$|ETH$/i, "") ||
    proposal.symbol;

  const isAllowed = mandate.allowedAssets.some(
    (allowed) =>
      allowed === baseAsset ||
      allowed === proposal.symbol ||
      proposal.symbol === `${allowed}USDT` ||
      proposal.symbol === `${allowed}BUSD` ||
      proposal.symbol === `${allowed}USDC`
  );

  if (!isAllowed) {
    decision = "BLOCK";
    reasons.push(
      `Asset ${proposal.symbol} (base: ${baseAsset}) is not in the allowed list: ${mandate.allowedAssets.join(", ")}`
    );
  }

  // 2. Product type
  if (!mandate.allowedProducts.includes(proposal.product)) {
    decision = "BLOCK";
    reasons.push(`Product ${proposal.product} is not allowed. Allowed: ${mandate.allowedProducts.join(", ")}`);
  }

  // 3. Position size
  const sizeUsd = proposal.quoteQuantityUsd ?? 0;
  if (sizeUsd > mandate.maxPositionSizeUsd) {
    decision = "BLOCK";
    reasons.push(`Position size $${sizeUsd} exceeds maxPositionSizeUsd $${mandate.maxPositionSizeUsd}`);
  }

  // 4. Human approval threshold
  if (
    mandate.requireHumanApprovalAboveUsd !== undefined &&
    sizeUsd > mandate.requireHumanApprovalAboveUsd &&
    decision === "APPROVE"
  ) {
    decision = "NEEDS_HUMAN";
    reasons.push(`Size $${sizeUsd} exceeds human approval threshold $${mandate.requireHumanApprovalAboveUsd}`);
  }

  // 5. Aggregate risk agent failures
  for (const [name, result] of Object.entries(riskResults)) {
    if (!result.passed) {
      decision = "BLOCK";
      reasons.push(`[${name}] ${result.message}`);
    }
  }

  // 6. Blocked actions
  if (mandate.blockedActions?.includes(proposal.action)) {
    decision = "BLOCK";
    reasons.push(`Action ${proposal.action} is explicitly blocked by mandate`);
  }

  if (reasons.length === 0 && decision === "APPROVE") {
    reasons.push("All policy checks passed");
  }

  return {
    decision,
    reasons,
    riskReport: riskResults,
    auditId: randomUUID(),
    timestamp: new Date().toISOString(),
    proposalId: proposal.id,
  };
}
