import { describe, expect, it } from "vitest";
import { exchangeSnapshotFromBinance } from "../src/execution/binance-map.js";
import {
  BINANCE_MAINNET_URL,
  BINANCE_TESTNET_URL,
  BinanceClientError,
  BinanceSpotClient,
  readBinanceConfig,
} from "../src/execution/binance-rest.js";
import { queryString, signQuery } from "../src/execution/binance-sign.js";
import { LiveExchange } from "../src/execution/live.js";

const hmacSecret = "NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j";

describe("Binance request signing", () => {
  it("matches the documented HMAC example", () => {
    const payload = queryString({
      symbol: "LTCBTC",
      side: "BUY",
      type: "LIMIT",
      timeInForce: "GTC",
      quantity: "1",
      price: "0.1",
      recvWindow: "5000",
      timestamp: "1499827319559",
    });
    expect(payload).toBe(
      "symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559",
    );
    expect(signQuery(hmacSecret, payload)).toBe(
      "c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71",
    );
  });
});

describe("Binance order mapping", () => {
  it("keeps a new order unresolved", () => {
    expect(exchangeSnapshotFromBinance({
      orderId: 28, status: "NEW", cummulativeQuoteQty: "0.00000000",
    }, "250")).toEqual({ status: "UNKNOWN", exchangeOrderId: "28" });
  });

  it("records a fill only from query data", () => {
    expect(exchangeSnapshotFromBinance({
      orderId: 28, status: "FILLED", cummulativeQuoteQty: "250.00000000",
    }, "250")).toEqual({
      status: "FILLED",
      exchangeOrderId: "28",
      filledQuoteAmount: "250.00000000",
      receiptId: "binance-28",
    });
  });

  it("keeps remaining quote reserved on a partial fill", () => {
    expect(exchangeSnapshotFromBinance({
      orderId: 28, status: "PARTIALLY_FILLED", cumulativeQuoteQty: "100",
    }, "250")).toEqual({
      status: "PARTIAL",
      exchangeOrderId: "28",
      filledQuoteAmount: "100",
      remainingQuoteAmount: "150",
    });
  });

  it("rejects a canceled order with no fill", () => {
    expect(exchangeSnapshotFromBinance({
      orderId: 28, status: "CANCELED", cummulativeQuoteQty: "0.00000000",
    }, "250").status).toBe("REJECTED");
  });
});

describe("Binance configuration", () => {
  it("defaults to testnet when keys are present", () => {
    expect(readBinanceConfig({
      BINANCE_API_KEY: "key",
      BINANCE_API_SECRET: "secret",
    })).toEqual({
      apiKey: "key",
      apiSecret: "secret",
      baseUrl: BINANCE_TESTNET_URL,
      recvWindow: "5000",
    });
  });

  it("refuses mainnet without an explicit real-market flag", () => {
    expect(() => readBinanceConfig({
      BINANCE_API_KEY: "key",
      BINANCE_API_SECRET: "secret",
      BINANCE_BASE_URL: BINANCE_MAINNET_URL,
    })).toThrow("Mainnet Binance is not enabled");
  });
});

describe("Live Binance adapter", () => {
  const request = {
    idempotencyKey: "11111111-1111-1111-1111-111111111111",
    accountId: "demo-account",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    quoteAmount: "250",
  };

  it("does not enable live Binance execution without credentials", async () => {
    const live = new LiveExchange();
    await expect(live.submitSpotBuy(request)).rejects.toThrow("Live Binance execution is not enabled");
  });

  it("treats a submit acknowledgement as unknown even if Binance already filled", async () => {
    const calls: string[] = [];
    const live = new LiveExchange(new BinanceSpotClient({
      apiKey: "key", apiSecret: "secret", baseUrl: BINANCE_TESTNET_URL, recvWindow: "5000",
    }, async (url, init) => {
      calls.push(`${init?.method} ${new URL(String(url)).pathname}`);
      expect(String(url)).not.toContain("secret");
      return new Response(JSON.stringify({
        orderId: 99, status: "FILLED", cummulativeQuoteQty: "250.00000000",
      }), { status: 200 });
    }, () => 1_499_827_319_559));
    await expect(live.submitSpotBuy(request)).resolves.toEqual({
      status: "UNKNOWN",
      exchangeOrderId: "99",
    });
    expect(calls).toEqual(["POST /api/v3/order"]);
  });

  it("maps a later order query to a receipt", async () => {
    const live = new LiveExchange(new BinanceSpotClient({
      apiKey: "key", apiSecret: "secret", baseUrl: BINANCE_TESTNET_URL, recvWindow: "5000",
    }, async () => new Response(JSON.stringify({
      orderId: 99, status: "FILLED", cummulativeQuoteQty: "250.00000000",
    }), { status: 200 })));
    await expect(live.fetchOrder("99", request)).resolves.toMatchObject({
      status: "FILLED",
      exchangeOrderId: "99",
      receiptId: "binance-99",
    });
  });

  it("treats a missing order lookup as unresolved", async () => {
    const live = new LiveExchange(new BinanceSpotClient({
      apiKey: "key", apiSecret: "secret", baseUrl: BINANCE_TESTNET_URL, recvWindow: "5000",
    }, async () => new Response(JSON.stringify({ code: -2013, msg: "Order does not exist." }), { status: 400 })));
    await expect(live.lookupOrder(request)).resolves.toBeUndefined();
  });

  it("reads free USDT as the current snapshot", async () => {
    const live = new LiveExchange(new BinanceSpotClient({
      apiKey: "key", apiSecret: "secret", baseUrl: BINANCE_TESTNET_URL, recvWindow: "5000",
    }, async () => new Response(JSON.stringify({
      canTrade: true,
      balances: [
        { asset: "BTC", free: "1", locked: "0" },
        { asset: "USDT", free: "80.5", locked: "10" },
      ],
    }), { status: 200 })));
    const snapshot = await live.accountSnapshot("demo-account");
    expect(snapshot).toMatchObject({
      quoteAsset: "USDT",
      balance: "80.5",
      freshness: "CURRENT",
    });
  });

  it("rejects an insufficient-balance order without treating it as unknown", async () => {
    const live = new LiveExchange(new BinanceSpotClient({
      apiKey: "key", apiSecret: "secret", baseUrl: BINANCE_TESTNET_URL, recvWindow: "5000",
    }, async () => new Response(JSON.stringify({
      code: -2010, msg: "Account has insufficient balance for requested action.",
    }), { status: 400 })));
    await expect(live.submitSpotBuy(request)).resolves.toMatchObject({
      status: "REJECTED",
      reason: "Account has insufficient balance for requested action.",
    });
  });

  it("surfaces a signed request failure without leaking the secret", async () => {
    const client = new BinanceSpotClient({
      apiKey: "key", apiSecret: "super-secret", baseUrl: BINANCE_TESTNET_URL, recvWindow: "5000",
    }, async () => new Response(JSON.stringify({ code: -1022, msg: "Signature for this request is not valid." }), { status: 400 }));
    await expect(client.signedGet("/api/v3/account", {})).rejects.toEqual(
      expect.objectContaining({ name: "BinanceClientError" }) as BinanceClientError,
    );
    await expect(client.signedGet("/api/v3/account", {})).rejects.toThrow("Signature for this request is not valid.");
  });

  it("synchronizes with Binance time and retries once after clock drift", async () => {
    const urls: string[] = [];
    let signedCalls = 0;
    const client = new BinanceSpotClient({
      apiKey: "key", apiSecret: "secret", baseUrl: BINANCE_TESTNET_URL, recvWindow: "5000",
    }, async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith("/api/v3/time")) {
        return new Response(JSON.stringify({ serverTime: 20_000 }), { status: 200 });
      }
      signedCalls++;
      if (signedCalls === 1) {
        return new Response(JSON.stringify({
          code: -1021, msg: "Timestamp for this request is outside of the recvWindow.",
        }), { status: 400 });
      }
      return new Response(JSON.stringify({ canTrade: true }), { status: 200 });
    }, () => 10_000);

    await expect(client.signedGet("/api/v3/account", {})).resolves.toEqual({ canTrade: true });
    expect(urls.map((url) => new URL(url).pathname)).toEqual([
      "/api/v3/account", "/api/v3/time", "/api/v3/account",
    ]);
    expect(new URL(urls[0]).searchParams.get("timestamp")).toBe("10000");
    expect(new URL(urls[2]).searchParams.get("timestamp")).toBe("20000");
  });
});
