import { describe, expect, it } from "vitest";
import {
  PlanWorkspace,
  formatQuote,
  subtractQuote,
} from "../web/model.js";
import type { PlanTerms } from "../src/plans/plan.js";

const terms: PlanTerms = {
  title: "BTC purchase",
  intent: "Buy BTC once",
  accountId: "demo-account",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  quoteAmount: "250",
  product: "SPOT",
  action: "BUY",
  schedule: "ONCE",
};

describe("Prototype workspace", () => {
  it("checks the illustrative balance again when approving", () => {
    const workspace = new PlanWorkspace();
    workspace.save(terms);
    workspace.review();
    workspace.conflict = true;
    expect(() => workspace.approve()).toThrow("illustrative available balance");
    expect(workspace.selected?.status).toBe("IN_REVIEW");
    workspace.resize();
    expect(workspace.selected?.terms.quoteAmount).toBe("150");
    expect(workspace.selected?.revision).toBe(2);
    expect(() => workspace.approve()).toThrow("in review");
    workspace.review();
    workspace.approve();
    expect(workspace.selected?.status).toBe("APPROVED");
  });

  it("compares fractional balances exactly", () => {
    const workspace = new PlanWorkspace();
    workspace.save({ ...terms, quoteAmount: "150.000000000000000001" });
    workspace.conflict = true;
    expect(workspace.exceedsBalance(workspace.selected!)).toBe(true);
    workspace.save({ ...terms, quoteAmount: "150.000000000000000000" });
    expect(workspace.exceedsBalance(workspace.selected!)).toBe(false);
  });

  it("formats exact decimal subtraction without floats", () => {
    expect(subtractQuote("500", "250")).toBe("250");
    expect(subtractQuote("150", "250")).toBe("-100");
    expect(subtractQuote("150.5", "0.25")).toBe("150.25");
    expect(formatQuote(1n)).toBe("0.000000000000000001");
  });

  it("blocks approval when the snapshot is not ready", () => {
    const workspace = new PlanWorkspace();
    workspace.save(terms);
    workspace.review();
    workspace.setSnapshot("stale");
    expect(workspace.canApprove(workspace.selected!)).toBe(true);
    workspace.setSnapshot("loading");
    expect(workspace.canApprove(workspace.selected!)).toBe(false);
    workspace.setSnapshot("disconnected");
    expect(workspace.remainingAfter(workspace.selected!)).toBeUndefined();
    expect(() => workspace.approve()).toThrow("not current enough");
    expect(workspace.selected?.status).toBe("IN_REVIEW");
    workspace.setSnapshot("current");
    workspace.approve();
    expect(workspace.selected?.status).toBe("APPROVED");
  });

  it("exposes the labelled snapshot and execution examples", () => {
    const workspace = new PlanWorkspace();
    expect(workspace.snapshotOptions.map((item) => item.value)).toEqual([
      "current",
      "loading",
      "stale",
      "disconnected",
      "expired",
    ]);
    expect(workspace.outcomeOptions.map((item) => item.value)).toEqual([
      "none",
      "rejected",
      "partial",
      "unknown",
      "receipt",
    ]);
    workspace.setSnapshot("expired");
    expect(workspace.attention()[0]).toMatchObject({
      title: "Expired",
      tone: "warning",
    });
    expect(workspace.outcomeCopy.message).toContain("does not place trades");
  });

  it("keeps labelled outcomes and the example strategy off the plan lifecycle", () => {
    const workspace = new PlanWorkspace();
    workspace.save(terms);
    workspace.review();
    workspace.approve();
    workspace.setOutcome("receipt");
    expect(workspace.selected?.status).toBe("APPROVED");
    expect(workspace.outcomeExample).toBe("receipt");
    workspace.setConflict(true);
    expect(workspace.plans).toHaveLength(1);
    expect(workspace.activity[0]).toMatchObject({
      planId: "example-eth-strategy",
      title: "ETH accumulation",
    });
    expect(workspace.attention()[0]?.tone).toBe("warning");
    workspace.save({ ...terms, quoteAmount: "100" }, workspace.selected!.id, 1);
    expect(workspace.outcomeExample).toBe("none");
    expect(workspace.selected?.status).toBe("DRAFT");
  });

  it("edits only the selected plan and retains revision activity", () => {
    const workspace = new PlanWorkspace();
    workspace.save(terms);
    const first = workspace.selected!;
    workspace.save({ ...terms, title: "ETH purchase", baseAsset: "ETH" });
    workspace.save({ ...terms, quoteAmount: "100" }, first.id, 1);
    expect(workspace.plans).toHaveLength(2);
    expect(workspace.plans[1].terms.baseAsset).toBe("ETH");
    expect(workspace.activity[0]).toMatchObject({
      planId: first.id,
      revision: 2,
    });
    expect(workspace.activity[2]).toMatchObject({
      planId: first.id,
      revision: 1,
    });
    expect(() => workspace.save(terms, first.id, 1)).toThrow("Plan changed");
  });
});
