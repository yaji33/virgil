# Vigil

**Deterministic Policy + Multi-Agent Risk Guardian for Binance Agent OS**

Vigil is a control-plane layer that sits in front of any AI trading or research agent connected to Binance Agent OS.  
It enforces user-defined mandates through a **deterministic rules engine** and specialized risk agents. Only approved actions reach the Binance MCP server.

> Proposed actions are evaluated. Never trusted by default.

---

## Core Principles

- **Deterministic first** — Policy decisions are made by pure code, not LLM judgment.
- **Least privilege** — Only the scopes and limits the user explicitly grants.
- **Full auditability** — Every proposal, risk assessment, and decision is logged immutably.
- **Isolation** — Designed around Binance Agentic sub-accounts (no external withdrawals by default).
- **Demo-safe** — Fully functional simulation mode with zero real funds or account required.

---

## Architecture Overview

```
Upstream Agent / Human
        │
        ▼
┌───────────────────────┐
│   Proposal Intake     │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│  Multi-Agent Risk     │  ← Volatility • Size • Concentration • Drawdown • Regime • Funding
│  Evaluation Layer     │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│  Deterministic Policy │  ← User Mandate (rules + limits)
│  Engine               │
└───────────┬───────────┘
            │
     ┌──────┴──────┐
     ▼             ▼
 APPROVE         BLOCK / NEEDS_HUMAN
     │
     ▼
Binance MCP (Agentic sub-account)
```

---

## Features (Necessary Scope)

| Component                    | Status     | Description |
|-----------------------------|------------|-------------|
| Deterministic Policy Engine | Core       | User mandate → structured decision |
| Specialized Risk Agents     | Core       | Position size, concentration, volatility, max loss, asset allowlist, product type |
| Proposal → Decision Flow    | Core       | Clear APPROVE / BLOCK / NEEDS_HUMAN |
| Immutable Audit Trail       | Core       | Timestamped, queryable, exportable |
| Binance MCP Integration     | Core       | Official `https://agent.binance.com/mcp/agentic` |
| Demo Mode                   | Core       | Fully simulated, zero credentials required |
| Mandate Definition          | Core       | JSON / typed config (capital limits, allowed assets, max position, etc.) |

---

## Tech Stack

- **Runtime**: Node.js 22+
- **Language**: TypeScript (strict)
- **Package Manager**: pnpm (recommended) or npm
- **Testing**: Vitest
- **Validation**: Zod
- **Binance**: Official MCP Server + Skills Hub
- **Agent Framework**: Compatible with Claude Code, Cursor, Codex, custom MCP clients

---

## Quick Start

```bash
# 1. Clone
git clone <repo-url> vigil
cd vigil

# 2. Install
pnpm install

# 3. Run in Demo Mode (no Binance account needed)
pnpm demo

# 4. Run tests
pnpm test
```

### Connect to Live Binance Agent OS (optional)

```bash
# Add official Binance MCP (Claude example)
claude mcp add binance-mcp-server --transport http https://agent.binance.com/mcp/agentic

# Authenticate and grant scopes via the client UI
# Fund the Agentic sub-account manually (Profile → Sub-account → Transfer)
```

Install Binance Skills Hub (optional, for richer market context):

```bash
npx skills add https://github.com/binance/binance-skills-hub
```

---

## Project Structure

```
vigil/
├── .cursor/
│   ├── rules/                 # Project rules for Cursor Agent
│   └── skills/                # Project-specific skills
├── .agents/
│   └── skills/                # Additional agent skills (taste, design, etc.)
├── src/
│   ├── core/                  # Orchestrator & main flow
│   ├── policy/                # Deterministic policy engine
│   ├── risk/                  # Specialized risk agents
│   ├── mcp/                   # Binance MCP client & adapters
│   ├── audit/                 # Audit trail implementation
│   └── types/                 # Shared types & Zod schemas
├── tests/                     # Unit + integration + edge cases
├── docs/                      # Architecture, mandate schema, examples
└── scripts/                   # Demo runners, utilities
```

---

## Mandate Example

```json
{
  "name": "Conservative Spot Only",
  "maxCapitalUsd": 5000,
  "maxPositionSizeUsd": 500,
  "maxDailyLossUsd": 150,
  "allowedAssets": ["BTC", "ETH", "BNB", "USDT"],
  "allowedProducts": ["SPOT"],
  "requireHumanApprovalAboveUsd": 300,
  "maxConcentrationPct": 40,
  "blockedActions": ["WITHDRAW", "TRANSFER_EXTERNAL"]
}
```

---

## Decision Output Shape

```ts
{
  decision: "APPROVE" | "BLOCK" | "NEEDS_HUMAN",
  reasons: string[],
  riskReport: {
    positionSize: RiskResult,
    concentration: RiskResult,
    volatility: RiskResult,
    // ...
  },
  auditId: string,
  timestamp: string
}
```

---

## Testing Philosophy

- Unit tests for every pure policy rule and risk agent
- Edge cases: dust amounts, max leverage edge, sudden vol spikes, partial fills, regime shifts
- Integration tests for the full proposal → decision → audit flow
- Demo Mode must pass the same test suite as Live Mode (with mocked MCP)

---

## Team Notes

- Team size: 2–3
- Primary agentic coding tool: Cursor
- Heavy frontend is allowed (Next.js / polished dashboard) but the **core engine remains the priority**
- Follow Binance patterns for order types, precision, and risk concepts where applicable

---

## License

MIT

---

**Vigil** — Actions are proposed. Rules decide.
