import { WorkspaceBoundary } from "../boundary/workspace.js";
import { DemoExchange } from "../execution/demo.js";
import { LiveExchange } from "../execution/live.js";
import { SqlStore } from "../records/sql.js";
import { RecordStore, type Records } from "../records/store.js";

const DEFAULT_SQL_DIR = "data/virgil";
const DEFAULT_JSON_FILE = "data/workspace.json";

async function openRecords(): Promise<Records> {
  if (process.env.VIRGIL_STORE === "memory") return RecordStore.memory();
  if (process.env.VIRGIL_STORE === "json") {
    return RecordStore.open(process.env.VIRGIL_DATA ?? DEFAULT_JSON_FILE);
  }
  return SqlStore.open(process.env.VIRGIL_DATA ?? DEFAULT_SQL_DIR);
}

export async function createBoundary(): Promise<WorkspaceBoundary> {
  const store = await openRecords();
  const exchange =
    process.env.VIRGIL_EXECUTION === "live"
      ? new LiveExchange()
      : new DemoExchange();
  return new WorkspaceBoundary(store, exchange);
}
