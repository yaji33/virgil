import { invalid } from "../boundary/errors.js";
import { quoteUnits, subtractQuote } from "../money/decimal.js";
import type { Database } from "../records/schema.js";
import type { ExecutionAdapter, ExchangeSnapshot, SpotBuyRequest } from "./adapter.js";
import { OrderSchema, type Order } from "./order.js";

export function unresolved(order: Order): boolean {
  return order.status === "UNKNOWN" || order.status === "PARTIAL";
}

export function pendingAcknowledgement(order: Order): boolean {
  return order.exchangeOrderId === `pending-${order.id}`;
}

export function orderRequest(order: Order): SpotBuyRequest | undefined {
  const plan = order.approvedPlan;
  if (!plan) return undefined;
  if (plan.status !== "APPROVED" || plan.id !== order.planId ||
    plan.workspaceId !== order.workspaceId || plan.revision !== order.planRevision) {
    throw invalid("Execution snapshot does not match the order.");
  }
  return {
    idempotencyKey: order.id, accountId: plan.terms.accountId,
    baseAsset: plan.terms.baseAsset, quoteAsset: plan.terms.quoteAsset,
    quoteAmount: plan.terms.quoteAmount,
  };
}

export async function lookupSnapshot(exchange: ExecutionAdapter, order: Order): Promise<ExchangeSnapshot | undefined> {
  if (exchange.environment !== order.environment) throw invalid("Execution environment does not match the order.");
  const request = orderRequest(order);
  if (!pendingAcknowledgement(order)) {
    const snapshot = await exchange.fetchOrder(order.exchangeOrderId, request);
    if (snapshot.exchangeOrderId !== order.exchangeOrderId) {
      throw invalid("Exchange order identity changed during reconciliation.");
    }
    return snapshot;
  }
  if (!request || !exchange.lookupOrder) return undefined;
  const result = await exchange.lookupOrder(request);
  if (!result) return undefined;
  if (Object.keys(request).some((key) =>
    result.request[key as keyof SpotBuyRequest] !== request[key as keyof SpotBuyRequest]) ||
    result.snapshot.exchangeOrderId.startsWith("pending-")) {
    throw invalid("Exchange lookup identity does not match the execution attempt.");
  }
  return result.snapshot;
}

export function recordExchange(db: Database, orderId: string, snapshot: ExchangeSnapshot): Order {
  const index = db.orders.findIndex((order) => order.id === orderId);
  if (index < 0) throw invalid("Execution attempt is no longer available.");
  const current = db.orders[index];
  if (!unresolved(current)) return current;
  if (!pendingAcknowledgement(current) && snapshot.exchangeOrderId !== current.exchangeOrderId) {
    throw invalid("Exchange order identity changed during reconciliation.");
  }
  const next = OrderSchema.parse({
    id: current.id, workspaceId: current.workspaceId, planId: current.planId,
    planRevision: current.planRevision, approvedPlan: current.approvedPlan,
    environment: current.environment, submittedAt: current.submittedAt,
    recovery: current.recovery, updatedAt: current.updatedAt, ...snapshot,
  });
  const request = orderRequest(current);
  if (request && (next.status === "FILLED" || next.status === "PARTIAL")) {
    const total = quoteUnits(request.quoteAmount);
    const filled = quoteUnits(next.filledQuoteAmount);
    if (filled > total || (next.status === "PARTIAL" &&
      (quoteUnits(next.remainingQuoteAmount) === 0n || filled + quoteUnits(next.remainingQuoteAmount) !== total))) {
      throw invalid("Exchange quantities do not match the approved amount.");
    }
  }
  if (current.status === "PARTIAL") {
    if (next.status === "UNKNOWN") return current;
    if (next.status === "REJECTED" || quoteUnits(next.filledQuoteAmount) < quoteUnits(current.filledQuoteAmount)) {
      throw invalid("Exchange reconciliation cannot discard a recorded fill.");
    }
  }
  if (JSON.stringify(next) === JSON.stringify(current)) return current;
  next.updatedAt = new Date().toISOString();
  applyFill(db, current, next);
  db.orders[index] = next;
  const plan = current.approvedPlan ?? db.plans.find((item) => item.id === current.planId);
  db.activity.unshift({
    id: globalThis.crypto.randomUUID(), workspaceId: current.workspaceId,
    planId: current.planId, revision: current.planRevision,
    title: plan?.terms.title ?? "Execution attempt", time: next.updatedAt,
    message: next.status === "FILLED"
      ? current.environment === "LIVE"
        ? "Exchange receipt recorded from Binance order query."
        : "Demo receipt recorded. Illustrative balance reflects the fill. This is not a Binance confirmation."
      : next.status === "REJECTED" ? "Order rejected after reconciliation. No fill is recorded."
        : next.status === "PARTIAL" ? "Partial fill recorded. Remaining quote stays reserved."
          : "Order submitted. Reconciliation is required before treating it as filled.",
  });
  return next;
}

function applyFill(db: Database, current: Order, next: Order): void {
  const workspace = db.workspaces.find((item) => item.id === current.workspaceId);
  if (!workspace) return;
  const before = current.status === "PARTIAL" ? current.filledQuoteAmount : "0";
  const after = next.status === "FILLED" || next.status === "PARTIAL" ? next.filledQuoteAmount : "0";
  if (quoteUnits(after) > quoteUnits(before)) {
    workspace.account.balance = subtractQuote(workspace.account.balance, subtractQuote(after, before));
  }
}
