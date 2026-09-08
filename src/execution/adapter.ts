export type ExchangeSnapshot =
  | { status: "UNKNOWN"; exchangeOrderId: string }
  | { status: "REJECTED"; exchangeOrderId: string; reason: string }
  | {
      status: "PARTIAL";
      exchangeOrderId: string;
      filledQuoteAmount: string;
      remainingQuoteAmount: string;
    }
  | {
      status: "FILLED";
      exchangeOrderId: string;
      filledQuoteAmount: string;
      receiptId: string;
    };

export interface SpotBuyRequest {
  idempotencyKey: string;
  accountId: string;
  baseAsset: string;
  quoteAsset: string;
  quoteAmount: string;
}

export interface ExecutionAdapter {
  readonly environment: "DEMO" | "LIVE";
  submitSpotBuy(request: SpotBuyRequest): Promise<ExchangeSnapshot>;
  fetchOrder(exchangeOrderId: string, request?: SpotBuyRequest): Promise<ExchangeSnapshot>;
}
