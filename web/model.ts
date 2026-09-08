import { exceedsQuote, formatQuote, subtractQuote } from "../src/money/decimal.js";
import type { Order } from "../src/execution/order.js";
import { orderForRevision as executionOrderForRevision } from "../src/execution/gate.js";
import { PlanTermsSchema, type Plan, type PlanTerms } from "../src/plans/plan.js";
import type { Activity, Actor, PlanRecords, WorkspaceSnapshot } from "./api.js";
import type { PlanHistory } from "../src/plans/history.js";

export type { Activity, Actor, Order };
export { formatQuote, subtractQuote };

export function orderForRevision(
  orders: Order[],
  planId: string,
  planRevision: number,
): Order | undefined {
  return executionOrderForRevision(orders, planId, planRevision);
}

export type SnapshotState =
  | "current"
  | "loading"
  | "stale"
  | "disconnected"
  | "expired";

export interface AttentionItem {
  id: string;
  title: string;
  message: string;
  tone: "warning" | "attention" | "info";
  planId?: string;
}

export const EXAMPLE_STRATEGY = {
  id: "example-eth-strategy",
  title: "ETH accumulation",
  reserved: "350",
  baseAsset: "ETH",
  sourceLabel: "Example strategy",
} as const;

const SNAPSHOT_COPY: Record<
  SnapshotState,
  { label: string; captured: string; banner: string }
> = {
  current: {
    label: "Current illustration",
    captured: "Illustrative snapshot, captured just now",
    banner: "",
  },
  loading: {
    label: "Loading",
    captured: "Loading the illustrative snapshot",
    banner: "The example account snapshot is still loading. Approval stays blocked until it is current.",
  },
  stale: {
    label: "Stale",
    captured: "Illustrative snapshot, captured 12 minutes ago",
    banner: "This snapshot is stale. It is not live market or balance data.",
  },
  disconnected: {
    label: "Disconnected",
    captured: "Unavailable. The example workspace is disconnected.",
    banner: "The example connection is disconnected. Account impact is unavailable and approval is blocked.",
  },
  expired: {
    label: "Expired",
    captured: "Unavailable. The example connection expired.",
    banner: "The example connection expired. Reconnect is not available in this prototype.",
  },
};

export class PlanWorkspace {
  plans: Plan[] = [];
  orders: Order[] = [];
  activity: Activity[] = [];
  planHistory: PlanHistory[] = [];
  selectedId: string | undefined;
  actor: Actor | undefined;
  available = "500";
  reserved = "0";
  balance = "500";
  exampleHold = "0";
  capturedAt: string | undefined;
  environment: "DEMO" | "LIVE" = "DEMO";
  snapshot: SnapshotState = "current";

  constructor(private readonly records: PlanRecords) {}

  static async open(records: PlanRecords): Promise<PlanWorkspace> {
    const workspace = new PlanWorkspace(records);
    await workspace.boot();
    return workspace;
  }

  get selected(): Plan | undefined {
    return this.plans.find((plan) => plan.id === this.selectedId);
  }

  get conflict(): boolean {
    return this.exampleHold !== "0";
  }

  get snapshotReady(): boolean {
    return this.snapshot === "current" || this.snapshot === "stale";
  }

  get snapshotCopy(): (typeof SNAPSHOT_COPY)[SnapshotState] {
    return SNAPSHOT_COPY[this.snapshot];
  }

  get snapshotOptions(): { value: SnapshotState; label: string }[] {
    return (Object.keys(SNAPSHOT_COPY) as SnapshotState[]).map((value) => ({
      value,
      label: SNAPSHOT_COPY[value].label,
    }));
  }

  currentOrder(plan: Plan): Order | undefined {
    return orderForRevision(this.orders, plan.id, plan.revision)
      ?? this.orders
        .filter((order) => order.planId === plan.id)
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
  }

  exceedsBalance(plan: Plan): boolean {
    const open = orderForRevision(this.orders, plan.id, plan.revision);
    if (open?.status === "UNKNOWN" || open?.status === "PARTIAL") return false;
    return exceedsQuote(plan.terms.quoteAmount, this.available);
  }

  remainingAfter(plan: Plan): string | undefined {
    if (!this.snapshotReady) return undefined;
    const open = orderForRevision(this.orders, plan.id, plan.revision);
    if (open?.status === "UNKNOWN" || open?.status === "PARTIAL") return this.available;
    return subtractQuote(this.available, plan.terms.quoteAmount);
  }

  canApprove(plan: Plan): boolean {
    return this.snapshotReady && !this.exceedsBalance(plan);
  }

  canSubmit(plan: Plan): boolean {
    if (plan.status !== "APPROVED" || !this.canApprove(plan)) return false;
    const order = orderForRevision(this.orders, plan.id, plan.revision);
    return !order || order.status === "REJECTED";
  }

  attention(): AttentionItem[] {
    const items: AttentionItem[] = [];
    if (this.snapshot !== "current") {
      items.push({
        id: `snapshot-${this.snapshot}`,
        title: this.snapshotCopy.label,
        message: this.snapshotCopy.banner,
        tone: this.snapshot === "stale" ? "attention" : "warning",
      });
    }
    for (const plan of this.plans) {
      const order = this.currentOrder(plan);
      if (order?.status === "UNKNOWN") {
        items.push({
          id: `order-${order.id}`,
          title: plan.terms.title,
          message:
            "Order status is unknown. Reconcile before retrying or treating it as filled.",
          tone: "attention",
          planId: plan.id,
        });
        continue;
      }
      if (order?.status === "PARTIAL") {
        items.push({
          id: `order-${order.id}`,
          title: plan.terms.title,
          message: "A partial fill is recorded. Reconciliation can continue.",
          tone: "attention",
          planId: plan.id,
        });
        continue;
      }
      if (this.exceedsBalance(plan)) {
        items.push({
          id: `conflict-${plan.id}`,
          title: plan.terms.title,
          message: `${plan.terms.quoteAmount} USDT exceeds the ${this.available} USDT available in the example.`,
          tone: "warning",
          planId: plan.id,
        });
        continue;
      }
      if (plan.status === "IN_REVIEW") {
        items.push({
          id: `review-${plan.id}`,
          title: plan.terms.title,
          message: "Waiting for your review before terms can be approved.",
          tone: "attention",
          planId: plan.id,
        });
        continue;
      }
      if (plan.status === "DRAFT") {
        items.push({
          id: `draft-${plan.id}`,
          title: plan.terms.title,
          message: "Ready to review when you are.",
          tone: "info",
          planId: plan.id,
        });
      }
    }
    return items;
  }

  async save(terms: PlanTerms, editingId?: string, expectedRevision?: number): Promise<void> {
    const validated = PlanTermsSchema.parse(terms);
    if (editingId) {
      const existing = this.plans.find((plan) => plan.id === editingId);
      if (!existing) throw new Error("This plan is no longer available.");
      const plan = await this.records.revise(
        editingId,
        expectedRevision ?? -1,
        validated,
      );
      this.selectedId = plan.id;
    } else {
      const plan = await this.records.create(validated);
      this.selectedId = plan.id;
    }
    await this.refresh();
  }

  async review(): Promise<void> {
    const plan = this.requireSelected();
    await this.records.review(plan.id, plan.revision);
    await this.refresh();
  }

  async approve(): Promise<void> {
    const plan = this.requireSelected();
    if (!this.snapshotReady)
      throw new Error(
        "The illustrative snapshot is not current enough to approve these terms.",
      );
    if (this.exceedsBalance(plan))
      throw new Error(
        "The amount exceeds the available USDT balance. Adjust the plan before approving.",
      );
    await this.records.approve(plan.id, plan.revision);
    await this.refresh();
  }

  async submit(): Promise<void> {
    const plan = this.requireSelected();
    if (!this.snapshotReady)
      throw new Error(
        "The illustrative snapshot is not current enough to submit this plan.",
      );
    try {
      await this.records.submit(plan.id, plan.revision);
    } finally {
      await this.refresh();
    }
  }

  async reconcile(): Promise<void> {
    const plan = this.requireSelected();
    const order = this.currentOrder(plan);
    if (!order) throw new Error("This plan has no order to reconcile.");
    await this.records.reconcile(order.id);
    await this.refresh();
  }

  async resize(): Promise<void> {
    const plan = this.requireSelected();
    await this.save(
      {
        ...plan.terms,
        quoteAmount: this.available,
        intent: `Buy ${this.available} USDT of ${plan.terms.baseAsset} once`,
      },
      plan.id,
      plan.revision,
    );
  }

  async setConflict(enabled: boolean): Promise<void> {
    this.apply(await this.records.setExampleHold(enabled));
  }

  setSnapshot(snapshot: SnapshotState): void {
    this.snapshot = snapshot;
  }

  private async boot(): Promise<void> {
    this.apply(await this.records.boot());
  }

  private async refresh(): Promise<void> {
    this.apply(await this.records.read());
  }

  private apply(state: WorkspaceSnapshot): void {
    this.actor = state.actor;
    this.available = state.available;
    this.reserved = state.reserved;
    this.balance = state.workspace.account.balance;
    this.exampleHold = state.workspace.exampleHold;
    this.capturedAt = state.workspace.account.capturedAt;
    this.environment = state.environment;
    this.plans = state.plans;
    this.orders = state.orders;
    this.activity = state.activity;
    this.planHistory = state.planHistory;
    if (!this.selectedId || !this.plans.some((plan) => plan.id === this.selectedId)) {
      this.selectedId = this.plans[0]?.id;
    }
  }

  private requireSelected(): Plan {
    if (!this.selected) throw new Error("Select a plan first.");
    return this.selected;
  }
}
