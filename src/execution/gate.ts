import { exceedsQuote } from "../money/decimal.js";
import type { Plan } from "../plans/plan.js";
import { conflict, invalid } from "../boundary/errors.js";
import type { Order } from "./order.js";

export function orderForRevision(
  orders: Order[],
  planId: string,
  planRevision: number,
): Order | undefined {
  const matching = orders.filter((order) => order.planId === planId);
  return matching.find((order) => order.status === "UNKNOWN" || order.status === "PARTIAL")
    ?? matching.find((order) => order.planRevision === planRevision && order.status === "FILLED")
    ?? matching.find((order) => order.planRevision === planRevision);
}

export function assertCanSubmit(
  plan: Plan,
  available: string,
  orders: Order[],
): void {
  if (plan.status !== "APPROVED") {
    throw invalid("Only approved terms can be submitted.");
  }
  if (exceedsQuote(plan.terms.quoteAmount, available)) {
    throw invalid(
      "The amount exceeds the available USDT balance. Adjust the plan before submitting.",
    );
  }
  const existing = orderForRevision(orders, plan.id, plan.revision);
  if (!existing || existing.status === "REJECTED") return;
  if (existing.status === "FILLED") {
    throw conflict("This revision already has a verified receipt.");
  }
  throw conflict(
    "An order is already in flight. Reconcile it before submitting again.",
  );
}
