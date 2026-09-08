import { formatQuote, quoteUnits, subtractQuote } from "../money/decimal.js";
import type { ExecutionAdapter, ExchangeSnapshot, SpotBuyRequest } from "./adapter.js";

export type DemoOutcome = "unknown" | "rejected" | "partial" | "filled";

export class DemoExchange implements ExecutionAdapter {
  readonly environment = "DEMO" as const;
  private readonly submitted = new Map<string, SpotBuyRequest>();

  constructor(private readonly fetchOutcome: DemoOutcome = "filled") {}

  async submitSpotBuy(request: SpotBuyRequest): Promise<ExchangeSnapshot> {
    const exchangeOrderId = `demo-${request.idempotencyKey}`;
    this.submitted.set(exchangeOrderId, request);
    return { status: "UNKNOWN", exchangeOrderId };
  }

  async fetchOrder(exchangeOrderId: string, persisted?: SpotBuyRequest): Promise<ExchangeSnapshot> {
    const request = this.submitted.get(exchangeOrderId) ??
      (persisted && exchangeOrderId === `demo-${persisted.idempotencyKey}` ? persisted : undefined);
    if (!request) {
      return {
        status: "UNKNOWN",
        exchangeOrderId,
      };
    }
    if (this.fetchOutcome === "rejected") {
      return {
        status: "REJECTED",
        exchangeOrderId,
        reason: "The demo exchange rejected this order.",
      };
    }
    if (this.fetchOutcome === "unknown") {
      return { status: "UNKNOWN", exchangeOrderId };
    }
    if (this.fetchOutcome === "partial") {
      const units = quoteUnits(request.quoteAmount) / 2n;
      if (units === 0n) return { status: "UNKNOWN", exchangeOrderId };
      const filled = formatQuote(units);
      return {
        status: "PARTIAL",
        exchangeOrderId,
        filledQuoteAmount: filled,
        remainingQuoteAmount: subtractQuote(request.quoteAmount, filled),
      };
    }
    return {
      status: "FILLED",
      exchangeOrderId,
      filledQuoteAmount: request.quoteAmount,
      receiptId: `demo-receipt-${exchangeOrderId}`,
    };
  }
}
