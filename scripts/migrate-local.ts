import { SqlStore } from "../src/records/sql.js";
import { PostgresStore } from "../src/records/postgres.js";
import type { Database } from "../src/records/schema.js";

const sourcePath = process.env.VIRGIL_MIGRATION_SOURCE?.trim() || "data/virgil";
const targetUserId = process.env.VIRGIL_MIGRATION_USER_ID?.trim();
const selectedWorkspaceId = process.env.VIRGIL_MIGRATION_WORKSPACE_ID?.trim();
if (!targetUserId) {
  throw new Error("VIRGIL_MIGRATION_USER_ID must be the destination Supabase user ID.");
}

function addUnique<T>(
  destination: T[],
  incoming: T[],
  key: (item: T) => string,
): void {
  const existing = new Map(destination.map((item) => [key(item), item]));
  for (const item of incoming) {
    const id = key(item);
    const current = existing.get(id);
    if (current && JSON.stringify(current) !== JSON.stringify(item)) {
      throw new Error(`Hosted record ${id} conflicts with the local record.`);
    }
    if (!current) destination.push(item);
  }
}

const local = await SqlStore.open(sourcePath);
const hosted = PostgresStore.fromEnv();
try {
  const source = await local.transaction((db) => structuredClone(db));
  const candidates = selectedWorkspaceId
    ? source.workspaces.filter((workspace) => workspace.id === selectedWorkspaceId)
    : source.workspaces;
  if (candidates.length !== 1) {
    throw new Error(
      "Select exactly one local workspace with VIRGIL_MIGRATION_WORKSPACE_ID.",
    );
  }
  const workspace = candidates[0];
  const workspaceId = workspace.id;
  const plans = source.plans.filter((item) => item.workspaceId === workspaceId);
  const planIds = new Set(plans.map((item) => item.id));
  const orders = source.orders.filter((item) => item.workspaceId === workspaceId);
  const orderIds = new Set(orders.map((item) => item.id));

  await hosted.transaction((db: Database) => {
    addUnique(db.workspaces, [workspace], (item) => item.id);
    addUnique(
      db.memberships,
      [{ userId: targetUserId, workspaceId }],
      (item) => `${item.userId}:${item.workspaceId}`,
    );
    addUnique(db.plans, plans, (item) => item.id);
    addUnique(db.orders, orders, (item) => item.id);
    addUnique(
      db.planHistory,
      source.planHistory.filter((item) => planIds.has(item.plan.id)),
      (item) => item.id,
    );
    addUnique(
      db.activity,
      source.activity.filter((item) => item.workspaceId === workspaceId),
      (item) => item.id,
    );
    addUnique(
      db.demoOrders,
      source.demoOrders.filter((item) => orderIds.has(item.id)),
      (item) => item.id,
    );
  });
  console.log(`Migrated workspace ${workspaceId} for Supabase user ${targetUserId}.`);
  console.log("Local application sessions were not copied.");
} finally {
  await Promise.all([local.close(), hosted.close()]);
}
