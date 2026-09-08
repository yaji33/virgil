# Virgil roadmap

One product with a consumer workspace and optional developer tools, sharing the same plan and execution foundation.

## Phases and completion gates

| Phase | Deliverable | Completion gate | Status |
| --- | --- | --- | --- |
| 0. Product and interface contract | Consumer journey, external-agent journey, interface specification, clickable review prototype | Target users understand the amount, authority, and next action | Contracts written; prototype and user review pending |
| 1. Shared foundations | Validated plans, revision-bound approval, persistent records, trusted identities, account isolation, money handling | Invalid transitions, stale approvals, concurrent writes, and unauthorized access are rejected | Plan lifecycle started; persistence and authorization pending |
| 2. First complete trade | App and internal API create, review, submit, and reconcile a single spot purchase | A user completes a real trade without a terminal and receives an exchange-backed receipt | Planned |
| 3. Recurring plans and shared capital | Scheduling, reservations, integration budgets, open-order accounting, portfolio rules | Consumer and developer plans cannot reserve the same funds concurrently | Planned |
| 4. Adaptive planning | Checked alternatives for insufficient funds, conflicting orders, and changed conditions | Alternatives preserve the user's authority and are revalidated before execution | Planned |
| 5. Recovery and developer preview | Restart recovery, partial fills, duplicate prevention, scoped API access, webhook delivery, traces | Failure scenarios reconcile correctly; an independent integration completes the workflow | Planned |
| 6. Product validation and public tools | Consumer and developer pilots, usability refinement, versioned SDK, documented API, judge demo | Repeat usage, successful task completion, and willingness to pay are measured | Planned |
| 7. Evidence-led expansion | Additional products, team workflows, treasury features, integrations | Each expansion addresses validated demand and verified exchange capabilities | Planned |

## First implementation slice

- Shared one-time spot-buy terms for consumer and integration sources.
- Draft, review, approval, and revision transitions.
- Approval invalidation when terms change.
- Decimal amounts represented as strings, explicitly denominated in the quote asset.
- Regression coverage for hard risk failures overriding approval thresholds.

This slice does not submit orders, authenticate callers, reserve money, or persist records. Plan approval expresses acceptance of terms, not execution authorization.

## Next slice

Build the consumer review prototype against the shared plan module using explicitly simulated account data. Include plan editing, re-review, and a clearly labelled competing-capital illustration. Do not imply that the illustration enforces reservations.

Then add a transactional repository and authenticated application boundary before exposing the lifecycle over HTTP. Enforce revision checks against stored state, scope accounts to workspaces, and bind actor identity to authentication.

## Working method

Define the outcome, design the interaction, implement the complete slice, verify behavior, and review the result. Keep phase status tied to evidence. Internal interfaces come first; public compatibility commitments follow the developer pilot.

Live and simulation are explicit environments. Verify Binance capabilities at integration time. Respect the selected connection's confirmation requirements. No live trading credentials or authority are assumed by this roadmap.
