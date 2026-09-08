# Virgil roadmap

One product with a consumer workspace and optional developer tools, sharing the same plan and execution foundation.

## Phases and completion gates

| Phase | Deliverable | Completion gate | Status |
| --- | --- | --- | --- |
| 0. Product and interface contract | Consumer journey, external-agent journey, interface specification, clickable review prototype | Target users understand the amount, authority, and next action | Complete |
| 1. Shared foundations | Validated plans, revision-bound approval, persistent records, trusted identities, account isolation, money handling | Invalid transitions, stale approvals, concurrent writes, and unauthorized access are rejected | Complete for local demo sessions; reservations and live balances are not included |
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

This slice does not submit orders or reserve money. Plan approval expresses acceptance of terms, not execution authorization.

## Consumer prototype

Run `pnpm dev` for the browser workspace. The page opens a local demo session and stores plans, activity, and an illustrative USDT balance on this computer. Refreshing keeps the signed-in workspace. The capital-conflict scenario records a labelled example hold and compares decimal amounts exactly; it does not implement reservations or live execution. Labelled snapshot and execution examples cover loading, disconnected, expired, stale, rejected, partial-fill, unknown, and receipt states without implying a live connection or a submitted order. Developer tools and natural-language parsing are not presented as available features.

## Next slice

Connect verified execution for a single spot purchase. Keep the authenticated boundary, revision checks, and workspace-scoped accounts in front of any exchange adapter. Do not treat plan approval as an order.

## Working method

Define the outcome, design the interaction, implement the complete slice, verify behavior, and review the result. Keep phase status tied to evidence. Internal interfaces come first; public compatibility commitments follow the developer pilot.

Live and simulation are explicit environments. Verify Binance capabilities at integration time. Respect the selected connection's confirmation requirements. No live trading credentials or authority are assumed by this roadmap.
