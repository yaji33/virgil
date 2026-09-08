# Virgil roadmap

One product with a consumer workspace and optional developer tools, sharing the same plan and execution foundation.

## Phases and completion gates

| Phase | Deliverable | Completion gate | Status |
| --- | --- | --- | --- |
| 0. Product and interface contract | Consumer journey, external-agent journey, interface specification, clickable review prototype | Target users understand the amount, authority, and next action | Complete |
| 1. Shared foundations | Validated plans, revision-bound approval, persistent records, trusted identities, account isolation, money handling | Invalid transitions, stale approvals, concurrent writes, and unauthorized access are rejected | Local demo foundation implemented; Supabase identity, targeted storage, and complete revision history pending |
| 1a. Execution and capital correctness | Durable attempts, recovery, reconciliation invariants, authoritative snapshots, policy checks, atomic reservations | Concurrent requests cannot overlap execution or spend the same reserved funds; uncertain outcomes remain recoverable | In progress: durable demo attempts, retry blocking, approved execution snapshots, and acknowledged demo restart recovery implemented |
| 2. First complete trade | App and internal API create, review, submit, and reconcile a single spot purchase | A user completes a real trade without a terminal and receives an exchange-backed receipt | Demo workflow implemented; connected execution depends on phase 1a |
| 3. Recurring plans and shared capital | Scheduling, reservations, integration budgets, open-order accounting, portfolio rules | Consumer and developer plans cannot reserve the same funds concurrently | Planned |
| 4. Adaptive planning | Checked alternatives for insufficient funds, conflicting orders, and changed conditions | Alternatives preserve the user's authority and are revalidated before execution | Planned |
| 5. Developer preview | Scoped API access, webhook delivery, traces, shared execution controls | An independent integration completes the workflow without bypassing consumer authority | Planned; execution recovery and duplicate prevention moved to phase 1a |
| 6. Product validation and public tools | Consumer and developer pilots, usability refinement, versioned SDK, documented API, judge demo | Repeat usage, successful task completion, and willingness to pay are measured | Planned |
| 7. Evidence-led expansion | Additional products, team workflows, treasury features, integrations | Each expansion addresses validated demand and verified exchange capabilities | Planned |

## First implementation slice

- Shared one-time spot-buy terms for consumer and integration sources.
- Draft, review, approval, and revision transitions.
- Approval invalidation when terms change.
- Decimal amounts represented as strings, explicitly denominated in the quote asset.
- Regression coverage for hard risk failures overriding approval thresholds.

This slice does not place live orders or reserve money. Plan approval expresses acceptance of terms, not execution authorization. Demo submit records an order and a labelled receipt without moving funds.

## Consumer prototype

Run `pnpm dev` for the browser workspace. The page opens a local demo session and stores plans, activity, orders, and an illustrative USDT balance in a local Postgres database on this computer (`data/virgil`). Refreshing keeps the signed-in workspace. Approval does not submit an order. Submit sends the approved revision to the demo exchange adapter; reconcile records unknown, rejected, partial, or filled status. Demo receipts do not move funds and are not Binance confirmations. The capital-conflict scenario records a labelled example hold and compares decimal amounts exactly; it does not implement reservations. Labelled snapshot examples cover loading, disconnected, expired, and stale account data. Developer tools and natural-language parsing are not presented as available features.

## Next slice

Execution correctness comes before connecting Binance. Attempts are now recorded before adapter calls, retain approved terms, and block overlapping submissions across revisions. Confirmed rejections can create a new attempt with a distinct identifier. Acknowledged demo orders can reconcile after a restart. Legacy orders remain readable, but missing historical terms are not reconstructed from edited plans.

Remaining gates:

1. Recover attempts interrupted before acknowledgement through a durable worker and adapter lookup by client identifier. These attempts currently remain unresolved and block retries; they are never assumed rejected.
2. Add immutable history for every plan revision and approval, beyond the snapshot retained by each new execution attempt.
3. Introduce targeted PostgreSQL operations, migrations, Supabase Auth, tenant isolation, and a standalone backend lifecycle.
4. Enforce policy, authoritative balance freshness, and atomic capital reservations before execution.
5. Implement and verify Binance integration, including recovery in testnet, before explicitly authorized real-market execution.

Supabase is the planned hosted database and identity provider. Provision a development project first; schema creation belongs in reviewed migrations. Credentials alone do not enable live execution.

## Working method

Define the outcome, design the interaction, implement the complete slice, verify behavior, and review the result. Keep phase status tied to evidence. Internal interfaces come first; public compatibility commitments follow the developer pilot.

Live and simulation are explicit environments. Verify Binance capabilities at integration time. Respect the selected connection's confirmation requirements. No live trading credentials or authority are assumed by this roadmap.
