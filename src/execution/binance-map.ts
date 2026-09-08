import { quoteUnits, subtractQuote } from "../money/decimal.js";
import type { ExchangeSnapshot } from "./adapter.js";

export interface BinanceOrderView {
  orderId?: unknown;
  status?: unknown;
  cummulativeQuoteQty?: unknown;
  cumulativeQuoteQty?: unknown;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

function positive(amount: string): boolean {
  return /[1-9]/.test(amount);
}

export function filledQuoteQty(order: BinanceOrderView): string {
  const filled = text(order.cummulativeQuoteQty) || text(order.cumulativeQuoteQty) || "0";
  return filled;
}

export function exchangeSnapshotFromBinance(
  order: BinanceOrderView,
  quoteAmount: string,
): ExchangeSnapshot {
  const exchangeOrderId = text(order.orderId);
  if (!exchangeOrderId) {
    return { status: "UNKNOWN", exchangeOrderId: "unknown" };
  }
  const status = text(order.status);
  const filled = filledQuoteQty(order);
  if (status === "NEW" || status === "PENDING_NEW" || status === "PENDING_CANCEL") {
    return { status: "UNKNOWN", exchangeOrderId };
  }
  if (
    (status === "PARTIALLY_FILLED" ||
      status === "FILLED" ||
      status === "CANCELED" ||
      status === "EXPIRED" ||
      status === "EXPIRED_IN_MATCH") &&
    positive(filled)
  ) {
    if (status === "FILLED" || quoteUnits(filled) >= quoteUnits(quoteAmount)) {
      return {
        status: "FILLED",
        exchangeOrderId,
        filledQuoteAmount: filled,
        receiptId: `binance-${exchangeOrderId}`,
      };
    }
    if (status === "PARTIALLY_FILLED" || status === "CANCELED" || status === "EXPIRED" || status === "EXPIRED_IN_MATCH") {
      return {
        status: "PARTIAL",
        exchangeOrderId,
        filledQuoteAmount: filled,
        remainingQuoteAmount: subtractQuote(quoteAmount, filled),
      };
    }
  }
  if (
    status === "CANCELED" ||
    status === "REJECTED" ||
    status === "EXPIRED" ||
    status === "EXPIRED_IN_MATCH"
  ) {
    return {
      status: "REJECTED",
      exchangeOrderId,
      reason: "Binance rejected or expired this order. No fill is recorded.",
    };
  }
  return { status: "UNKNOWN", exchangeOrderId };
}
