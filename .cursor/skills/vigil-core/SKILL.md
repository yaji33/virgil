---
name: vigil-core
description: Core workflow for implementing or modifying Vigil's deterministic policy engine, risk agents, and proposal evaluation flow. Use when working on the decision path, mandate schema, or risk evaluation logic.
---

# Vigil Core Skill

## When to Use

- Implementing or changing the policy engine
- Adding or modifying risk agents
- Working on the proposal → evaluation → decision flow
- Defining or evolving the Mandate schema
- Improving the audit trail

## Core Invariants (Never Violate)

1. Policy decisions are **deterministic** (pure code).
2. LLM can research / propose / explain, but never make the final APPROVE/BLOCK decision.
3. Every decision produces an audit record.
4. Demo Mode must remain fully functional without credentials.

## Recommended Implementation Order

1. Define / refine types & Zod schemas in `src/types/`
2. Implement pure risk evaluation functions in `src/risk/`
3. Implement deterministic policy engine in `src/policy/`
4. Wire the orchestrator in `src/core/`
5. Add audit logging
6. Add comprehensive tests (including boundary and edge cases)
7. Only then integrate real MCP calls

## Decision Output Contract

Always return a structured object containing at minimum:

- `decision`: `"APPROVE" | "BLOCK" | "NEEDS_HUMAN"`
- `reasons`: string[]
- `riskReport`: object with results from each risk agent
- `auditId`: string
- `timestamp`: ISO string
