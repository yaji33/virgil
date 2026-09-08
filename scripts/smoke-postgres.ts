import { Pool } from "pg";
import { WorkspaceBoundary } from "../src/boundary/workspace.js";
import { PostgresStore } from "../src/records/postgres.js";
import { postgresTls } from "../src/records/tls.js";

const directUrl = process.env.DIRECT_URL?.trim();
if (!directUrl) throw new Error("DIRECT_URL is required for the hosted smoke check.");

const userId = globalThis.crypto.randomUUID();
const otherUserId = globalThis.crypto.randomUUID();
let workspaceId: string | undefined;
let otherWorkspaceId: string | undefined;
const store = PostgresStore.fromEnv();
const admin = new Pool({
  connectionString: directUrl,
  ssl: postgresTls(),
  max: 1,
});

try {
  const boundary = new WorkspaceBoundary(store);
  const session = await boundary.openAuthenticatedSession(userId);
  const otherSession = await boundary.openAuthenticatedSession(otherUserId);
  workspaceId = session.actor.workspaceId;
  otherWorkspaceId = otherSession.actor.workspaceId;
  const state = await boundary.read(session.token);
  if (state.actor.userId !== userId || state.workspace.id !== workspaceId) {
    throw new Error("Hosted workspace identity did not round-trip.");
  }
  const rls = await admin.query<{ count: string }>(`
    select count(*)::text as count
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any($1::text[])
      and c.relrowsecurity
  `, [[
    "workspaces", "memberships", "sessions", "plans",
    "orders", "activity", "plan_history", "demo_orders",
  ]]);
  if (rls.rows[0]?.count !== "8") {
    throw new Error("Not every Virgil table has row level security enabled.");
  }
  const client = await admin.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const visible = await client.query<{ id: string }>(
      "select id from public.workspaces order by id",
    );
    if (visible.rows.length !== 1 || visible.rows[0]?.id !== workspaceId) {
      throw new Error("Row level security exposed another workspace.");
    }
    await client.query("rollback");
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
  console.log("Hosted workspace round-trip: OK");
  console.log("Row level security: 8/8 tables enabled");
  console.log("Tenant isolation: authenticated user sees only its workspace");
} finally {
  await store.close();
  const workspaces = [workspaceId, otherWorkspaceId].filter(Boolean);
  for (const id of workspaces) {
    await admin.query("delete from public.sessions where workspace_id = $1", [id]);
    await admin.query("delete from public.memberships where workspace_id = $1", [id]);
    await admin.query("delete from public.workspaces where id = $1", [id]);
  }
  await admin.end();
}
