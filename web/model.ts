import {
  approvePlan,
  createPlan,
  requestPlanReview,
  revisePlan,
} from "../src/plans/lifecycle.js";
import {
  PlanTermsSchema,
  type Plan,
  type PlanTerms,
} from "../src/plans/plan.js";

export type SnapshotState =
  | "current"
  | "loading"
  | "stale"
  | "disconnected"
  | "expired";

export type OutcomeExample =
  | "none"
  | "rejected"
  | "partial"
  | "unknown"
  | "receipt";

export interface Activity {
  id: string;
  planId: string;
  title: string;
  revision: number;
  message: string;
  time: string;
}

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

const OUTCOME_COPY: Record<
  OutcomeExample,
  { label: string; title: string; message: string }
> = {
  none: {
    label: "Do not show an example",
    title: "No order submitted",
    message: "Approval accepts terms only. This prototype does not place trades.",
  },
  rejected: {
    label: "Rejected order",
    title: "Example rejection",
    message:
      "The exchange would not accept this order. No fill is recorded. This is a labelled illustration, not an exchange confirmation.",
  },
  partial: {
    label: "Partial fill",
    title: "Example partial fill",
    message:
      "100 USDT of the planned purchase is shown as filled. The remainder would stay open. This is a labelled illustration, not an exchange confirmation.",
  },
  unknown: {
    label: "Unknown order status",
    title: "Example unknown status",
    message:
      "Reconciliation is underway before any retry. Submitted does not mean filled. This is a labelled illustration, not an exchange confirmation.",
  },
  receipt: {
    label: "Verified receipt",
    title: "Example verified receipt",
    message:
      "A completed fill would appear here with exchange references. Fees stay unavailable in this illustration. This is not an exchange confirmation.",
  },
};

export function quoteUnits(amount: string): bigint {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
}

export function formatQuote(units: bigint): string {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const whole = absolute / 10n ** 18n;
  const fraction = (absolute % 10n ** 18n)
    .toString()
    .padStart(18, "0")
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function subtractQuote(left: string, right: string): string {
  return formatQuote(quoteUnits(left) - quoteUnits(right));
}

export class PlanWorkspace {
  plans: Plan[] = [];
  activity: Activity[] = [];
  selectedId: string | undefined;
  conflict = false;
  snapshot: SnapshotState = "current";
  outcomeExample: OutcomeExample = "none";

  get selected(): Plan | undefined {
    return this.plans.find((plan) => plan.id === this.selectedId);
  }

  get available(): string {
    return this.conflict ? "150" : "500";
  }

  get snapshotReady(): boolean {
    return this.snapshot === "current" || this.snapshot === "stale";
  }

  get snapshotCopy(): (typeof SNAPSHOT_COPY)[SnapshotState] {
    return SNAPSHOT_COPY[this.snapshot];
  }

  get outcomeCopy(): (typeof OUTCOME_COPY)[OutcomeExample] {
    return OUTCOME_COPY[this.outcomeExample];
  }

  get snapshotOptions(): { value: SnapshotState; label: string }[] {
    return (Object.keys(SNAPSHOT_COPY) as SnapshotState[]).map((value) => ({
      value,
      label: SNAPSHOT_COPY[value].label,
    }));
  }

  get outcomeOptions(): { value: OutcomeExample; label: string }[] {
    return (Object.keys(OUTCOME_COPY) as OutcomeExample[]).map((value) => ({
      value,
      label: OUTCOME_COPY[value].label,
    }));
  }

  exceedsBalance(plan: Plan): boolean {
    return quoteUnits(plan.terms.quoteAmount) > quoteUnits(this.available);
  }

  remainingAfter(plan: Plan): string | undefined {
    if (!this.snapshotReady) return undefined;
    return subtractQuote(this.available, plan.terms.quoteAmount);
  }

  canApprove(plan: Plan): boolean {
    return this.snapshotReady && !this.exceedsBalance(plan);
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

  save(terms: PlanTerms, editingId?: string, expectedRevision?: number): void {
    const validated = PlanTermsSchema.parse(terms);
    const existing = this.plans.find((plan) => plan.id === editingId);
    if (editingId && !existing)
      throw new Error("This plan is no longer available.");
    this.outcomeExample = "none";
    const plan = existing
      ? revisePlan(existing, expectedRevision ?? -1, validated)
      : createPlan({
          workspaceId: "simulation",
          source: { kind: "CONSUMER", userId: "demo-user" },
          terms: validated,
        });
    this.record(
      plan,
      existing ? "Terms revised. Previous approval cleared." : "Draft created.",
    );
  }

  review(): void {
    const plan = this.requireSelected();
    this.record(
      requestPlanReview(plan, plan.revision),
      "Ready for your review.",
    );
  }

  approve(): void {
    const plan = this.requireSelected();
    if (!this.snapshotReady)
      throw new Error(
        "The illustrative snapshot is not current enough to approve these terms.",
      );
    if (this.exceedsBalance(plan))
      throw new Error(
        "The amount exceeds the illustrative available balance. Adjust the plan before approving.",
      );
    this.outcomeExample = "none";
    this.record(
      approvePlan(plan, plan.revision, "demo-user"),
      "Terms approved in simulation. No order submitted.",
    );
  }

  resize(): void {
    const plan = this.requireSelected();
    this.save(
      {
        ...plan.terms,
        quoteAmount: this.available,
        intent: `Buy ${this.available} USDT of ${plan.terms.baseAsset} once`,
      },
      plan.id,
      plan.revision,
    );
  }

  setConflict(enabled: boolean): void {
    this.conflict = enabled;
    if (!enabled) return;
    this.activity.unshift({
      id: globalThis.crypto.randomUUID(),
      planId: EXAMPLE_STRATEGY.id,
      title: EXAMPLE_STRATEGY.title,
      revision: 1,
      message:
        "Example strategy reserved 350 USDT in this illustration. No funds are locked.",
      time: new Date().toISOString(),
    });
  }

  setSnapshot(snapshot: SnapshotState): void {
    this.snapshot = snapshot;
  }

  setOutcome(outcome: OutcomeExample): void {
    this.outcomeExample = outcome;
  }

  private requireSelected(): Plan {
    if (!this.selected) throw new Error("Select a plan first.");
    return this.selected;
  }

  private record(plan: Plan, message: string): void {
    const index = this.plans.findIndex((item) => item.id === plan.id);
    if (index === -1) this.plans.push(plan);
    else this.plans[index] = plan;
    this.selectedId = plan.id;
    this.activity.unshift({
      id: globalThis.crypto.randomUUID(),
      planId: plan.id,
      title: plan.terms.title,
      revision: plan.revision,
      message,
      time: new Date().toISOString(),
    });
  }
}
