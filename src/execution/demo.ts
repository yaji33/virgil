import { formatQuote, quoteUnits, subtractQuote } from "../money/decimal.js";
import { RecordStore, type Records } from "../records/store.js";
import { SpotBuyRequestSchema, type AccountSnapshot, type ExecutionAdapter, type ExchangeSnapshot, type SpotBuyRequest } from "./adapter.js";
import type { DemoOrderRecord } from "./demo-record.js";

export type DemoOutcome = "unknown" | "rejected" | "partial" | "filled";

export class DemoExchange implements ExecutionAdapter {
  readonly environment = "DEMO" as const;

  constructor(
    private readonly fetchOutcome: DemoOutcome = "filled",
    private readonly store: Records = RecordStore.memory(),
  ) {}

  async submitSpotBuy(input: SpotBuyRequest): Promise<ExchangeSnapshot> {
    const request = SpotBuyRequestSchema.parse(input);
    await this.store.transaction((db) => {
      const existing = db.demoOrders.find((order) => order.id === request.idempotencyKey);
      if (existing) {
        this.assertRequest(existing.request, request);
        return;
      }
      db.demoOrders.push({ id: request.idempotencyKey, request, outcome: this.fetchOutcome });
    });
    return { status: "UNKNOWN", exchangeOrderId: `demo-${request.idempotencyKey}` };
  }

  async lookupOrder(request: SpotBuyRequest): Promise<{ request: SpotBuyRequest; snapshot: ExchangeSnapshot } | undefined> {
    const found = await this.store.transaction((db) => db.demoOrders.find((order) => order.id === request.idempotencyKey));
    if (!found) return undefined;
    this.assertRequest(found.request, request);
    return { request: found.request, snapshot: this.snapshot(found) };
  }

  async accountSnapshot(accountId: string): Promise<AccountSnapshot> {
    return this.store.transaction((db) => {
      const workspace = db.workspaces.find((item) => item.account.accountId === accountId);
      const capturedAt = new Date().toISOString();
      if (!workspace) {
        return { accountId, quoteAsset: "USDT", balance: "0", capturedAt, freshness: "UNAVAILABLE" };
      }
      return {
        accountId,
        quoteAsset: workspace.account.quoteAsset,
        balance: workspace.account.balance,
        capturedAt,
        freshness: "CURRENT",
      };
    });
  }

  async fetchOrder(exchangeOrderId: string, persisted?: SpotBuyRequest): Promise<ExchangeSnapshot> {
    const found = await this.store.transaction((db) => db.demoOrders.find((order) => `demo-${order.id}` === exchangeOrderId));
    if (found) {
      if (persisted) this.assertRequest(found.request, persisted);
      return this.snapshot(found);
    }
    // Legacy acknowledged demo orders predate the exchange journal.
    if (persisted && exchangeOrderId === `demo-${persisted.idempotencyKey}`) {
      return this.snapshot({ id: persisted.idempotencyKey, request: persisted, outcome: this.fetchOutcome });
    }
    return { status: "UNKNOWN", exchangeOrderId };
  }

  private assertRequest(left: SpotBuyRequest, right: SpotBuyRequest): void {
    if (Object.keys(left).some((key) => left[key as keyof SpotBuyRequest] !== right[key as keyof SpotBuyRequest])) {
      throw new Error("Demo client identifier already belongs to different execution terms.");
    }
  }

  private snapshot(order: DemoOrderRecord): ExchangeSnapshot {
    const { request, outcome } = order;
    const exchangeOrderId = `demo-${order.id}`;
    if (outcome === "rejected") {
      return { status: "REJECTED", exchangeOrderId, reason: "The demo exchange rejected this order." };
    }
    if (outcome === "unknown") return { status: "UNKNOWN", exchangeOrderId };
    if (outcome === "partial") {
      const units = quoteUnits(request.quoteAmount) / 2n;
      if (units === 0n) return { status: "UNKNOWN", exchangeOrderId };
      const filled = formatQuote(units);
      return {
        status: "PARTIAL", exchangeOrderId, filledQuoteAmount: filled,
        remainingQuoteAmount: subtractQuote(request.quoteAmount, filled),
      };
    }
    return {
      status: "FILLED", exchangeOrderId, filledQuoteAmount: request.quoteAmount,
      receiptId: `demo-receipt-${exchangeOrderId}`,
    };
  }
}
