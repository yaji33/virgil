#!/usr/bin/env tsx
/**
 * Vigil Demo Mode
 * Fully functional without any Binance credentials.
 */

import { evaluatePolicy } from "../src/policy/engine.js";
import { evaluatePositionSize } from "../src/risk/position-size.js";
import type { Mandate, Proposal } from "../src/types/mandate.js";

const mandate: Mandate = {
  name: "Demo Conservative Mandate",
  maxCapitalUsd: 5000,
  maxPositionSizeUsd: 800,
  maxDailyLossUsd: 200,
  allowedAssets: ["BTC", "ETH", "BNB", "USDT"],
  allowedProducts: ["SPOT"],
  requireHumanApprovalAboveUsd: 400,
  maxConcentrationPct: 35,
  blockedActions: ["WITHDRAW"],
};

const proposals: Proposal[] = [
  {
    id: "demo-001",
    action: "BUY",
    symbol: "BTCUSDT",
    product: "SPOT",
    quoteQuantityUsd: 250,
  },
  {
    id: "demo-002",
    action: "BUY",
    symbol: "DOGEUSDT",
    product: "SPOT",
    quoteQuantityUsd: 100,
  },
  {
    id: "demo-003",
    action: "BUY",
    symbol: "ETHUSDT",
    product: "SPOT",
    quoteQuantityUsd: 650,
  },
  {
    id: "demo-004",
    action: "BUY",
    symbol: "BTCUSDT",
    product: "FUTURES",
    quoteQuantityUsd: 300,
  },
];

console.log("═══════════════════════════════════════════════════");
console.log("  VIGIL — Deterministic Policy + Risk Guardian");
console.log("  Demo Mode (no real funds or account required)");
console.log("═══════════════════════════════════════════════════\n");

console.log("Active Mandate:", mandate.name);
console.log(JSON.stringify(mandate, null, 2));
console.log("\n───────────────────────────────────────────────────\n");

for (const proposal of proposals) {
  console.log(`Proposal: ${proposal.action} ${proposal.symbol} ($${proposal.quoteQuantityUsd}) [${proposal.product}]`);

  const riskResults = {
    "position-size": evaluatePositionSize(mandate, proposal, 1200),
  };

  const decision = evaluatePolicy(mandate, proposal, riskResults);

  console.log(`  → Decision: ${decision.decision}`);
  console.log(`  → Reasons:`);
  decision.reasons.forEach((r) => console.log(`     • ${r}`));
  console.log(`  → Audit ID: ${decision.auditId}`);
  console.log("");
}

console.log("Demo complete. All decisions were made deterministically.");
