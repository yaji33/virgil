import { z } from "zod";
import { PlanTermsSchema } from "../plans/plan.js";

export const SpotBuyRequestSchema = z.object({
  idempotencyKey: z.string().min(1).max(128),
  accountId: z.string().min(1).max(128),
  baseAsset: z.string(),
  quoteAsset: z.string(),
  quoteAmount: z.string(),
}).strict().superRefine((request, context) => {
  const result = PlanTermsSchema.safeParse({
    accountId: request.accountId, baseAsset: request.baseAsset,
    quoteAsset: request.quoteAsset, quoteAmount: request.quoteAmount,
    title: "Execution", intent: "Execution", product: "SPOT", action: "BUY", schedule: "ONCE",
  });
  if (!result.success) {
    context.addIssue({ code: "custom", message: "Invalid execution terms" });
  }
});

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

export interface AccountSnapshot {
  accountId: string;
  quoteAsset: string;
  balance: string;
  capturedAt: string;
  freshness: "CURRENT" | "STALE" | "UNAVAILABLE";
}

export interface ExecutionAdapter {
  readonly environment: "DEMO" | "LIVE";
  submitSpotBuy(request: SpotBuyRequest): Promise<ExchangeSnapshot>;
  fetchOrder(exchangeOrderId: string, request?: SpotBuyRequest): Promise<ExchangeSnapshot>;
  lookupOrder?(request: SpotBuyRequest): Promise<{ request: SpotBuyRequest; snapshot: ExchangeSnapshot } | undefined>;
  accountSnapshot?(accountId: string): Promise<AccountSnapshot>;
}
