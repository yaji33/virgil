import { mkdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PlanSchema, type Plan } from "../plans/plan.js";
import { OrderSchema, type Order } from "../execution/order.js";
import { RecordConflict } from "./conflict.js";
import {
  ActivityRecordSchema,
  DatabaseSchema,
  MembershipRecordSchema,
  SessionRecordSchema,
  WorkspaceRecordSchema,
  type ActivityRecord,
  type Database,
  type MembershipRecord,
  type SessionRecord,
  type WorkspaceRecord,
} from "./schema.js";
import type { Records } from "./store.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  quote_asset TEXT NOT NULL,
  balance TEXT NOT NULL,
  example_hold TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memberships (
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  PRIMARY KEY (user_id, workspace_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  revision INTEGER NOT NULL,
  body JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL,
  body JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  plan_id TEXT NOT NULL,
  title TEXT NOT NULL,
  revision INTEGER NOT NULL,
  message TEXT NOT NULL,
  time TEXT NOT NULL
);
`;

type Queryable = {
  query: PGlite["query"];
};

type WorkspaceRow = {
  id: unknown;
  account_id: unknown;
  quote_asset: unknown;
  balance: unknown;
  example_hold: unknown;
};

type MembershipRow = { user_id: unknown; workspace_id: unknown };

type SessionRow = {
  id: unknown;
  token_hash: unknown;
  user_id: unknown;
  workspace_id: unknown;
  created_at: unknown;
  expires_at: unknown;
};

type PlanRow = { id: unknown; workspace_id: unknown; revision: unknown; body: unknown };
type OrderRow = { id: unknown; workspace_id: unknown; plan_id: unknown; status: unknown; body: unknown };
type ActivityRow = {
  id: unknown;
  workspace_id: unknown;
  plan_id: unknown;
  title: unknown;
  revision: unknown;
  message: unknown;
  time: unknown;
};

function jsonValue(value: unknown): unknown {
  if (typeof value === "string") return JSON.parse(value);
  return value;
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function touched(result: { affectedRows?: number; rowCount?: number }): number {
  return result.affectedRows ?? result.rowCount ?? 0;
}

function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

async function loadDatabase(tx: Queryable): Promise<Database> {
  const workspaces = await tx.query<WorkspaceRow>(
    "SELECT id, account_id, quote_asset, balance, example_hold FROM workspaces FOR UPDATE",
  );
  const memberships = await tx.query<MembershipRow>(
    "SELECT user_id, workspace_id FROM memberships FOR UPDATE",
  );
  const sessions = await tx.query<SessionRow>(
    "SELECT id, token_hash, user_id, workspace_id, created_at, expires_at FROM sessions FOR UPDATE",
  );
  const plans = await tx.query<PlanRow>(
    "SELECT id, workspace_id, revision, body FROM plans FOR UPDATE",
  );
  const orders = await tx.query<OrderRow>(
    "SELECT id, workspace_id, plan_id, status, body FROM orders FOR UPDATE",
  );
  const activity = await tx.query<ActivityRow>(
    "SELECT id, workspace_id, plan_id, title, revision, message, time FROM activity ORDER BY time DESC",
  );
  return DatabaseSchema.parse({
    version: 1,
    workspaces: workspaces.rows.map((row) =>
      WorkspaceRecordSchema.parse({
        id: row.id,
        exampleHold: row.example_hold,
        account: {
          accountId: row.account_id,
          workspaceId: row.id,
          quoteAsset: row.quote_asset,
          balance: row.balance,
        },
      }),
    ),
    memberships: memberships.rows.map((row) =>
      MembershipRecordSchema.parse({
        userId: row.user_id,
        workspaceId: row.workspace_id,
      }),
    ),
    sessions: sessions.rows.map((row) =>
      SessionRecordSchema.parse({
        id: row.id,
        tokenHash: row.token_hash,
        userId: row.user_id,
        workspaceId: row.workspace_id,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      }),
    ),
    plans: plans.rows.map((row) => PlanSchema.parse(jsonValue(row.body))),
    orders: orders.rows.map((row) => OrderSchema.parse(jsonValue(row.body))),
    activity: activity.rows.map((row) =>
      ActivityRecordSchema.parse({
        id: row.id,
        workspaceId: row.workspace_id,
        planId: row.plan_id,
        title: row.title,
        revision: row.revision,
        message: row.message,
        time: row.time,
      }),
    ),
  });
}

async function persist(tx: Queryable, loaded: Database, draft: Database): Promise<void> {
  const previousWorkspaces = byId(loaded.workspaces);
  for (const workspace of draft.workspaces) {
    await writeWorkspace(tx, previousWorkspaces.get(workspace.id), workspace);
  }

  const previousMemberships = new Set(
    loaded.memberships.map((item) => `${item.userId}:${item.workspaceId}`),
  );
  for (const membership of draft.memberships) {
    if (previousMemberships.has(`${membership.userId}:${membership.workspaceId}`)) continue;
    await insertMembership(tx, membership);
  }

  const previousSessions = byId(loaded.sessions);
  for (const session of draft.sessions) {
    if (previousSessions.has(session.id)) continue;
    await insertSession(tx, session);
  }

  const previousPlans = byId(loaded.plans);
  for (const plan of draft.plans) {
    await writePlan(tx, previousPlans.get(plan.id), plan);
  }

  const previousOrders = byId(loaded.orders);
  for (const order of draft.orders) {
    await writeOrder(tx, previousOrders.get(order.id), order);
  }

  const previousActivity = byId(loaded.activity);
  for (const event of draft.activity) {
    if (previousActivity.has(event.id)) continue;
    await insertActivity(tx, event);
  }
}

async function writeWorkspace(
  tx: Queryable,
  previous: WorkspaceRecord | undefined,
  workspace: WorkspaceRecord,
): Promise<void> {
  if (!previous) {
    await tx.query(
      `INSERT INTO workspaces (id, account_id, quote_asset, balance, example_hold)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        workspace.id,
        workspace.account.accountId,
        workspace.account.quoteAsset,
        workspace.account.balance,
        workspace.exampleHold,
      ],
    );
    return;
  }
  if (same(previous, workspace)) return;
  await tx.query(
    `UPDATE workspaces
     SET account_id = $1, quote_asset = $2, balance = $3, example_hold = $4
     WHERE id = $5`,
    [
      workspace.account.accountId,
      workspace.account.quoteAsset,
      workspace.account.balance,
      workspace.exampleHold,
      workspace.id,
    ],
  );
}

async function insertMembership(tx: Queryable, membership: MembershipRecord): Promise<void> {
  await tx.query(
    "INSERT INTO memberships (user_id, workspace_id) VALUES ($1, $2)",
    [membership.userId, membership.workspaceId],
  );
}

async function insertSession(tx: Queryable, session: SessionRecord): Promise<void> {
  await tx.query(
    `INSERT INTO sessions (id, token_hash, user_id, workspace_id, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      session.id,
      session.tokenHash,
      session.userId,
      session.workspaceId,
      session.createdAt,
      session.expiresAt,
    ],
  );
}

async function writePlan(tx: Queryable, previous: Plan | undefined, plan: Plan): Promise<void> {
  const body = JSON.stringify(plan);
  if (!previous) {
    await tx.query(
      "INSERT INTO plans (id, workspace_id, revision, body) VALUES ($1, $2, $3, $4::jsonb)",
      [plan.id, plan.workspaceId, plan.revision, body],
    );
    return;
  }
  if (same(previous, plan)) return;
  const result = await tx.query(
    "UPDATE plans SET revision = $1, body = $2::jsonb WHERE id = $3 AND revision = $4",
    [plan.revision, body, plan.id, previous.revision],
  );
  if (touched(result) === 0) {
    throw new RecordConflict("Plan changed. Review the latest revision.");
  }
}

async function writeOrder(tx: Queryable, previous: Order | undefined, order: Order): Promise<void> {
  const body = JSON.stringify(order);
  if (!previous) {
    await tx.query(
      "INSERT INTO orders (id, workspace_id, plan_id, status, body) VALUES ($1, $2, $3, $4, $5::jsonb)",
      [order.id, order.workspaceId, order.planId, order.status, body],
    );
    return;
  }
  if (same(previous, order)) return;
  const result = await tx.query(
    "UPDATE orders SET status = $1, body = $2::jsonb WHERE id = $3 AND status = $4",
    [order.status, body, order.id, previous.status],
  );
  if (touched(result) === 0) {
    throw new RecordConflict("Order changed. Review the latest status.");
  }
}

async function insertActivity(tx: Queryable, event: ActivityRecord): Promise<void> {
  await tx.query(
    `INSERT INTO activity (id, workspace_id, plan_id, title, revision, message, time)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      event.id,
      event.workspaceId,
      event.planId,
      event.title,
      event.revision,
      event.message,
      event.time,
    ],
  );
}

export class SqlStore implements Records {
  private constructor(private readonly pg: PGlite) {}

  static async memory(): Promise<SqlStore> {
    const pg = await PGlite.create();
    await pg.exec(SCHEMA);
    return new SqlStore(pg);
  }

  static async open(dataDir: string): Promise<SqlStore> {
    await mkdir(dataDir, { recursive: true });
    const pg = await PGlite.create(dataDir);
    await pg.exec(SCHEMA);
    return new SqlStore(pg);
  }

  close(): Promise<void> {
    return this.pg.close();
  }

  transaction<T>(fn: (db: Database) => T): Promise<T> {
    return this.pg.transaction(async (tx) => {
      const loaded = await loadDatabase(tx);
      const draft = structuredClone(loaded);
      const result = fn(draft);
      DatabaseSchema.parse(draft);
      await persist(tx, loaded, draft);
      return result;
    });
  }
}
