import { z } from "zod";

const IdentifierSchema = z.string().trim().min(1).max(128);
const AssetSchema = z.string().regex(/^[A-Z0-9]{1,20}$/);
const AmountSchema = z.string()
  .regex(/^(0|[1-9]\d{0,19})(\.\d{1,18})?$/)
  .refine((value) => /[1-9]/.test(value), "Amount must be positive");

export const PlanTermsSchema = z.object({
  title: z.string().trim().min(1).max(120),
  intent: z.string().trim().min(1).max(2000),
  accountId: IdentifierSchema,
  baseAsset: AssetSchema,
  quoteAsset: AssetSchema,
  quoteAmount: AmountSchema,
  product: z.literal("SPOT"),
  action: z.literal("BUY"),
  schedule: z.literal("ONCE"),
}).strict().refine(
  (terms) => terms.baseAsset !== terms.quoteAsset,
  "Base and quote assets must differ",
);

export const PlanSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("CONSUMER"), userId: IdentifierSchema }).strict(),
  z.object({ kind: z.literal("INTEGRATION"), integrationId: IdentifierSchema }).strict(),
]);

const planFields = {
  id: z.string().uuid(),
  workspaceId: IdentifierSchema,
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  source: PlanSourceSchema,
  terms: PlanTermsSchema,
};

export const PlanSchema = z.discriminatedUnion("status", [
  z.object({ ...planFields, status: z.literal("DRAFT") }).strict(),
  z.object({ ...planFields, status: z.literal("IN_REVIEW") }).strict(),
  z.object({
    ...planFields,
    status: z.literal("APPROVED"),
    approval: z.object({
      userId: IdentifierSchema,
      revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    }).strict(),
  }).strict(),
]).superRefine((plan, context) => {
  if (plan.status === "APPROVED" && plan.approval.revision !== plan.revision) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["approval", "revision"],
      message: "Approval must match the plan revision",
    });
  }
});

export type Plan = z.infer<typeof PlanSchema>;
export type PlanTerms = z.infer<typeof PlanTermsSchema>;
