import { invalid } from "../boundary/errors.js";
import type { ExecutionAdapter, ExchangeSnapshot, SpotBuyRequest } from "./adapter.js";

export class LiveExchange implements ExecutionAdapter {
  readonly environment = "LIVE" as const;

  async submitSpotBuy(_request: SpotBuyRequest): Promise<ExchangeSnapshot> {
    throw invalid(
      "Live Binance execution is not enabled. No exchange credentials are configured.",
    );
  }

  async fetchOrder(_exchangeOrderId: string): Promise<ExchangeSnapshot> {
    throw invalid(
      "Live Binance execution is not enabled. No exchange credentials are configured.",
    );
  }
}
