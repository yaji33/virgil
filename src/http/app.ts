import { WorkspaceBoundary } from "../boundary/workspace.js";
import { DemoExchange } from "../execution/demo.js";
import { LiveExchange } from "../execution/live.js";
import { SqlStore } from "../records/sql.js";
import { RecordStore, type Records } from "../records/store.js";
import { RecoveryWorker } from "../execution/recovery.js";
import { PostgresStore } from "../records/postgres.js";
import { SupabaseAuth } from "../auth/supabase.js";

const DEFAULT_SQL_DIR = "data/virgil";
const DEFAULT_JSON_FILE = "data/workspace.json";

async function openRecords(): Promise<Records> {
  if (process.env.VIRGIL_STORE === "memory") return RecordStore.memory();
  if (process.env.VIRGIL_STORE === "json") {
    return RecordStore.open(process.env.VIRGIL_DATA ?? DEFAULT_JSON_FILE);
  }
  if (process.env.VIRGIL_STORE === "postgres") return PostgresStore.fromEnv();
  return SqlStore.open(process.env.VIRGIL_DATA ?? DEFAULT_SQL_DIR);
}

export interface Application {
  boundary: WorkspaceBoundary;
  auth?: SupabaseAuth;
  close(): Promise<void>;
}

export async function createApplication(): Promise<Application> {
  const store = await openRecords();
  const auth = SupabaseAuth.fromEnv();
  if (process.env.VIRGIL_STORE === "postgres" && !auth) {
    await store.close();
    throw new Error("Hosted PostgreSQL requires Supabase Auth configuration.");
  }
  const exchange =
    process.env.VIRGIL_EXECUTION === "live"
      ? LiveExchange.fromEnv()
      : new DemoExchange("filled", store);
  const recovery = new RecoveryWorker(store, exchange);
  recovery.start();
  let closing: Promise<void> | undefined;
  return {
    boundary: new WorkspaceBoundary(store, exchange),
    auth,
    close() {
      closing ??= recovery.stop().finally(() => store.close());
      return closing;
    },
  };
}
