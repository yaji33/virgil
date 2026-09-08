import { PlanSchema, type Plan } from "./plan.js";

function requireRevision(plan: Plan, expectedRevision: number): void {
  if (plan.revision !== expectedRevision) {
    throw new Error("Plan changed. Review the latest revision.");
  }
}

export function createPlan(input: {
  workspaceId: string;
  source: Plan["source"];
  terms: Plan["terms"];
}): Plan {
  return PlanSchema.parse({
    id: globalThis.crypto.randomUUID(),
    workspaceId: input.workspaceId,
    source: input.source,
    terms: input.terms,
    revision: 1,
    status: "DRAFT",
  });
}

export function revisePlan(input: Plan, expectedRevision: number, terms: Plan["terms"]): Plan {
  const plan = PlanSchema.parse(input);
  requireRevision(plan, expectedRevision);
  return PlanSchema.parse({
    id: plan.id,
    workspaceId: plan.workspaceId,
    source: plan.source,
    terms,
    revision: plan.revision + 1,
    status: "DRAFT",
  });
}

export function requestPlanReview(input: Plan, expectedRevision: number): Plan {
  const plan = PlanSchema.parse(input);
  requireRevision(plan, expectedRevision);
  if (plan.status !== "DRAFT") {
    throw new Error("Only draft plans can enter review.");
  }
  return PlanSchema.parse({ ...plan, status: "IN_REVIEW" });
}

export function approvePlan(input: Plan, expectedRevision: number, userId: string): Plan {
  const plan = PlanSchema.parse(input);
  requireRevision(plan, expectedRevision);
  if (plan.status !== "IN_REVIEW") {
    throw new Error("Only plans in review can be approved.");
  }
  return PlanSchema.parse({
    ...plan,
    status: "APPROVED",
    approval: { userId, revision: plan.revision },
  });
}
