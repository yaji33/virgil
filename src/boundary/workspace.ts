import {
  hashToken,
  isExpired,
  issueToken,
  sessionExpiry,
  tokenMatches,
  type Actor,
} from "../auth/session.js";
import type { AccountSnapshot, ExecutionAdapter } from "../execution/adapter.js";
import { recordPlanHistory, type PlanHistory } from "../plans/history.js";
import { lookupSnapshot, recordExchange, unresolved } from "../execution/reconcile.js";
import { DemoExchange } from "../execution/demo.js";
import { assertCanSubmit } from "../execution/gate.js";
import { OrderSchema, type Order } from "../execution/order.js";
import { exceedsQuote } from "../money/decimal.js";
import { availableQuote, reservedTotal } from "../capital/available.js";
import { requireCurrentSnapshot } from "../capital/snapshot.js";
import { evaluateExecution } from "../policy/execution.js";
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
import { RecordConflict } from "../records/conflict.js";
import type { Records, RecordScope } from "../records/store.js";
import { conflict, forbidden, invalid, unauthorized } from "./errors.js";

export const DEMO_ACCOUNT_ID = "demo-account";
export const DEMO_BALANCE = "500";
export const EXAMPLE_HOLD = "350";

export interface WorkspaceState {
  actor: Actor;
  workspace: WorkspaceRecord;
  available: string;
  reserved: string;
  environment: "DEMO" | "LIVE";
  plans: Plan[];
  orders: Order[];
  activity: ActivityRecord[];
  planHistory: PlanHistory[];
}

export interface IssuedSession {
  token: string;
  actor: Actor;
}

function availableOf(
  workspace: WorkspaceRecord,
  orders: Order[],
  environment: "DEMO" | "LIVE",
): string {
  return availableQuote(
    environment === "LIVE" ? { ...workspace, exampleHold: "0" } : workspace,
    orders,
  );
}

function applySnapshot(
  workspace: WorkspaceRecord,
  snapshot: AccountSnapshot,
  environment: "DEMO" | "LIVE",
): void {
  if (snapshot.accountId !== workspace.account.accountId ||
    snapshot.quoteAsset !== workspace.account.quoteAsset) {
    throw invalid("The account snapshot does not match this workspace.");
  }
  workspace.account.capturedAt = snapshot.capturedAt;
  if (environment === "LIVE") workspace.account.balance = snapshot.balance;
}

function assertExecution(terms: Plan["terms"], available: string): void {
  const decision = evaluateExecution(terms, available);
  if (decision.decision === "BLOCK") {
    throw invalid(decision.reasons[0] ?? "This plan is not allowed to execute.");
  }
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

function stateOf(db: Database, actor: Actor, environment: "DEMO" | "LIVE"): WorkspaceState {
  const workspace = requireWorkspace(db, actor);
  const orders = db.orders.filter((order) => order.workspaceId === actor.workspaceId);
  return {
    actor,
    workspace,
    available: availableOf(workspace, orders, environment),
    reserved: reservedTotal(orders, actor.workspaceId),
    environment,
    plans: db.plans.filter((plan) => plan.workspaceId === actor.workspaceId),
    orders,
    planHistory: db.planHistory.filter((entry) => entry.plan.workspaceId === actor.workspaceId),
    activity: db.activity.filter((event) => event.workspaceId === actor.workspaceId),
  };
}

function replaceOrder(db: Database, order: Order): void {
  const index = db.orders.findIndex((item) => item.id === order.id);
  if (index === -1) db.orders.push(order);
  else db.orders[index] = order;
}

function lifecycleError(error: unknown): never {
  const message = error instanceof Error ? error.message : "Unable to update the plan.";
  if (message.includes("Plan changed")) throw conflict(message);
  throw invalid(message);
}

export class WorkspaceBoundary {
  constructor(
    private readonly store: Records,
    private readonly exchange: ExecutionAdapter = new DemoExchange("filled", store),
  ) {}

  private run<T>(
    fn: (db: Database) => T,
    scope?: RecordScope,
  ): Promise<T> {
    return this.store.transaction(fn, scope).catch((error: unknown) => {
      if (error instanceof RecordConflict) throw conflict(error.message);
      throw error;
    });
  }

  openSession(token?: string): Promise<IssuedSession> {
    return this.run((db) => {
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
          capturedAt: new Date().toISOString(),
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
    }, token ? { tokenHash: hashToken(token) } : undefined);
  }

  async openAuthenticatedSession(
    userId: string,
    token?: string,
    expiresAt = sessionExpiry(),
  ): Promise<IssuedSession> {
    if (token) {
      try {
        const current = await this.run((db) => {
          const actor = requireActor(db, token);
          if (actor.userId !== userId) throw unauthorized();
          return { token, actor };
        }, { tokenHash: hashToken(token) });
        return current;
      } catch {
        // Replace an expired or mismatched application session.
      }
    }
    return this.run((db) => {
      let membership = db.memberships.find((item) => item.userId === userId);
      if (!membership) {
        const workspaceId = globalThis.crypto.randomUUID();
        db.workspaces.push({
          id: workspaceId,
          exampleHold: "0",
          account: {
            accountId: DEMO_ACCOUNT_ID,
            workspaceId,
            quoteAsset: "USDT",
            balance: DEMO_BALANCE,
            capturedAt: new Date().toISOString(),
          },
        });
        membership = { userId, workspaceId };
        db.memberships.push(membership);
      }
      const issued = issueToken();
      db.sessions.push({
        id: globalThis.crypto.randomUUID(),
        tokenHash: hashToken(issued),
        userId,
        workspaceId: membership.workspaceId,
        createdAt: new Date().toISOString(),
        expiresAt,
      });
      return {
        token: issued,
        actor: { userId, workspaceId: membership.workspaceId },
      };
    }, { userId });
  }

  closeSession(token: string | undefined): Promise<void> {
    if (!token) return Promise.resolve();
    return this.run((db) => {
      const hash = hashToken(token);
      db.sessions = db.sessions.filter((session) => session.tokenHash !== hash);
    }, { tokenHash: hashToken(token) });
  }

  currentSession(token: string | undefined): Promise<Actor> {
    return this.run(
      (db) => requireActor(db, token),
      token ? { tokenHash: hashToken(token) } : undefined,
    );
  }

  async read(token: string | undefined): Promise<WorkspaceState> {
    if (this.exchange.environment !== "LIVE") {
      return this.run((db) => stateOf(db, requireActor(db, token), this.exchange.environment), token ? { tokenHash: hashToken(token) } : undefined);
    }
    const accountId = await this.run((db) =>
      requireWorkspace(db, requireActor(db, token)).account.accountId,
    token ? { tokenHash: hashToken(token) } : undefined);
    const snapshot = await requireCurrentSnapshot(this.exchange, accountId);
    return this.run((db) => {
      const actor = requireActor(db, token);
      const workspace = requireWorkspace(db, actor);
      applySnapshot(workspace, snapshot, this.exchange.environment);
      return stateOf(db, actor, this.exchange.environment);
    }, token ? { tokenHash: hashToken(token) } : undefined);
  }

  create(token: string | undefined, terms: PlanTerms): Promise<Plan> {
    return this.run((db) => {
      const actor = requireActor(db, token);
      const workspace = requireWorkspace(db, actor);
      const plan = createPlan({
        workspaceId: actor.workspaceId,
        source: { kind: "CONSUMER", userId: actor.userId },
        terms: bindTerms(workspace, terms),
      });
      recordPlanHistory(db, plan, actor);
      replacePlan(db, plan);
      record(db, actor, plan, "Draft created.");
      return plan;
    }, token ? { tokenHash: hashToken(token) } : undefined);
  }

  revise(
    token: string | undefined,
    planId: string,
    expectedRevision: number,
    terms: PlanTerms,
  ): Promise<Plan> {
    return this.run((db) => {
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
        recordPlanHistory(db, plan, actor);
        replacePlan(db, plan);
        record(db, actor, plan, "Terms revised. Previous approval cleared.");
        return plan;
      } catch (error) {
        lifecycleError(error);
      }
    }, token ? { tokenHash: hashToken(token) } : undefined);
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

  async approve(
    token: string | undefined,
    planId: string,
    expectedRevision: number,
  ): Promise<Plan> {
    const accountId = await this.run(
      (db) => requireWorkspace(db, requireActor(db, token)).account.accountId,
      token ? { tokenHash: hashToken(token) } : undefined,
    );
    const snapshot = await requireCurrentSnapshot(this.exchange, accountId);
    return this.run((db) => {
      const actor = requireActor(db, token);
      const workspace = requireWorkspace(db, actor);
      const current = requireOwnedPlan(db, actor, planId);
      if (current.revision !== expectedRevision) {
        throw conflict("Plan changed. Review the latest revision.");
      }
      applySnapshot(workspace, snapshot, this.exchange.environment);
      const available = availableOf(workspace, db.orders, this.exchange.environment);
      if (exceedsQuote(current.terms.quoteAmount, available)) {
        throw invalid(
          "The amount exceeds the available USDT balance. Adjust the plan before approving.",
        );
      }
      assertExecution(current.terms, available);
      try {
        const plan = approvePlan(current, expectedRevision, actor.userId);
        recordPlanHistory(db, plan, actor);
        replacePlan(db, plan);
        record(db, actor, plan, "Terms approved. No order submitted.");
        return plan;
      } catch (error) {
        lifecycleError(error);
      }
    }, token ? { tokenHash: hashToken(token) } : undefined);
  }

  async submit(
    token: string | undefined,
    planId: string,
    expectedRevision: number,
  ): Promise<Order> {
    const accountId = await this.run(
      (db) => requireWorkspace(db, requireActor(db, token)).account.accountId,
      token ? { tokenHash: hashToken(token) } : undefined,
    );
    const snapshot = await requireCurrentSnapshot(this.exchange, accountId);
    const prepared = await this.run((db) => {
      const actor = requireActor(db, token);
      const workspace = requireWorkspace(db, actor);
      const plan = requireOwnedPlan(db, actor, planId);
      if (plan.revision !== expectedRevision) {
        throw conflict("Plan changed. Review the latest revision.");
      }
      applySnapshot(workspace, snapshot, this.exchange.environment);
      const available = availableOf(workspace, db.orders, this.exchange.environment);
      assertCanSubmit(plan, available, db.orders);
      assertExecution(plan.terms, available);
      const id = globalThis.crypto.randomUUID();
      const now = new Date().toISOString();
      const order = OrderSchema.parse({
        id, workspaceId: actor.workspaceId, planId: plan.id,
        planRevision: plan.revision, approvedPlan: plan, environment: this.exchange.environment,
        exchangeOrderId: `pending-${id}`, status: "UNKNOWN",
        submittedAt: now, updatedAt: now,
      });
      replaceOrder(db, order);
      record(db, actor, plan, "Execution attempt recorded. Quote is reserved until the order fills or is rejected.");
      return { actor, plan, workspace, order };
    }, token ? { tokenHash: hashToken(token) } : undefined);
    const exchangeSnapshot = await this.exchange.submitSpotBuy({
      idempotencyKey: prepared.order.id,
      accountId: prepared.workspace.account.accountId,
      baseAsset: prepared.plan.terms.baseAsset,
      quoteAsset: prepared.plan.terms.quoteAsset,
      quoteAmount: prepared.plan.terms.quoteAmount,
    });
    return this.run(
      (db) => recordExchange(db, prepared.order.id, exchangeSnapshot),
      token ? { tokenHash: hashToken(token) } : undefined,
    );
  }

  async reconcile(token: string | undefined, orderId: string): Promise<Order> {
    const current = await this.run((db) => {
      const actor = requireActor(db, token);
      const order = db.orders.find((item) => item.id === orderId);
      if (!order || order.workspaceId !== actor.workspaceId) {
        throw forbidden("This order is no longer available.");
      }
      return order;
    }, token ? { tokenHash: hashToken(token) } : undefined);
    if (!unresolved(current)) return current;
    const snapshot = await lookupSnapshot(this.exchange, current);
    return this.run((db) => {
      const actor = requireActor(db, token);
      const order = db.orders.find((item) => item.id === orderId);
      if (!order || order.workspaceId !== actor.workspaceId) {
        throw forbidden("This order is no longer available.");
      }
      return snapshot ? recordExchange(db, orderId, snapshot) : order;
    }, token ? { tokenHash: hashToken(token) } : undefined);
  }

  setExampleHold(token: string | undefined, enabled: boolean): Promise<WorkspaceState> {
    return this.run((db) => {
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
      return stateOf(db, actor, this.exchange.environment);
    }, token ? { tokenHash: hashToken(token) } : undefined);
  }

  private mutate(
    token: string | undefined,
    planId: string,
    expectedRevision: number,
    apply: (plan: Plan) => Plan,
    message: string,
  ): Promise<Plan> {
    return this.run((db) => {
      const actor = requireActor(db, token);
      const current = requireOwnedPlan(db, actor, planId);
      if (current.revision !== expectedRevision) {
        throw conflict("Plan changed. Review the latest revision.");
      }
      const plan = apply(current);
      recordPlanHistory(db, plan, actor);
      replacePlan(db, plan);
      record(db, actor, plan, message);
      return plan;
    }, token ? { tokenHash: hashToken(token) } : undefined);
  }
}
