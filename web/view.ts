import {
  EXAMPLE_STRATEGY,
  type Activity,
  type AttentionItem,
  type OutcomeExample,
  type PlanWorkspace,
  type SnapshotState,
} from "./model.js";
import type { Plan } from "../src/plans/plan.js";

export const labels = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  APPROVED: "Terms approved",
};

export const escape = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

export const button = (
  action: string,
  text: string,
  className = "secondary",
): string =>
  `<button class="${className}" data-action="${action}">${text}</button>`;

export function status(plan: Plan): string {
  return `<span class="status ${plan.status.toLowerCase()}">${labels[plan.status]}</span>`;
}

function options(
  items: { value: string; label: string }[],
  selected: string,
): string {
  return items
    .map(
      (item) =>
        `<option value="${item.value}" ${item.value === selected ? "selected" : ""}>${escape(item.label)}</option>`,
    )
    .join("");
}

export function activity(events: Activity[]): string {
  return events.length
    ? `<ol class="timeline">${events
        .map(
          (event) => `
    <li><span class="event-dot"></span><div><strong>${escape(event.title)} <span class="revision">v${event.revision}</span></strong><p>${escape(event.message)}</p></div>
    <time datetime="${event.time}">${new Date(event.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></li>`,
        )
        .join("")}</ol>`
    : `<div class="quiet-empty"><span class="empty-icon">↗</span><h3>A clear record, from the first step.</h3><p>Create a plan to start your workspace activity.</p></div>`;
}

function attention(items: AttentionItem[]): string {
  return `<section class="attention" aria-label="Needs attention"><div class="section-heading"><h2>Needs attention</h2><span class="small-tag">${items.length}</span></div><ol>${items
    .map(
      (item) =>
        `<li class="${item.tone}">${
          item.planId
            ? `<button data-attention="${item.planId}"><strong>${escape(item.title)}</strong><p>${escape(item.message)}</p></button>`
            : `<div><strong>${escape(item.title)}</strong><p>${escape(item.message)}</p></div>`
        }</li>`,
    )
    .join("")}</ol></section>`;
}

function balances(workspace: PlanWorkspace): string {
  const ready = workspace.snapshotReady;
  const reserved = workspace.conflict ? EXAMPLE_STRATEGY.reserved : "0";
  const value = (amount: string) =>
    ready
      ? `<strong>${escape(amount)}<span> USDT</span></strong>`
      : `<strong class="unavailable">${workspace.snapshot === "loading" ? "…" : "—"}<span> USDT</span></strong>`;
  return `<section class="balance-grid ${workspace.snapshot}" aria-label="Illustrative account balances">
    <div class="balance"><span>Demo balance</span>${value("500")}<small>${escape(workspace.snapshotCopy.captured)}</small></div>
    <div class="balance"><span>Available in example</span>${value(workspace.available)}<small>Before any proposed purchase</small></div>
    <div class="balance"><span>Reserved by example strategy</span>${value(reserved)}<small>${workspace.conflict ? "Labelled illustration. No reservations are created." : "No reservations are actually created"}</small></div>
  </section>`;
}

function impact(workspace: PlanWorkspace, plan: Plan): string {
  const remaining = workspace.remainingAfter(plan);
  if (remaining === undefined) {
    return "Unavailable until the illustrative snapshot is current.";
  }
  if (workspace.exceedsBalance(plan)) {
    return `This purchase exceeds the ${workspace.available} USDT available in the example.`;
  }
  return `If this purchase were filled, ${remaining} USDT would remain in the example.`;
}

function outcomeCard(workspace: PlanWorkspace): string {
  if (workspace.outcomeExample === "none") return "";
  const tone =
    workspace.outcomeExample === "receipt"
      ? "success"
      : workspace.outcomeExample === "rejected"
        ? "danger"
        : "warning";
  return `<section class="notice ${tone}"><span class="eyebrow">LABELLED EXECUTION EXAMPLE</span><h3>${escape(workspace.outcomeCopy.title)}</h3><p>${escape(workspace.outcomeCopy.message)}</p></section>`;
}

function exampleStrategy(): string {
  return `<div class="plan-item example" aria-label="Example integration plan"><span class="plan-item-title">${EXAMPLE_STRATEGY.title}</span><span class="plan-item-amount">${EXAMPLE_STRATEGY.reserved} USDT <span>→ ${EXAMPLE_STRATEGY.baseAsset}</span></span><span class="status integration">${EXAMPLE_STRATEGY.sourceLabel}</span></div>`;
}

export function planDetail(workspace: PlanWorkspace, plan: Plan): string {
  const insufficient = workspace.exceedsBalance(plan);
  const blockedSnapshot = !workspace.snapshotReady;
  const step =
    plan.status === "DRAFT" ? 0 : plan.status === "IN_REVIEW" ? 1 : 2;
  return `<article class="detail" aria-label="Selected plan">
    <div class="detail-top"><span class="eyebrow">ONE-TIME PURCHASE <span class="revision">v${plan.revision}</span></span>${status(plan)}</div>
    <h2>${escape(plan.terms.title)}</h2><p class="intent">${escape(plan.terms.intent)}</p>
    <ol class="steps" aria-label="Plan progress">${["Draft", "Review", "Approved terms"].map((name, index) => `<li class="${index <= step ? "reached" : ""}" ${index === step ? 'aria-current="step"' : ""}><span>${index < step ? "✓" : index + 1}</span>${name}</li>`).join("")}</ol>
    <div class="purchase"><div class="asset-icon">${escape(plan.terms.baseAsset.slice(0, 1))}</div><div><span class="muted">You plan to buy</span><strong>${escape(plan.terms.baseAsset)}</strong></div><div class="purchase-amount"><strong>${escape(plan.terms.quoteAmount)}</strong><span>USDT · Spot</span></div></div>
    <dl class="terms">
      <div><dt>Account</dt><dd>Demo account <span class="small-tag">SIMULATED</span></dd></div>
      <div><dt>Schedule</dt><dd>Once</dd></div>
      <div><dt>Created by</dt><dd>You</dd></div>
      <div><dt>Proposed spend</dt><dd>${escape(plan.terms.quoteAmount)} USDT</dd></div>
      <div><dt>Account impact</dt><dd>${escape(impact(workspace, plan))}</dd></div>
      <div><dt>Fees and fill price</dt><dd>Unavailable without an exchange quote</dd></div>
      <div><dt>Order status</dt><dd>No order submitted</dd></div>
    </dl>
    ${
      blockedSnapshot
        ? `<section class="notice warning"><span class="eyebrow">ILLUSTRATIVE SNAPSHOT</span><h3>${escape(workspace.snapshotCopy.label)}</h3><p>${escape(workspace.snapshotCopy.banner)}</p></section>`
        : insufficient
          ? `<section class="notice warning"><span class="eyebrow">${workspace.conflict ? "SIMULATED CAPITAL CONFLICT" : "ILLUSTRATIVE BALANCE CHECK"}</span><h3>This plan needs an adjustment.</h3><p>${workspace.conflict ? "An example ETH strategy reserves 350 of the 500 USDT demo balance." : "The demo balance is 500 USDT."} Your ${escape(plan.terms.quoteAmount)} USDT purchase exceeds the ${workspace.available} USDT available.</p><div class="button-row">${button("resize", `Use ${workspace.available} USDT`, "primary")}${button("edit", "Choose another amount")}</div><p class="fine">Resizing creates a draft and clears any previous approval. This illustration does not reserve real capital.</p></section>`
          : plan.status === "APPROVED"
            ? `<section class="notice success"><h3>Terms approved. You’re in control.</h3><p>Revision ${plan.revision} has your approval in this session. No funds have moved. Editing the plan requires a fresh review.</p></section>`
            : `<section class="notice"><h3>${plan.status === "DRAFT" ? "Your intention, ready to review." : "Review the terms before approving."}</h3><p>Approval accepts this version of the plan. This prototype does not connect to Binance, reserve funds, or execute a trade.</p></section>`
    }
    ${outcomeCard(workspace)}
    <label class="outcome-control"><span class="eyebrow">LABELLED EXECUTION EXAMPLE</span><select data-outcome aria-label="Explore a labelled execution example">${options(workspace.outcomeOptions, workspace.outcomeExample)}</select><span class="fine">Examples stay separate from approval. They do not submit an order.</span></label>
    <div class="detail-actions">${button("edit", "Edit plan")}${plan.status === "DRAFT" ? button("review", 'Review this plan <span aria-hidden="true">→</span>', "primary") : plan.status === "IN_REVIEW" ? `<button class="${workspace.canApprove(plan) ? "primary" : "secondary"}" data-action="approve" ${workspace.canApprove(plan) ? "" : "disabled"}>Approve purchase of ${escape(plan.terms.quoteAmount)} USDT of ${escape(plan.terms.baseAsset)}</button>` : `<span class="approved-label">✓ Approved terms · v${plan.revision}</span>`}</div>
    <details class="technical"><summary>Inspect structured plan</summary><pre>${escape(JSON.stringify(plan, null, 2))}</pre></details>
  </article>`;
}

export function plans(workspace: PlanWorkspace): string {
  if (!workspace.plans.length)
    return `<section class="welcome panel"><div class="orbit" aria-hidden="true"><span>V</span></div><span class="eyebrow">A LITTLE INTENTION GOES A LONG WAY</span><h2>Your first plan starts here.</h2><p>Decide what to buy. Review the details.<br>Keep every change and approval in view.</p>${button("new", 'Create your first plan <span aria-hidden="true">↗</span>', "primary")}<div class="welcome-foot"><span>01 &nbsp; Create</span><span>02 &nbsp; Review</span><span>03 &nbsp; Approve terms</span></div></section>`;
  return `<section class="plan-workspace panel"><aside class="plan-list" aria-label="Your plans"><div class="list-title">YOUR PLANS <span>${workspace.plans.length}</span></div>${workspace.plans.map((plan) => `<button class="plan-item ${plan.id === workspace.selectedId ? "selected" : ""}" data-plan="${plan.id}" aria-pressed="${plan.id === workspace.selectedId}"><span class="plan-item-title">${escape(plan.terms.title)}</span><span class="plan-item-amount">${escape(plan.terms.quoteAmount)} USDT <span>→ ${escape(plan.terms.baseAsset)}</span></span>${status(plan)}</button>`).join("")}${workspace.conflict ? exampleStrategy() : ""}${button("new", "+ Add a plan", "text-button")}</aside>${workspace.selected ? planDetail(workspace, workspace.selected) : ""}</section>`;
}

export function workspaceView(
  workspace: PlanWorkspace,
  page: "overview" | "plans" | "activity",
): string {
  const heading =
    page === "overview"
      ? ["YOUR PLANS, IN ORDER", "A clear plan. A calmer mind.", "Give your next move a little more intention."]
      : page === "plans"
        ? ["INTENTIONS WITH STRUCTURE", "Intentions with structure.", "Create, review, and revise one-time purchases."]
        : ["EVERY STEP, ACCOUNTED FOR", "Every step, accounted for.", "The decisions and changes saved for this workspace."];
  return `<a class="skip-link" href="#main">Skip to workspace</a><div class="shell">
    <aside class="sidebar"><a class="brand" href="#" aria-label="Virgil overview"><span class="brand-mark">V</span>virgil<span class="brand-period">.</span></a><span class="workspace-label">PERSONAL WORKSPACE</span>
      <nav aria-label="Main navigation">${(
        [
          ["overview", "◫", "Overview"],
          ["plans", "▤", "Plans"],
          ["activity", "↗", "Activity"],
        ] as const
      )
        .map(
          ([id, icon, label]) =>
            `<button data-page="${id}" class="nav-item ${page === id ? "active" : ""}" ${page === id ? 'aria-current="page"' : ""}><span aria-hidden="true">${icon}</span>${label}${id === "plans" ? `<span class="nav-count">${workspace.plans.length}</span>` : ""}</button>`,
        )
        .join("")}</nav>
      <div class="sidebar-note"><span class="small-tag">PROTOTYPE</span><p>A signed-in local workspace.<br>No exchange connected.</p><span class="fine">Plans are saved on this computer. Refreshing keeps them.</span></div><div class="profile"><span class="avatar">Y</span><div>You<span>Signed in · Personal workspace</span></div><span class="profile-dot"></span></div></aside>
    <div class="main-shell"><header class="topbar"><span>Workspace <span class="slash">/</span> ${page[0].toUpperCase() + page.slice(1)}</span><div class="environment"><span class="live-dot ${workspace.snapshot}"></span>Local simulation <span class="top-divider">|</span><span class="muted">No live funds</span><label class="snapshot-control">Snapshot <select data-snapshot aria-label="Explore a labelled account snapshot">${options(workspace.snapshotOptions, workspace.snapshot)}</select></label></div></header>
    ${workspace.snapshot !== "current" ? `<div class="snapshot-banner ${workspace.snapshot}" role="status">${escape(workspace.snapshotCopy.banner)}</div>` : ""}
    <main id="main"><div class="page-heading"><div><span class="eyebrow">${heading[0]}</span><h1>${heading[1]}</h1><p>${heading[2]}</p></div>${page !== "activity" ? button("new", "+ Create plan", "primary") : ""}</div>
    ${page === "overview" ? `${workspace.attention().length ? attention(workspace.attention()) : ""}${balances(workspace)}` : ""}
    ${page !== "activity" ? `<section class="scenario"><div><span class="scenario-icon" aria-hidden="true">◇</span><div><strong>Explore a capital conflict</strong><p>See what changes when another strategy needs the same funds.</p></div></div><button class="switch ${workspace.conflict ? "on" : ""}" data-action="scenario" role="switch" aria-checked="${workspace.conflict}" aria-label="Simulate capital conflict"><span></span></button></section>${plans(workspace)}` : `<section class="panel activity-panel"><div class="section-heading"><h2>Workspace activity</h2><span class="small-tag">SAVED RECORD</span></div>${activity(workspace.activity)}</section>`}
    ${page === "overview" && workspace.activity.length ? `<section class="panel recent-panel"><div class="section-heading"><h2>Recent in this workspace</h2><span class="small-tag">SAVED RECORD</span></div>${activity(workspace.activity.slice(0, 3))}</section>` : ""}
    <footer class="page-footer"><span><span class="footer-mark">V</span> Your intention. Your approval.</span><span>Simulation only · No trades are placed</span></footer></main></div></div>
    <div id="announcement" class="sr-only" role="status" aria-live="polite"></div>
    <dialog id="plan-dialog" aria-labelledby="dialog-title"><form id="plan-form" novalidate><div class="dialog-heading"><span class="eyebrow">ONE-TIME SPOT PURCHASE</span><button type="button" data-action="close" class="close" aria-label="Close plan editor">×</button></div><h2 id="dialog-title">Create a plan</h2><p id="editor-note" class="muted">Start with the essentials. You’ll review before approving.</p><label for="title">Plan name</label><input id="title" name="title" maxlength="120" placeholder="My BTC purchase" required><div class="form-row"><div><label for="asset">Asset to buy</label><select id="asset" name="asset"><option>BTC</option><option>ETH</option><option>BNB</option></select></div><div><label for="amount">Amount in USDT</label><input id="amount" name="amount" inputmode="decimal" placeholder="150" required aria-describedby="amount-help"></div></div><p id="amount-help" class="fine">Use a positive decimal amount. Fees are not estimated.</p><div class="form-fixed"><span>Account <strong>Demo account</strong></span><span>Schedule <strong>Once</strong></span></div><p id="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="secondary" data-action="close">Cancel</button><button class="primary" type="submit" id="save-plan">Create draft</button></div></form></dialog>`;
}

export function isSnapshotState(value: string): value is SnapshotState {
  return ["current", "loading", "stale", "disconnected", "expired"].includes(
    value,
  );
}

export function isOutcomeExample(value: string): value is OutcomeExample {
  return ["none", "rejected", "partial", "unknown", "receipt"].includes(value);
}
