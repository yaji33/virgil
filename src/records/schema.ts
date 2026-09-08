import { z } from "zod";
import { PlanSchema } from "../plans/plan.js";
import { OrderSchema } from "../execution/order.js";

const IdentifierSchema = z.string().trim().min(1).max(128);
const AssetSchema = z.string().regex(/^[A-Z0-9]{1,20}$/);
export const BalanceSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,19})(\.\d{1,18})?$/);

export const AccountRecordSchema = z
  .object({
    accountId: IdentifierSchema,
    workspaceId: IdentifierSchema,
    quoteAsset: AssetSchema,
    balance: BalanceSchema,
  })
  .strict();

export const WorkspaceRecordSchema = z
  .object({
    id: IdentifierSchema,
    account: AccountRecordSchema,
    exampleHold: BalanceSchema,
  })
  .strict();

export const MembershipRecordSchema = z
  .object({
    userId: IdentifierSchema,
    workspaceId: IdentifierSchema,
  })
  .strict();

export const SessionRecordSchema = z
  .object({
    id: z.string().uuid(),
    tokenHash: z.string().length(64),
    userId: IdentifierSchema,
    workspaceId: IdentifierSchema,
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .strict();

export const ActivityRecordSchema = z
  .object({
    id: z.string().uuid(),
    workspaceId: IdentifierSchema,
    planId: z.string().min(1).max(128),
    title: z.string().min(1).max(120),
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    message: z.string().min(1).max(500),
    time: z.string().datetime(),
  })
  .strict();

export const DatabaseSchema = z
  .object({
    version: z.literal(1),
    workspaces: z.array(WorkspaceRecordSchema),
    memberships: z.array(MembershipRecordSchema),
    sessions: z.array(SessionRecordSchema),
    plans: z.array(PlanSchema),
    orders: z.array(OrderSchema).default([]),
    activity: z.array(ActivityRecordSchema),
  })
  .strict();

export type AccountRecord = z.infer<typeof AccountRecordSchema>;
export type WorkspaceRecord = z.infer<typeof WorkspaceRecordSchema>;
export type MembershipRecord = z.infer<typeof MembershipRecordSchema>;
export type SessionRecord = z.infer<typeof SessionRecordSchema>;
export type ActivityRecord = z.infer<typeof ActivityRecordSchema>;
export type Database = z.infer<typeof DatabaseSchema>;
export type { Order } from "../execution/order.js";

export function emptyDatabase(): Database {
  return {
    version: 1,
    workspaces: [],
    memberships: [],
    sessions: [],
    plans: [],
    orders: [],
    activity: [],
  };
}
