import "./style.css";
import { PlanWorkspace } from "./model.js";
import { isOutcomeExample, isSnapshotState, workspaceView } from "./view.js";

const workspace = new PlanWorkspace();
let page: "overview" | "plans" | "activity" = "overview";
const app = document.querySelector<HTMLDivElement>("#app")!;

function render(focusAction?: string): void {
  app.innerHTML = workspaceView(workspace, page);
  if (focusAction)
    app
      .querySelector<HTMLButtonElement>(`[data-action="${focusAction}"]`)
      ?.focus();
}

let editing: { id: string; revision: number } | undefined;
function openEditor(edit = false): void {
  const plan = edit ? workspace.selected : undefined;
  editing = plan ? { id: plan.id, revision: plan.revision } : undefined;
  document.querySelector<HTMLInputElement>("#title")!.value =
    plan?.terms.title ?? "";
  document.querySelector<HTMLSelectElement>("#asset")!.value =
    plan?.terms.baseAsset ?? "BTC";
  document.querySelector<HTMLInputElement>("#amount")!.value =
    plan?.terms.quoteAmount ?? "";
  document.querySelector("#dialog-title")!.textContent = plan
    ? "Edit your plan"
    : "Create a plan";
  document.querySelector("#save-plan")!.textContent = plan
    ? "Save new revision"
    : "Create draft";
  document.querySelector("#editor-note")!.textContent = plan
    ? "Saving creates a new draft and clears any previous approval."
    : "Start with the essentials. You’ll review before approving.";
  document.querySelector("#form-error")!.textContent = "";
  document.querySelector<HTMLDialogElement>("#plan-dialog")!.showModal();
  document.querySelector<HTMLInputElement>("#title")!.focus();
}

function announce(message: string): void {
  document.querySelector("#announcement")!.textContent = message;
}

app.addEventListener("submit", (event) => {
  if (!(event.target instanceof HTMLFormElement)) return;
  event.preventDefault();
  const data = new FormData(event.target);
  const title = String(data.get("title") ?? "").trim();
  const baseAsset = String(data.get("asset"));
  const quoteAmount = String(data.get("amount") ?? "").trim();
  try {
    workspace.save(
      {
        title,
        baseAsset,
        quoteAmount,
        quoteAsset: "USDT",
        accountId: "demo-account",
        product: "SPOT",
        action: "BUY",
        schedule: "ONCE",
        intent: `Buy ${quoteAmount} USDT of ${baseAsset} once`,
      },
      editing?.id,
      editing?.revision,
    );
    document.querySelector<HTMLDialogElement>("#plan-dialog")!.close();
    page = "plans";
    render("review");
    announce(
      editing
        ? "Plan revised. Previous approval cleared."
        : "Draft created. Ready for review.",
    );
  } catch {
    document.querySelector("#form-error")!.textContent = !title
      ? "Give your plan a name."
      : "Enter a positive decimal amount without commas or exponent notation (up to 20 integer and 18 decimal digits).";
    document
      .querySelector<HTMLInputElement>(!title ? "#title" : "#amount")!
      .focus();
  }
});

app.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  if ("snapshot" in target.dataset && isSnapshotState(target.value)) {
    workspace.setSnapshot(target.value);
    render();
    app.querySelector<HTMLSelectElement>("[data-snapshot]")?.focus();
    announce(workspace.snapshotCopy.banner || "Using the current illustration.");
    return;
  }
  if ("outcome" in target.dataset && isOutcomeExample(target.value)) {
    workspace.setOutcome(target.value);
    render();
    app.querySelector<HTMLSelectElement>("[data-outcome]")?.focus();
    announce(
      workspace.outcomeExample === "none"
        ? "No order submitted."
        : workspace.outcomeCopy.message,
    );
  }
});

app.addEventListener("click", (event) => {
  const target = (event.target as Element).closest<HTMLElement>(
    "button, .brand",
  );
  if (!target) return;
  if (target.matches(".brand")) {
    event.preventDefault();
    page = "overview";
    render();
    return;
  }
  if (target.dataset.page) {
    page = target.dataset.page as typeof page;
    render();
    app.querySelector<HTMLButtonElement>(`[data-page="${page}"]`)?.focus();
    return;
  }
  if (target.dataset.attention) {
    workspace.selectedId = target.dataset.attention;
    page = "plans";
    render();
    app
      .querySelector<HTMLButtonElement>(`[data-plan="${workspace.selectedId}"]`)
      ?.focus();
    return;
  }
  if (target.dataset.plan) {
    workspace.selectedId = target.dataset.plan;
    render();
    app
      .querySelector<HTMLButtonElement>(`[data-plan="${workspace.selectedId}"]`)
      ?.focus();
    return;
  }
  try {
    switch (target.dataset.action) {
      case "new":
        openEditor();
        return;
      case "edit":
        openEditor(true);
        return;
      case "close":
        document.querySelector<HTMLDialogElement>("#plan-dialog")!.close();
        return;
      case "scenario":
        workspace.setConflict(!workspace.conflict);
        render("scenario");
        announce(
          workspace.conflict
            ? "Conflict simulation enabled. 150 USDT available in example."
            : "Conflict simulation disabled.",
        );
        return;
      case "review":
        workspace.review();
        render("approve");
        announce("Plan in review. Check the terms before approving.");
        return;
      case "approve":
        workspace.approve();
        render("edit");
        announce("Terms approved. No order submitted.");
        return;
      case "resize":
        workspace.resize();
        render("review");
        announce("Amount adjusted. Review the new revision.");
        return;
    }
  } catch (error) {
    announce(
      error instanceof Error ? error.message : "Unable to update the plan.",
    );
  }
});

render();
