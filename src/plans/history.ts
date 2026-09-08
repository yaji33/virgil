import { z } from "zod";
import { PlanSchema, type Plan } from "./plan.js";
import type { Database } from "../records/schema.js";

export const PlanHistorySchema = z.object({
  id: z.string().uuid(),
  plan: PlanSchema,
  kind: z.enum(["CREATED", "REVISED", "REVIEWED", "APPROVED", "IMPORTED"]),
  actorId: z.string().min(1).max(128).optional(),
  recordedAt: z.string().datetime(),
}).strict();

export type PlanHistory = z.infer<typeof PlanHistorySchema>;

export function recordPlanHistory(db: Database, plan: Plan, actor: { userId: string }): void {
  const previous = db.plans.find((item) => item.id === plan.id);
  if (previous && !db.planHistory.some((entry) => entry.plan.id === plan.id)) {
    db.planHistory.push({
      id: globalThis.crypto.randomUUID(), plan: structuredClone(previous),
      kind: "IMPORTED", recordedAt: new Date().toISOString(),
    });
  }
  db.planHistory.push({
    id: globalThis.crypto.randomUUID(), plan: structuredClone(plan), actorId: actor.userId,
    kind: !previous ? "CREATED" : plan.status === "DRAFT" ? "REVISED"
      : plan.status === "IN_REVIEW" ? "REVIEWED" : "APPROVED",
    recordedAt: new Date().toISOString(),
  });
}
