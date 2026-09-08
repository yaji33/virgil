import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { DatabaseSchema, emptyDatabase, type Database } from "./schema.js";
import {
  loadDatabase,
  persistDatabase,
  type Queryable,
  type QueryResult,
} from "./sql.js";
import type { Records, RecordScope } from "./store.js";
import { postgresTls } from "./tls.js";

const SERIALIZATION_RETRIES = 3;

function connectionString(env: NodeJS.ProcessEnv): string | undefined {
  const value = env.DATABASE_URL?.trim();
  return value || undefined;
}

function queryable(client: PoolClient): Queryable {
  return {
    async query<T extends object = Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ): Promise<QueryResult<T>> {
      const result = await client.query<T & QueryResultRow>(sql, params);
      return { rows: result.rows, rowCount: result.rowCount };
    },
  };
}

async function workspaceFor(
  client: PoolClient,
  scope: RecordScope,
): Promise<string | undefined> {
  if ("workspaceId" in scope) return scope.workspaceId;
  if ("tokenHash" in scope) {
    const result = await client.query<{ workspace_id: string }>(
      `SELECT s.workspace_id
       FROM sessions s
       JOIN memberships m
         ON m.user_id = s.user_id AND m.workspace_id = s.workspace_id
       WHERE s.token_hash = $1 AND s.expires_at > $2
       LIMIT 1`,
      [scope.tokenHash, new Date().toISOString()],
    );
    return result.rows[0]?.workspace_id;
  }
  const result = await client.query<{ workspace_id: string }>(
    "SELECT workspace_id FROM memberships WHERE user_id = $1 ORDER BY workspace_id LIMIT 1",
    [scope.userId],
  );
  return result.rows[0]?.workspace_id;
}

export class PostgresStore implements Records {
  private constructor(private readonly pool: Pool) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): PostgresStore {
    const url = connectionString(env);
    if (!url) throw new Error("DATABASE_URL is required when VIRGIL_STORE=postgres.");
    return new PostgresStore(new Pool({
      connectionString: url,
      ssl: postgresTls(env),
      max: 10,
      connectionTimeoutMillis: 10_000,
    }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async transaction<T>(
    fn: (db: Database) => T,
    scope?: RecordScope,
  ): Promise<T> {
    for (let attempt = 0; attempt < SERIALIZATION_RETRIES; attempt++) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        const workspaceId = scope ? await workspaceFor(client, scope) : undefined;
        const tx = queryable(client);
        const loaded = scope && !workspaceId
          ? emptyDatabase()
          : await loadDatabase(tx, workspaceId);
        const draft = structuredClone(loaded);
        const result = fn(draft);
        DatabaseSchema.parse(draft);
        await persistDatabase(tx, loaded, draft);
        await client.query("COMMIT");
        return structuredClone(result);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        if ((error as { code?: string }).code === "40001" &&
          attempt + 1 < SERIALIZATION_RETRIES) continue;
        throw error;
      } finally {
        client.release();
      }
    }
    throw new Error("PostgreSQL transaction retry limit reached.");
  }
}
