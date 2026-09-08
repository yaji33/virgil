# Virgil roadmap

One product with a consumer workspace and optional developer tools, sharing the same plan and execution foundation.

## Phases and completion gates

| Phase | Deliverable | Completion gate | Status |
| --- | --- | --- | --- |
| 0. Product and interface contract | Consumer journey, external-agent journey, interface specification, clickable review prototype | Target users understand the amount, authority, and next action | Complete |
| 1. Shared foundations | Validated plans, revision-bound approval, persistent records, trusted identities, account isolation, money handling | Invalid transitions, stale approvals, concurrent writes, and unauthorized access are rejected | Hosted Postgres migration, scoped workspace transactions, Supabase OAuth PKCE session bridge, RLS tenant policies, immutable history, and standalone backend are implemented. A configured provider and user-completed hosted callback remain to be verified |
| 1a. Execution and capital correctness | Durable attempts, recovery, reconciliation invariants, authoritative snapshots, policy checks, atomic reservations | Concurrent requests cannot overlap execution or spend the same reserved funds; uncertain outcomes remain recoverable | Durable demo attempts, shared reconcile/recovery checks, lost-acknowledgement lookup, leases, immutable history, plan-native execution policy, current snapshot checks, and atomic quote reservations implemented. Live snapshots use Binance free quote when live execution is enabled |
| 2. First complete trade | App and internal API create, review, submit, and reconcile a single spot purchase | A user completes a real trade without a terminal and receives an exchange-backed receipt | An authorized Binance spot testnet fill and recovery lookup were verified through the internal application boundary. A user-completed browser run remains before closing the no-terminal gate |
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

That first slice does not place live orders. Plan approval expresses acceptance of terms, not execution authorization.

## Consumer prototype

Run `pnpm dev` for the browser workspace. The page opens a local demo session and stores plans, activity, orders, and an illustrative USDT balance in a local Postgres database on this computer (`data/virgil`). Refreshing keeps the signed-in workspace. Approval does not submit an order. Submit sends the approved revision to the demo exchange adapter and reserves quote until the order fills or is rejected. Reconcile records unknown, rejected, partial, or filled status. A demo fill updates the illustrative workspace balance; it is still not a Binance confirmation. The capital-conflict scenario records a labelled example hold in addition to real open-order reservations. Labelled snapshot examples cover loading, disconnected, expired, and stale account data. Developer tools and natural-language parsing are not presented as available features.

## Next slice

Demo remains the default. A Binance spot testnet REST adapter is available when `VIRGIL_EXECUTION=live` and API keys are set. Live workspace reads load the current Binance balance before rendering. Approve and submit require a current account snapshot, re-run plan-native execution policy, and reserve quote so concurrent plans cannot spend the same funds. Submit acknowledgements stay unknown until an order query confirms the fill. Signed requests synchronize with Binance server time and retry once when clock drift is rejected. Mainnet REST stays off unless `VIRGIL_BINANCE_REAL=yes`.

On September 8, 2026, an authorized 10 USDT BTC spot testnet plan completed through the application boundary. Binance order `13494676` reconciled as filled for `9.44006040` USDT with receipt `binance-13494676`; the reservation returned to zero. A separate lookup by the persisted client order identifier returned the same filled order, confirming the recovery query path against Binance data.

The Supabase development project received migration `202609080001_initial_workspace.sql` on September 8, 2026. A hosted smoke check created and read an authenticated workspace through the scoped Postgres adapter, confirmed RLS on all eight application tables, and proved that an authenticated role could see only its own workspace. Temporary smoke records were removed. Database connections use the Supabase Root 2021 CA with certificate and hostname verification.

Remaining gates:

1. Enable Google or GitHub in Supabase, allow the local callback URL, then verify OAuth sign-in, sign-out, and session restoration from the hosted browser.
2. Map the intended Supabase user and import the selected local workspace without copying local session hashes.
3. Complete the same exchange-backed flow from the browser without terminal assistance, then review the resulting receipt with the user.

Supabase is the hosted database and identity provider. Schema changes belong in reviewed migrations. The secret API key and database credentials stay on the backend. The browser receives the public project URL and publishable key, starts OAuth with PKCE, and sends the resulting access token to Virgil once. Virgil verifies it with Supabase and issues an HttpOnly application session for workspace operations. Credentials alone do not enable live execution. Hosted accounts provide stable ownership for tenant isolation; the local demo does not require an account.

## Working method

Define the outcome, design the interaction, implement the complete slice, verify behavior, and review the result. Keep phase status tied to evidence. Internal interfaces come first; public compatibility commitments follow the developer pilot.

Live and simulation are explicit environments. Verify Binance capabilities at integration time. Respect the selected connection's confirmation requirements. No live trading credentials or authority are assumed by this roadmap.
