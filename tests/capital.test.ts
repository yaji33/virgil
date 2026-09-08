import { describe, expect, it } from "vitest";
import { availableQuote, reservedQuote, reservedTotal } from "../src/capital/available.js";
import { isCurrentSnapshot } from "../src/capital/snapshot.js";
import type { Order } from "../src/execution/order.js";
import type { WorkspaceRecord } from "../src/records/schema.js";
import { addQuote } from "../src/money/decimal.js";

const workspace: WorkspaceRecord = {
  id: "ws",
  exampleHold: "0",
  account: {
    accountId: "demo-account",
    workspaceId: "ws",
    quoteAsset: "USDT",
    balance: "500",
    capturedAt: "2026-09-08T00:00:00.000Z",
  },
};

function unknown(amount: string): Order {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    workspaceId: "ws",
    planId: "22222222-2222-2222-2222-222222222222",
    planRevision: 1,
    environment: "DEMO",
    exchangeOrderId: "pending-1",
    status: "UNKNOWN",
    submittedAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
    approvedPlan: {
      id: "22222222-2222-2222-2222-222222222222",
      workspaceId: "ws",
      revision: 1,
      status: "APPROVED",
      source: { kind: "CONSUMER", userId: "user" },
      terms: {
        title: "BTC purchase", intent: "Buy", accountId: "demo-account",
        baseAsset: "BTC", quoteAsset: "USDT", quoteAmount: amount,
        product: "SPOT", action: "BUY", schedule: "ONCE",
      },
      approval: { userId: "user", revision: 1 },
    },
  };
}

describe("Capital reservations", () => {
  it("reduces available by open reservations and example holds", () => {
    const orders = [unknown("250")];
    expect(reservedQuote(orders[0])).toBe("250");
    expect(reservedTotal(orders, "ws")).toBe("250");
    expect(availableQuote(workspace, orders)).toBe("250");
    expect(availableQuote({ ...workspace, exampleHold: "350" }, [])).toBe("150");
    expect(addQuote("250", "100")).toBe("350");
  });

  it("treats only current snapshots as executable", () => {
    const now = Date.parse("2026-09-08T00:01:00.000Z");
    expect(isCurrentSnapshot({
      accountId: "demo-account", quoteAsset: "USDT", balance: "500",
      capturedAt: "2026-09-08T00:00:30.000Z", freshness: "CURRENT",
    }, now)).toBe(true);
    expect(isCurrentSnapshot({
      accountId: "demo-account", quoteAsset: "USDT", balance: "500",
      capturedAt: "2026-09-08T00:00:30.000Z", freshness: "STALE",
    }, now)).toBe(false);
  });
});
