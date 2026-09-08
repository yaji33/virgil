import { invalid } from "../boundary/errors.js";
import { queryString, signQuery } from "./binance-sign.js";

export const BINANCE_TESTNET_URL = "https://testnet.binance.vision";
export const BINANCE_MAINNET_URL = "https://api.binance.com";

export interface BinanceConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  recvWindow: string;
}

export interface BinanceRest {
  signedGet(path: string, params: Record<string, string>): Promise<unknown>;
  signedPost(path: string, params: Record<string, string>): Promise<unknown>;
}

interface BinanceErrorBody {
  code?: unknown;
  msg?: unknown;
}

export class BinanceClientError extends Error {
  constructor(
    readonly binanceCode: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = "BinanceClientError";
  }
}

export function readBinanceConfig(env: NodeJS.ProcessEnv = process.env): BinanceConfig | undefined {
  const apiKey = env.BINANCE_API_KEY?.trim();
  const apiSecret = env.BINANCE_API_SECRET?.trim();
  if (!apiKey || !apiSecret) return undefined;
  const baseUrl = (env.BINANCE_BASE_URL?.trim() || BINANCE_TESTNET_URL).replace(/\/$/, "");
  if (baseUrl === BINANCE_MAINNET_URL) {
    if (env.VIRGIL_BINANCE_REAL !== "yes") {
      throw invalid("Mainnet Binance is not enabled. Use the spot testnet or set VIRGIL_BINANCE_REAL=yes.");
    }
  } else if (baseUrl !== BINANCE_TESTNET_URL) {
    throw invalid("BINANCE_BASE_URL must be the Binance spot testnet or mainnet REST origin.");
  }
  const recvWindow = env.BINANCE_RECV_WINDOW?.trim() || "5000";
  if (!/^\d{1,5}$/.test(recvWindow) || Number(recvWindow) > 60_000) {
    throw invalid("BINANCE_RECV_WINDOW must be milliseconds up to 60000.");
  }
  return { apiKey, apiSecret, baseUrl, recvWindow };
}

export class BinanceSpotClient implements BinanceRest {
  private clockOffsetMs = 0;

  constructor(
    private readonly config: BinanceConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  signedGet(path: string, params: Record<string, string>): Promise<unknown> {
    return this.request("GET", path, params);
  }

  signedPost(path: string, params: Record<string, string>): Promise<unknown> {
    return this.request("POST", path, params);
  }

  private async request(method: "GET" | "POST", path: string, params: Record<string, string>): Promise<unknown> {
    try {
      return await this.signedRequest(method, path, params);
    } catch (error) {
      if (!(error instanceof BinanceClientError) || error.binanceCode !== -1021) throw error;
      await this.synchronizeClock();
      return this.signedRequest(method, path, params);
    }
  }

  private async signedRequest(
    method: "GET" | "POST",
    path: string,
    params: Record<string, string>,
  ): Promise<unknown> {
    const payload = queryString({
      ...params,
      recvWindow: this.config.recvWindow,
      timestamp: String(this.now() + this.clockOffsetMs),
    });
    const signature = signQuery(this.config.apiSecret, payload);
    const url = `${this.config.baseUrl}${path}?${payload}&signature=${signature}`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: { "X-MBX-APIKEY": this.config.apiKey },
      });
    } catch {
      throw invalid("Binance is unreachable. The order stays unresolved until it can be queried.");
    }
    const text = await response.text();
    const body = parseJson(text);
    if (!response.ok) {
      const error = body as BinanceErrorBody;
      const message =
        typeof error.msg === "string" && error.msg.length > 0 && error.msg.length <= 500
          ? error.msg
          : "Binance request failed.";
      const code = typeof error.code === "number" ? error.code : undefined;
      throw new BinanceClientError(code, message);
    }
    return body;
  }

  private async synchronizeClock(): Promise<void> {
    const startedAt = this.now();
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.baseUrl}/api/v3/time`, { method: "GET" });
    } catch {
      throw invalid("Binance is unreachable. The order stays unresolved until it can be queried.");
    }
    const body = parseJson(await response.text()) as { serverTime?: unknown };
    if (!response.ok || typeof body.serverTime !== "number" || !Number.isSafeInteger(body.serverTime)) {
      throw invalid("Binance server time is unavailable. The order stays unresolved until it can be queried.");
    }
    this.clockOffsetMs = body.serverTime - Math.floor((startedAt + this.now()) / 2);
  }
}

function parseJson(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}
