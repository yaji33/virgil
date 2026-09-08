import {
  hashToken,
  isExpired,
  issueToken,
  sessionExpiry,
  tokenMatches,
  type Actor,
} from "../auth/session.js";
import type { ExecutionAdapter, ExchangeSnapshot } from "../execution/adapter.js";
import { DemoExchange } from "../execution/demo.js";
import { assertCanSubmit } from "../execution/gate.js";
import { OrderSchema, type Order } from "../execution/order.js";
import { exceedsQuote, quoteUnits, subtractQuote } from "../money/decimal.js";
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
import type { Records } from "../records/store.js";
import { conflict, forbidden, invalid, unauthorized } from "./errors.js";

export const DEMO_ACCOUNT_ID = "demo-account";
export const DEMO_BALANCE = "500";
export const EXAMPLE_HOLD = "350";

export interface WorkspaceState {
  actor: Actor;
  workspace: WorkspaceRecord;
  available: string;
  environment: "DEMO" | "LIVE";
  plans: Plan[];
  orders: Order[];
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

function stateOf(db: Database, actor: Actor, environment: "DEMO" | "LIVE"): WorkspaceState {
  const workspace = requireWorkspace(db, actor);
  return {
    actor,
    workspace,
    available: availableOf(workspace),
    environment,
    plans: db.plans.filter((plan) => plan.workspaceId === actor.workspaceId),
    orders: db.orders.filter((order) => order.workspaceId === actor.workspaceId),
    activity: db.activity.filter((event) => event.workspaceId === actor.workspaceId),
  };
}

function applyExchange(
  base: {
    id: string;
    workspaceId: string;
    planId: string;
    planRevision: number;
    approvedPlan?: Plan;
    environment: "DEMO";
    exchangeOrderId: string;
    submittedAt: string;
  },
  snapshot: ExchangeSnapshot,
): Order {
  if (base.approvedPlan && (snapshot.status === "FILLED" || snapshot.status === "PARTIAL")) {
    const total = quoteUnits(base.approvedPlan.terms.quoteAmount);
    const filled = quoteUnits(snapshot.filledQuoteAmount);
    if (filled > total || (snapshot.status === "PARTIAL" &&
      filled + quoteUnits(snapshot.remainingQuoteAmount) !== total)) {
      throw invalid("Exchange quantities do not match the approved amount.");
    }
  }
  const updatedAt = new Date().toISOString();
  if (snapshot.status === "UNKNOWN") {
    return OrderSchema.parse({
      ...base,
      exchangeOrderId: snapshot.exchangeOrderId,
      status: "UNKNOWN",
      updatedAt,
    });
  }
  if (snapshot.status === "REJECTED") {
    return OrderSchema.parse({
      ...base,
      exchangeOrderId: snapshot.exchangeOrderId,
      status: "REJECTED",
      reason: snapshot.reason,
      updatedAt,
    });
  }
  if (snapshot.status === "PARTIAL") {
    return OrderSchema.parse({
      ...base,
      exchangeOrderId: snapshot.exchangeOrderId,
      status: "PARTIAL",
      filledQuoteAmount: snapshot.filledQuoteAmount,
      remainingQuoteAmount: snapshot.remainingQuoteAmount,
      updatedAt,
    });
  }
  return OrderSchema.parse({
    ...base,
    exchangeOrderId: snapshot.exchangeOrderId,
    status: "FILLED",
    filledQuoteAmount: snapshot.filledQuoteAmount,
    receiptId: snapshot.receiptId,
    updatedAt,
  });
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
    private readonly exchange: ExecutionAdapter = new DemoExchange(),
  ) {}

  private run<T>(fn: (db: Database) => T): Promise<T> {
    return this.store.transaction(fn).catch((error: unknown) => {
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
    return this.run((db) =>
      stateOf(db, requireActor(db, token), this.exchange.environment),
    );
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
    return this.run((db) => {
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
        record(db, actor, plan, "Terms approved. No order submitted.");
        return plan;
      } catch (error) {
        lifecycleError(error);
      }
    });
  }

  async submit(
    token: string | undefined,
    planId: string,
    expectedRevision: number,
  ): Promise<Order> {
    if (this.exchange.environment !== "DEMO") throw invalid("Live Binance execution is not enabled.");
    const prepared = await this.run((db) => {
      const actor = requireActor(db, token);
      const workspace = requireWorkspace(db, actor);
      const plan = requireOwnedPlan(db, actor, planId);
      if (plan.revision !== expectedRevision) {
        throw conflict("Plan changed. Review the latest revision.");
      }
      assertCanSubmit(plan, availableOf(workspace), db.orders);
      const id = globalThis.crypto.randomUUID();
      const now = new Date().toISOString();
      const order = OrderSchema.parse({
        id, workspaceId: actor.workspaceId, planId: plan.id,
        planRevision: plan.revision, approvedPlan: plan, environment: "DEMO",
        exchangeOrderId: `pending-${id}`, status: "UNKNOWN",
        submittedAt: now, updatedAt: now,
      });
      replaceOrder(db, order);
      record(db, actor, plan, "Execution attempt recorded. Outcome is not yet known.");
      return { actor, plan, workspace, order };
    });
    const snapshot = await this.exchange.submitSpotBuy({
      idempotencyKey: prepared.order.id,
      accountId: prepared.workspace.account.accountId,
      baseAsset: prepared.plan.terms.baseAsset,
      quoteAsset: prepared.plan.terms.quoteAsset,
      quoteAmount: prepared.plan.terms.quoteAmount,
    });
    return this.run((db) => {
      const { actor, plan } = prepared;
      const current = db.orders.find((item) => item.id === prepared.order.id)!;
      if (current.status !== "UNKNOWN") return current;
      const order = applyExchange(
        {
          id: prepared.order.id,
          workspaceId: actor.workspaceId,
          planId: plan.id,
          planRevision: plan.revision,
          approvedPlan: plan,
          environment: "DEMO",
          exchangeOrderId: snapshot.exchangeOrderId,
          submittedAt: prepared.order.submittedAt,
        },
        snapshot,
      );
      replaceOrder(db, order);
      record(
        db,
        actor,
        plan,
        order.status === "UNKNOWN"
          ? "Order submitted. Reconciliation is required before treating it as filled."
          : order.status === "REJECTED"
            ? "Order rejected by the demo exchange. No fill is recorded."
            : "Order submitted to the demo exchange.",
      );
      return order;
    });
  }

  async reconcile(token: string | undefined, orderId: string): Promise<Order> {
    const current = await this.run((db) => {
      const actor = requireActor(db, token);
      const order = db.orders.find((item) => item.id === orderId);
      if (!order || order.workspaceId !== actor.workspaceId) {
        throw forbidden("This order is no longer available.");
      }
      return order;
    });
    if (current.status === "FILLED" || current.status === "REJECTED") {
      return current;
    }
    const terms = current.approvedPlan?.terms;
    const snapshot = await this.exchange.fetchOrder(current.exchangeOrderId, terms ? {
      idempotencyKey: current.id, accountId: terms.accountId,
      baseAsset: terms.baseAsset, quoteAsset: terms.quoteAsset, quoteAmount: terms.quoteAmount,
    } : undefined);
    if (snapshot.exchangeOrderId !== current.exchangeOrderId) {
      throw invalid("Exchange order identity changed during reconciliation.");
    }
    return this.run((db) => {
      const actor = requireActor(db, token);
      const order = db.orders.find((item) => item.id === orderId);
      if (!order || order.workspaceId !== actor.workspaceId) {
        throw forbidden("This order is no longer available.");
      }
      if (order.status === "FILLED" || order.status === "REJECTED") return order;
      if (order.status === "PARTIAL") {
        if (snapshot.status === "UNKNOWN") return order;
        if (snapshot.status === "REJECTED" ||
          quoteUnits(snapshot.filledQuoteAmount) < quoteUnits(order.filledQuoteAmount)) {
          throw invalid("Exchange reconciliation cannot discard a recorded fill.");
        }
      }
      const next = applyExchange(
        {
          id: order.id,
          workspaceId: order.workspaceId,
          planId: order.planId,
          planRevision: order.planRevision,
          approvedPlan: order.approvedPlan,
          environment: order.environment,
          exchangeOrderId: order.exchangeOrderId,
          submittedAt: order.submittedAt,
        },
        snapshot,
      );
      replaceOrder(db, next);
      const plan = order.approvedPlan ?? {
        ...requireOwnedPlan(db, actor, order.planId), revision: order.planRevision,
      };
      record(
        db,
        actor,
        plan,
        next.status === "FILLED"
          ? "Demo receipt recorded. Funds were not moved."
          : next.status === "REJECTED"
            ? "Order rejected after reconciliation. No fill is recorded."
            : next.status === "PARTIAL"
              ? "Partial fill recorded. Reconciliation can continue."
              : "Order status is still unknown. Awaiting reconciliation.",
      );
      return next;
    });
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
    });
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
      replacePlan(db, plan);
      record(db, actor, plan, message);
      return plan;
    });
  }
}
