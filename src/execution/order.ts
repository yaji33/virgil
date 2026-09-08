import { z } from "zod";
import { PlanSchema } from "../plans/plan.js";

const IdentifierSchema = z.string().trim().min(1).max(128);
const AmountSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,19})(\.\d{1,18})?$/)
  .refine((value) => /[1-9]/.test(value), "Amount must be positive");
const BalanceSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,19})(\.\d{1,18})?$/);

const orderFields = {
  id: z.string().uuid(),
  workspaceId: IdentifierSchema,
  planId: z.string().uuid(),
  planRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  approvedPlan: PlanSchema.optional(),
  environment: z.enum(["DEMO", "LIVE"]),
  exchangeOrderId: z.string().trim().min(1).max(128),
  submittedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  recovery: z.object({
    attempts: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    nextAttemptAt: z.string().datetime(),
    lease: z.object({ id: z.string().uuid(), expiresAt: z.string().datetime() }).strict().optional(),
    lastError: z.enum(["LOOKUP_FAILED", "LOOKUP_TIMEOUT"]).optional(),
  }).strict().optional(),
};

export const OrderSchema = z.discriminatedUnion("status", [
  z.object({ ...orderFields, status: z.literal("UNKNOWN") }).strict(),
  z
    .object({
      ...orderFields,
      status: z.literal("REJECTED"),
      reason: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({
      ...orderFields,
      status: z.literal("PARTIAL"),
      filledQuoteAmount: AmountSchema,
      remainingQuoteAmount: BalanceSchema,
    })
    .strict(),
  z
    .object({
      ...orderFields,
      status: z.literal("FILLED"),
      filledQuoteAmount: AmountSchema,
      receiptId: z.string().trim().min(1).max(128),
    })
    .strict(),
]);

export type Order = z.infer<typeof OrderSchema>;
