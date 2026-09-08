import {
  hashToken,
  isExpired,
  issueToken,
  sessionExpiry,
  tokenMatches,
  type Actor,
} from "../auth/session.js";
import { exceedsQuote, subtractQuote } from "../money/decimal.js";
import {
  approvePlan,
  createPlan,
  requestPlanReview,
  revisePlan,
} from "../plans/lifecycle.js";
import {
  PlanTermsSchema,
  type Plan,
  type PlanTerms,
} from "../plans/plan.js";
import type { ActivityRecord, Database, WorkspaceRecord } from "../records/schema.js";
import type { RecordStore } from "../records/store.js";
import { conflict, forbidden, invalid, unauthorized } from "./errors.js";

export const DEMO_ACCOUNT_ID = "demo-account";
export const DEMO_BALANCE = "500";
export const EXAMPLE_HOLD = "350";

export interface WorkspaceState {
  actor: Actor;
  workspace: WorkspaceRecord;
  available: string;
  plans: Plan[];
  activity: ActivityRecord[];
}

export interface IssuedSession {
  token: string;
  actor: Actor;
}

function availableOf(workspace: WorkspaceRecord): string {
  return subtractQuote(workspace.account.balance, workspace.exampleHold);
}

function requireActor(db: Database, token: string | undefined): Actor {
  if (!token) throw unauthorized();
  const session = db.sessions.find((item) => tokenMatches(token, item.tokenHash));
  if (!session || isExpired(session.expiresAt)) throw unauthorized();
  const membership = db.memberships.find(
    (item) =>
      item.userId === session.userId && item.workspaceId === session.workspaceId,
  );
  if (!membership) throw unauthorized();
  return { userId: session.userId, workspaceId: session.workspaceId };
}

function requireWorkspace(db: Database, actor: Actor): WorkspaceRecord {
  const workspace = db.workspaces.find((item) => item.id === actor.workspaceId);
  if (!workspace) throw unauthorized();
  return workspace;
}

function requireOwnedPlan(db: Database, actor: Actor, planId: string): Plan {
  const plan = db.plans.find((item) => item.id === planId);
  if (!plan) throw forbidden("This plan is no longer available.");
  if (plan.workspaceId !== actor.workspaceId) throw forbidden();
  return plan;
}

function bindTerms(workspace: WorkspaceRecord, terms: PlanTerms): PlanTerms {
  return PlanTermsSchema.parse({
    ...terms,
    accountId: workspace.account.accountId,
    quoteAsset: workspace.account.quoteAsset,
  });
}

function replacePlan(db: Database, plan: Plan): void {
  const index = db.plans.findIndex((item) => item.id === plan.id);
  if (index === -1) db.plans.push(plan);
  else db.plans[index] = plan;
}

function record(
  db: Database,
  actor: Actor,
  plan: Plan,
  message: string,
): ActivityRecord {
  const event: ActivityRecord = {
    id: globalThis.crypto.randomUUID(),
    workspaceId: actor.workspaceId,
    planId: plan.id,
    title: plan.terms.title,
    revision: plan.revision,
    message,
    time: new Date().toISOString(),
  };
  db.activity.unshift(event);
  return event;
}

function stateOf(db: Database, actor: Actor): WorkspaceState {
  const workspace = requireWorkspace(db, actor);
  return {
    actor,
    workspace,
    available: availableOf(workspace),
    plans: db.plans.filter((plan) => plan.workspaceId === actor.workspaceId),
    activity: db.activity.filter((event) => event.workspaceId === actor.workspaceId),
  };
}

function lifecycleError(error: unknown): never {
  const message = error instanceof Error ? error.message : "Unable to update the plan.";
  if (message.includes("Plan changed")) throw conflict(message);
  throw invalid(message);
}

export class WorkspaceBoundary {
  constructor(private readonly store: RecordStore) {}

  openSession(token?: string): Promise<IssuedSession> {
    return this.store.transaction((db) => {
      if (token) {
        try {
          const actor = requireActor(db, token);
          return { token, actor };
        } catch {
          // Issue a new demo session when the cookie is missing or expired.
        }
      }
      const userId = globalThis.crypto.randomUUID();
      const workspaceId = globalThis.crypto.randomUUID();
      const issued = issueToken();
      db.workspaces.push({
        id: workspaceId,
        exampleHold: "0",
        account: {
          accountId: DEMO_ACCOUNT_ID,
          workspaceId,
          quoteAsset: "USDT",
          balance: DEMO_BALANCE,
        },
      });
      db.memberships.push({ userId, workspaceId });
      db.sessions.push({
        id: globalThis.crypto.randomUUID(),
        tokenHash: hashToken(issued),
        userId,
        workspaceId,
        createdAt: new Date().toISOString(),
        expiresAt: sessionExpiry(),
      });
      return { token: issued, actor: { userId, workspaceId } };
    });
  }

  read(token: string | undefined): Promise<WorkspaceState> {
    return this.store.transaction((db) => stateOf(db, requireActor(db, token)));
  }

  create(token: string | undefined, terms: PlanTerms): Promise<Plan> {
    return this.store.transaction((db) => {
      const actor = requireActor(db, token);
      const workspace = requireWorkspace(db, actor);
      const plan = createPlan({
        workspaceId: actor.workspaceId,
        source: { kind: "CONSUMER", userId: actor.userId },
        terms: bindTerms(workspace, terms),
      });
      replacePlan(db, plan);
      record(db, actor, plan, "Draft created.");
      return plan;
    });
  }

  revise(
    token: string | undefined,
    planId: string,
    expectedRevision: number,
    terms: PlanTerms,
  ): Promise<Plan> {
    return this.store.transaction((db) => {
      const actor = requireActor(db, token);
      const workspace = requireWorkspace(db, actor);
      const current = requireOwnedPlan(db, actor, planId);
      if (current.revision !== expectedRevision) {
        throw conflict("Plan changed. Review the latest revision.");
      }
      try {
        const plan = revisePlan(
          current,
          expectedRevision,
          bindTerms(workspace, terms),
        );
        replacePlan(db, plan);
        record(db, actor, plan, "Terms revised. Previous approval cleared.");
        return plan;
      } catch (error) {
        lifecycleError(error);
      }
    });
  }

  review(
    token: string | undefined,
    planId: string,
    expectedRevision: number,
  ): Promise<Plan> {
    return this.mutate(token, planId, expectedRevision, (current) => {
      try {
        return requestPlanReview(current, expectedRevision);
      } catch (error) {
        lifecycleError(error);
      }
    }, "Ready for your review.");
  }

  approve(
    token: string | undefined,
    planId: string,
    expectedRevision: number,
  ): Promise<Plan> {
    return this.store.transaction((db) => {
      const actor = requireActor(db, token);
      const workspace = requireWorkspace(db, actor);
      const current = requireOwnedPlan(db, actor, planId);
      if (current.revision !== expectedRevision) {
        throw conflict("Plan changed. Review the latest revision.");
      }
      if (exceedsQuote(current.terms.quoteAmount, availableOf(workspace))) {
        throw invalid(
          "The amount exceeds the illustrative available balance. Adjust the plan before approving.",
        );
      }
      try {
        const plan = approvePlan(current, expectedRevision, actor.userId);
        replacePlan(db, plan);
        record(db, actor, plan, "Terms approved in simulation. No order submitted.");
        return plan;
      } catch (error) {
        lifecycleError(error);
      }
    });
  }

  setExampleHold(token: string | undefined, enabled: boolean): Promise<WorkspaceState> {
    return this.store.transaction((db) => {
      const actor = requireActor(db, token);
      const workspace = requireWorkspace(db, actor);
      workspace.exampleHold = enabled ? EXAMPLE_HOLD : "0";
      if (enabled) {
        db.activity.unshift({
          id: globalThis.crypto.randomUUID(),
          workspaceId: actor.workspaceId,
          planId: "example-eth-strategy",
          title: "ETH accumulation",
          revision: 1,
          message:
            "Example strategy reserved 350 USDT in this illustration. No funds are locked.",
          time: new Date().toISOString(),
        });
      }
      return stateOf(db, actor);
    });
  }

  private mutate(
    token: string | undefined,
    planId: string,
    expectedRevision: number,
    apply: (plan: Plan) => Plan,
    message: string,
  ): Promise<Plan> {
    return this.store.transaction((db) => {
      const actor = requireActor(db, token);
      const current = requireOwnedPlan(db, actor, planId);
      if (current.revision !== expectedRevision) {
        throw conflict("Plan changed. Review the latest revision.");
      }
      const plan = apply(current);
      replacePlan(db, plan);
      record(db, actor, plan, message);
      return plan;
    });
  }
}
