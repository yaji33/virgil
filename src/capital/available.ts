import { addQuote, subtractQuote } from "../money/decimal.js";
import type { Order } from "../execution/order.js";
import type { WorkspaceRecord } from "../records/schema.js";

export function reservedQuote(order: Order): string {
  if (order.status === "UNKNOWN") return order.approvedPlan?.terms.quoteAmount ?? "0";
  if (order.status === "PARTIAL") return order.remainingQuoteAmount;
  return "0";
}

export function reservedTotal(orders: Order[], workspaceId: string): string {
  return orders
    .filter((order) => order.workspaceId === workspaceId)
    .reduce((total, order) => addQuote(total, reservedQuote(order)), "0");
}

export function availableQuote(workspace: WorkspaceRecord, orders: Order[]): string {
  return subtractQuote(
    subtractQuote(workspace.account.balance, workspace.exampleHold),
    reservedTotal(orders, workspace.id),
  );
}
