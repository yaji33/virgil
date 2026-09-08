import { isDeepStrictEqual } from "node:util";
import type { Database } from "./schema.js";

export function assertImmutableRecords(previous: Database, next: Database): void {
  for (const key of ["planHistory", "demoOrders"] as const) {
    const records = new Map<string, unknown>(next[key].map((record) => [record.id, record]));
    if (records.size !== next[key].length || previous[key].some(
      (record) => !isDeepStrictEqual(record, records.get(record.id)),
    )) throw new Error(`${key} records are immutable.`);
  }
}
