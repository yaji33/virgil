import { invalid } from "../boundary/errors.js";
import type { AccountSnapshot, ExecutionAdapter, ExchangeSnapshot, SpotBuyRequest } from "./adapter.js";
import { SpotBuyRequestSchema } from "./adapter.js";
import { exchangeSnapshotFromBinance } from "./binance-map.js";
import {
  BinanceClientError,
  BinanceSpotClient,
  readBinanceConfig,
  type BinanceRest,
} from "./binance-rest.js";

const DISABLED = "Live Binance execution is not enabled. No exchange credentials are configured.";

export class LiveExchange implements ExecutionAdapter {
  readonly environment = "LIVE" as const;

  constructor(private readonly client?: BinanceRest) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): LiveExchange {
    const config = readBinanceConfig(env);
    return config ? new LiveExchange(new BinanceSpotClient(config)) : new LiveExchange();
  }

  async submitSpotBuy(input: SpotBuyRequest): Promise<ExchangeSnapshot> {
    const request = SpotBuyRequestSchema.parse(input);
    const client = this.requireClient();
    try {
      const placed = await client.signedPost("/api/v3/order", {
        symbol: symbolOf(request),
        side: "BUY",
        type: "MARKET",
        quoteOrderQty: request.quoteAmount,
        newClientOrderId: request.idempotencyKey,
        newOrderRespType: "ACK",
      });
      const orderId = recordText((placed as { orderId?: unknown }).orderId);
      if (!orderId) return { status: "UNKNOWN", exchangeOrderId: `pending-${request.idempotencyKey}` };
      return { status: "UNKNOWN", exchangeOrderId: orderId };
    } catch (error) {
      if (error instanceof BinanceClientError && isRejection(error.binanceCode)) {
        return {
          status: "REJECTED",
          exchangeOrderId: `binance-rejected-${request.idempotencyKey}`,
          reason: error.message,
        };
      }
      throw error;
    }
  }

  async fetchOrder(exchangeOrderId: string, request?: SpotBuyRequest): Promise<ExchangeSnapshot> {
    if (!request) throw invalid("Exchange order lookup requires the approved terms.");
    const parsed = SpotBuyRequestSchema.parse(request);
    try {
      const order = await this.requireClient().signedGet("/api/v3/order", {
        symbol: symbolOf(parsed),
        orderId: exchangeOrderId,
      });
      return exchangeSnapshotFromBinance(asRecord(order), parsed.quoteAmount);
    } catch (error) {
      if (error instanceof BinanceClientError && error.binanceCode === -2013) {
        return { status: "UNKNOWN", exchangeOrderId };
      }
      throw error;
    }
  }

  async lookupOrder(
    request: SpotBuyRequest,
  ): Promise<{ request: SpotBuyRequest; snapshot: ExchangeSnapshot } | undefined> {
    const parsed = SpotBuyRequestSchema.parse(request);
    try {
      const order = await this.requireClient().signedGet("/api/v3/order", {
        symbol: symbolOf(parsed),
        origClientOrderId: parsed.idempotencyKey,
      });
      const snapshot = exchangeSnapshotFromBinance(asRecord(order), parsed.quoteAmount);
      if (snapshot.exchangeOrderId.startsWith("pending-")) return undefined;
      return { request: parsed, snapshot };
    } catch (error) {
      if (error instanceof BinanceClientError && error.binanceCode === -2013) return undefined;
      throw error;
    }
  }

  async accountSnapshot(accountId: string): Promise<AccountSnapshot> {
    const capturedAt = new Date().toISOString();
    try {
      const account = asRecord(await this.requireClient().signedGet("/api/v3/account", {}));
      if (account.canTrade !== true) {
        return { accountId, quoteAsset: "USDT", balance: "0", capturedAt, freshness: "UNAVAILABLE" };
      }
      const balances = Array.isArray(account.balances) ? account.balances : [];
      const usdt = balances.find((item) => asRecord(item).asset === "USDT");
      const free = recordText(asRecord(usdt).free) || "0";
      return { accountId, quoteAsset: "USDT", balance: free, capturedAt, freshness: "CURRENT" };
    } catch (error) {
      if (error instanceof BinanceClientError) {
        return { accountId, quoteAsset: "USDT", balance: "0", capturedAt, freshness: "UNAVAILABLE" };
      }
      throw error;
    }
  }

  private requireClient(): BinanceRest {
    if (!this.client) throw invalid(DISABLED);
    return this.client;
  }
}

function symbolOf(request: SpotBuyRequest): string {
  return `${request.baseAsset}${request.quoteAsset}`;
}

function isRejection(code: number | undefined): boolean {
  return code === -1013 || code === -1111 || code === -2010 || code === -2015;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function recordText(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}
