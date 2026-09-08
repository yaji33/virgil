import { exceedsQuote } from "../money/decimal.js";
import type { PlanTerms } from "../plans/plan.js";

export const EXECUTION_ASSETS = ["BTC", "ETH", "BNB"] as const;
export const EXECUTION_QUOTE = "USDT";

export interface ExecutionDecision {
  decision: "ALLOW" | "BLOCK";
  reasons: string[];
  auditId: string;
  timestamp: string;
}

export function evaluateExecution(terms: PlanTerms, available: string): ExecutionDecision {
  const reasons: string[] = [];
  if (terms.product !== "SPOT" || terms.action !== "BUY" || terms.schedule !== "ONCE") {
    reasons.push("Only a one-time spot buy can be executed.");
  }
  if (terms.quoteAsset !== EXECUTION_QUOTE) {
    reasons.push("Quote asset must be USDT.");
  }
  if (!(EXECUTION_ASSETS as readonly string[]).includes(terms.baseAsset)) {
    reasons.push(`${terms.baseAsset} is not allowed for execution.`);
  }
  if (exceedsQuote(terms.quoteAmount, available)) {
    reasons.push("The amount exceeds the available USDT balance. Adjust the plan before submitting.");
  }
  return {
    decision: reasons.length ? "BLOCK" : "ALLOW",
    reasons: reasons.length ? reasons : ["Execution checks passed."],
    auditId: globalThis.crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };
}
