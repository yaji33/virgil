import type { Records } from "../records/store.js";
import type { ExecutionAdapter, ExchangeSnapshot } from "./adapter.js";
import { lookupSnapshot, recordExchange, unresolved } from "./reconcile.js";
import type { Order } from "./order.js";

const RETRY_MS = 30_000;
const LEASE_MS = 30_000;
const LOOKUP_MS = 10_000;
const BATCH_SIZE = 25;

class LookupTimeout extends Error {}

function reportRecoveryError(error: unknown): void {
  const name = error instanceof Error ? error.name : "UnknownError";
  const code = error && typeof error === "object" && "code" in error &&
    typeof error.code === "string" ? `, code ${error.code}` : "";
  console.error(`Execution recovery could not access its records (${name}${code}).`);
}

async function boundedLookup(exchange: ExecutionAdapter, order: Order): Promise<ExchangeSnapshot | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      lookupSnapshot(exchange, order),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new LookupTimeout("Order lookup timed out.")), LOOKUP_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export class RecoveryWorker {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<number> | undefined;
  private stopped = true;

  constructor(
    private readonly store: Records,
    private readonly exchange: ExecutionAdapter,
    private readonly now: () => number = Date.now,
    private readonly onError: (error: unknown) => void = reportRecoveryError,
  ) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(0);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }

  runOnce(): Promise<number> {
    if (this.running) return this.running;
    this.running = this.recoverBatch().finally(() => { this.running = undefined; });
    return this.running;
  }

  private schedule(delay: number): void {
    this.timer = setTimeout(() => {
      void this.runOnce().catch(this.onError).finally(() => {
        if (!this.stopped) this.schedule(5_000);
      });
    }, delay);
    this.timer.unref();
  }

  private async recoverBatch(): Promise<number> {
    let recovered = 0;
    for (let count = 0; count < BATCH_SIZE; count++) {
      const claimed = await this.store.transaction((db) => {
        const now = this.now();
        const order = db.orders.filter((item) => item.environment === this.exchange.environment && unresolved(item))
          .sort((left, right) => Date.parse(left.recovery?.nextAttemptAt ?? left.submittedAt) -
            Date.parse(right.recovery?.nextAttemptAt ?? right.submittedAt))
          .find((item) => Date.parse(item.recovery?.nextAttemptAt ?? item.submittedAt) +
            (item.recovery ? 0 : RETRY_MS) <= now &&
            (!item.recovery?.lease || Date.parse(item.recovery.lease.expiresAt) <= now));
        if (!order) return undefined;
        order.recovery = {
          attempts: Math.min((order.recovery?.attempts ?? 0) + 1, Number.MAX_SAFE_INTEGER),
          nextAttemptAt: new Date(now + RETRY_MS).toISOString(),
          lease: { id: globalThis.crypto.randomUUID(), expiresAt: new Date(now + LEASE_MS).toISOString() },
        };
        return order;
      });
      if (!claimed) break;
      let snapshot: ExchangeSnapshot | undefined;
      let lastError: "LOOKUP_FAILED" | "LOOKUP_TIMEOUT" | undefined;
      try {
        snapshot = await boundedLookup(this.exchange, claimed);
      } catch (error) {
        lastError = error instanceof LookupTimeout ? "LOOKUP_TIMEOUT" : "LOOKUP_FAILED";
      }
      await this.store.transaction((db) => {
        let order = db.orders.find((item) => item.id === claimed.id);
        if (!order || order.recovery?.lease?.id !== claimed.recovery?.lease?.id ||
          Date.parse(order.recovery!.lease!.expiresAt) <= this.now()) return;
        if (snapshot) {
          try {
            order = recordExchange(db, order.id, snapshot);
          } catch {
            lastError = "LOOKUP_FAILED";
          }
        }
        const attempts = order.recovery!.attempts;
        order.recovery = {
          attempts, lastError,
          nextAttemptAt: new Date(this.now() + Math.min(RETRY_MS * 2 ** Math.min(attempts - 1, 4), 300_000)).toISOString(),
        };
        if (!unresolved(order)) recovered++;
      });
    }
    return recovered;
  }
}
