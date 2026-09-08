import { invalid } from "../boundary/errors.js";
import type { AccountSnapshot, ExecutionAdapter } from "../execution/adapter.js";

export const SNAPSHOT_TTL_MS = 60_000;

export function isCurrentSnapshot(snapshot: AccountSnapshot, now = Date.now()): boolean {
  return snapshot.freshness === "CURRENT" && Date.parse(snapshot.capturedAt) > now - SNAPSHOT_TTL_MS;
}

export async function requireCurrentSnapshot(
  exchange: ExecutionAdapter,
  accountId: string,
): Promise<AccountSnapshot> {
  if (!exchange.accountSnapshot) {
    if (exchange.environment === "LIVE") {
      throw invalid("The account snapshot is not current enough to execute.");
    }
    return {
      accountId,
      quoteAsset: "USDT",
      balance: "0",
      capturedAt: new Date().toISOString(),
      freshness: "CURRENT",
    };
  }
  const snapshot = await exchange.accountSnapshot(accountId);
  if (snapshot.accountId !== accountId) {
    throw invalid("The account snapshot does not match this workspace.");
  }
  if (exchange.environment === "DEMO" && snapshot.freshness === "UNAVAILABLE") {
    return { ...snapshot, freshness: "CURRENT", capturedAt: new Date().toISOString() };
  }
  if (!isCurrentSnapshot(snapshot)) {
    throw invalid("The account snapshot is not current enough to execute.");
  }
  return snapshot;
}
