# Virgil product contract

Virgil turns trading intentions into clear plans, coordinates their capital, and follows execution through to a verified result.

## Audiences

Consumers understand buying and selling crypto but do not want to configure scripts or supervise every order. Developers bring strategies and agents that submit structured proposals to the same application boundary.

The consumer app is the default experience. Developer tools are optional. Neither source bypasses rules, approval, account isolation, or capital reservations.

## First journeys

Consumer: create a one-time BTC purchase denominated in USDT, review terms, approve, submit, inspect the receipt.

Developer: submit equivalent structured terms with an integration identity, route the plan through review, and receive execution events once those capabilities exist.

Shared-capital milestone: a consumer plan and an external strategy compete for a pool. Virgil reserves funds transactionally and offers checked alternatives to the second plan.

## Contracts

- A plan is persistent intent with versioned structured terms. Chat is an input method.
- Text is explanatory; validated structured terms define the action. Contradictions require clarification.
- Plan approval accepts one revision. Editing any terms removes that approval.
- Evaluation is advisory. Execution revalidates current rules, permissions, account state, and available capital.
- Order status is separate from plan status. Submitted does not mean filled.
- Workspace and integration identifiers are references, not authentication credentials.
- The server derives actor identity from authentication and checks ownership before domain operations.
- A database transaction must compare the stored revision and atomically update state. Pure lifecycle functions alone do not prevent concurrent writes or forged records.
- Exchange metadata determines valid assets, quantities, and order filters.
- Quote amounts use decimal strings. The initial schema supports up to 20 integer and 18 fractional digits; this is a format boundary, not an exchange limit or risk budget.
- Exact decimal arithmetic, valuation, fees, precision normalization, and exchange constraints are separate execution requirements. USDT amounts are not implicitly USD amounts.
- A hard risk failure cannot be overridden by a human-approval threshold.
- Virgil governs its execution path and reconciles external activity. It cannot prevent independent credentials from trading elsewhere.

## Approval and execution

The current lifecycle models DRAFT -> IN_REVIEW -> APPROVED. Editing returns a plan to DRAFT with a new revision. The application boundary authenticates the actor, scopes workspaces, and applies those transitions inside a transactional store that compares the stored revision before writing.

Before live execution, add policy evaluation, current account reconciliation, reservations, action-specific approval, and the execution adapter. Retain the precise terms, actor, timestamps, and exchange references in durable records.

## Initial scope

One-time spot buys with explicit account, base asset, quote asset, and quote amount. Recurring schedules, sells, transfers, execution-method selection, and custom constraints must be introduced explicitly rather than accepted as ignored fields.

The legacy policy demo remains a separate prototype. Its daily-loss and concentration settings are not fully enforced; its decisions do not authorize live execution. The new plan lifecycle is not yet connected to it.

## Measures

Track unaided onboarding, comprehension of approvals, reconciled executions, interventions, repeat plan usage, developer integration completion, willingness to pay, and support cost. Short-term profit is not a substitute for workflow correctness.
