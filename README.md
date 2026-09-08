# Virgil

**Trading intentions, coordinated capital, verified outcomes.**

Virgil is a trading workspace and developer platform designed for Binance Agent OS. Its purpose is to turn a user's intention into a clear plan, coordinate that plan with other activity on the account, and follow execution through to a verifiable result.

The product brings two experiences together: an approachable workspace for people who want to delegate trading tasks, and developer tools for those building their own strategies and agents. Both are designed around the same plans, rules, approvals, and execution boundaries.

## Why Virgil?

An individual trade is only part of a larger workflow. Users also need to decide how much capital is available, understand competing orders, approve changes, and verify what actually happened.

Those responsibilities become harder when several strategies share an account. Two agents can each propose a reasonable purchase while collectively committing more money than is available. A network timeout can leave an order's outcome uncertain. A changed plan can make an earlier approval inappropriate.

Virgil's guiding idea is to make that coordination explicit: user intent becomes structured terms, rules determine what is permissible, and execution evidence determines whether the work is complete.

## Who is it for?

### Consumers

Binance users who understand buying and selling crypto but do not want to configure scripts, supervise multiple bots, or reconcile every order themselves.

The consumer experience is designed around:

- Expressing an intention in ordinary language or a guided form.
- Reviewing the amount, account, rules, and consequences before approving.
- Managing persistent plans outside a chat transcript.
- Understanding conflicts and choosing feasible adjustments.
- Seeing completed actions and decisions that need attention.

### Developers and technical users

Builders who want to bring their own strategy logic while using a common foundation for plan validation, permissions, capital coordination, and execution records.

The developer experience is designed for custom applications, trading strategies, and external agents. A proposal from an integration follows the same governing rules as one created in the consumer workspace.

## Example workflows

- **One-time purchase:** Prepare a BTC purchase denominated in USDT, review its terms, and inspect the result.
- **Recurring allocation:** Coordinate scheduled purchases with a user-defined reserve.
- **Shared capital:** Resolve competing requests from a consumer plan and an independent strategy.
- **Plan adjustment:** Offer a smaller purchase or a later execution when the original terms cannot be fulfilled.
- **Execution follow-through:** Reconcile partial fills and uncertain order responses before deciding what happens next.

These workflows describe the product's intended experience. The local examples below exercise the plan and policy domain without placing exchange orders.

## Architecture

Virgil separates intent, permission, and execution. The following diagram describes the system design:

```mermaid
flowchart TD
    C[Consumer workspace] --> A[Authenticated application boundary]
    D[Developer integrations] --> A
    A --> P[Versioned plans and structured proposals]
    P --> R[Policy checks and required approvals]
    R --> K[Current account checks and capital reservations]
    K --> E[Binance execution adapter]
    E --> B[Binance Agent OS]
    B --> V[Order reconciliation and receipts]
    V --> S[Durable records and activity events]
    S --> C
    S --> D
```

The domain code is organized into separate modules:

| Module | Responsibility |
| --- | --- |
| `src/plans/` | Validated plan terms, source identity references, revisions, review, and approval transitions |
| `src/auth/` | Supabase OAuth identity verification, demo sessions, and hashed application tokens; actor identity is derived from the session |
| `src/records/` | Transactional persistence for workspaces, accounts, plans, orders, and activity. Local default is PGlite; hosted storage uses scoped PostgreSQL transactions |
| `src/boundary/` | Authenticated workspace operations, account isolation, and revision checks |
| `src/money/` | Exact decimal-string arithmetic for quote amounts |
| `src/http/` | Local HTTP adapter used by the browser workspace |
| `src/execution/` | Submit/reconcile gate, recovery worker, demo adapter, and optional Binance spot REST adapter. Demo stays the default |
| `src/capital/` | Available quote, open-order reservations, and account snapshot freshness |
| `src/policy/` | Deterministic mandate decisions and plan-native execution checks |
| `src/risk/` | Position-size and available-capital evaluation using supplied exposure |
| `src/types/` | Shared mandate, proposal, risk-result, and decision schemas |

### Design principles

- **Plans outlive conversations.** Structured terms define the action; text explains the intention.
- **Approval belongs to a revision.** Editing terms returns the plan to draft and removes its previous approval.
- **Hard failures take precedence.** A failed risk check produces a block even when the amount would otherwise require human approval.
- **Evaluation is not execution authority.** Execution must check current permissions, rules, account state, and capital commitments.
- **Money has an explicit denomination.** Plan amounts use decimal strings paired with a quote asset, avoiding conversion to floating-point numbers during validation.
- **Identity references are not credentials.** Authentication and ownership checks belong at the application boundary.
- **Submitted does not mean completed.** Order status and plan status are separate concepts.
- **Governance has a boundary.** Virgil governs its own execution path; independently authorized exchange activity must be reconciled.

The plan lifecycle functions remain pure domain operations. The application boundary authenticates callers and persists results. It is not an exchange execution service.

## Tech stack

| Area | Technology |
| --- | --- |
| Runtime | Node.js 22+ |
| Language | TypeScript 5, strict checking |
| Module configuration | ES modules, ES2022 target, Bundler resolution |
| Runtime validation | Zod 3 |
| Local database | PGlite (Postgres-compatible, file-backed under `data/virgil`) |
| Hosted database and identity | Supabase Postgres, Auth, and Row Level Security |
| Tests | Vitest 2 |
| Frontend | TypeScript, CSS, Vite 5 |
| Browser tests | Playwright |
| Development scripts | tsx 4 |
| Package management | pnpm with a committed lockfile |
| Target exchange integration | Binance Agent OS |

See [package.json](package.json) for dependency ranges and [pnpm-lock.yaml](pnpm-lock.yaml) for resolved versions.

## Getting started

Install Node.js 22+ and pnpm, then:

```sh
git clone https://github.com/yaji33/virgil.git
cd virgil
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://127.0.0.1:5173` to create, review, approve, submit, and reconcile a plan. The page opens a local demo session with no Binance credentials. Approval does not place an order. Submit uses the demo adapter and reserves quote until the order fills or is rejected. A demo fill updates the illustrative workspace balance; it is still not a Binance confirmation. Plans, orders, activity, and the illustrative USDT balance are stored in a local Postgres database (`data/virgil`) and survive refresh.

Optional Binance spot testnet: copy `.env.example` to `.env`, set `VIRGIL_EXECUTION=live`, and add spot-trade-only keys. Demo remains the default when those values are unset. Submit acknowledgements are not receipts; reconcile queries Binance before recording a fill. Signed requests correct local clock drift from Binance server time after a timestamp rejection. Mainnet REST stays off unless `VIRGIL_BINANCE_REAL=yes`.

Hosted Supabase mode requires `VIRGIL_STORE=postgres`, the project URL and publishable key, both PostgreSQL URLs, and the local path to the project CA certificate. Keep the secret key and database URLs on the backend. Apply migrations before starting the app:

```sh
pnpm migrate
pnpm smoke:postgres
pnpm server
```

The standalone backend listens on `127.0.0.1:8787` by default. Put it behind the same HTTPS origin as the frontend in deployment. The Vite development server continues to embed the API for local work.

Hosted sign-in uses Supabase OAuth with PKCE. Set `VIRGIL_OAUTH_PROVIDERS=google` or a comma-separated list containing `google` and `github`. In Supabase, enable each provider under Authentication > Providers and add `http://127.0.0.1:5173/` to Authentication > URL Configuration > Redirect URLs. In the provider console, use `https://<project-ref>.supabase.co/auth/v1/callback` as the authorized callback URL. The browser receives the Supabase project URL and publishable key, which are public client configuration. The database URLs and any secret key must never be exposed to the browser.

An account is required in hosted mode because plans, approvals, receipts, and execution authority must have a stable owner for tenant isolation. The default local demo remains account-free.

To import a local workspace, first create or identify its destination Supabase user. Set `VIRGIL_MIGRATION_USER_ID` and, when more than one local workspace exists, `VIRGIL_MIGRATION_WORKSPACE_ID`, then run `pnpm migrate:local`. The importer preserves plans, orders, activity, and immutable history. It does not copy local application sessions.

For the command-line lifecycle example, run `pnpm demo:plans`.

The plan demo creates an integration-sourced purchase, moves it through review and approval, and changes the amount to demonstrate approval invalidation. It requires no Binance credentials.

Run the policy examples separately:

```sh
pnpm demo
```

These demonstrate an allowed purchase, a disallowed asset, a human-approval threshold, and a disallowed product.

### Development commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the local browser workspace |
| `pnpm preview` | Preview the built frontend on port 4173 |
| `pnpm demo:plans` | Run the local plan lifecycle example |
| `pnpm demo` | Run the deterministic policy examples |
| `pnpm migrate` | Apply pending reviewed migrations through `DIRECT_URL` |
| `pnpm smoke:postgres` | Verify hosted persistence and tenant isolation with temporary records |
| `pnpm migrate:local` | Import one local workspace for an explicit Supabase user |
| `pnpm server` | Run the standalone Virgil backend on port 8787 |
| `pnpm lint` | Check TypeScript without emitting files |
| `pnpm test` | Run the test suite once |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm build` | Emit the core into `dist/` and bundle the frontend into `web/dist/` |
| `pnpm test:e2e` | Run browser workflow tests |

## Tests

Verified on September 9, 2026, using Node.js 22.20.0:

| Check | Result |
| --- | --- |
| TypeScript check | Passed |
| Plan tests | 19 passed |
| Policy tests | 6 passed |
| Execution policy tests | 3 passed |
| Capital tests | 2 passed |
| Binance adapter tests | 15 passed |
| Workspace tests | 9 passed |
| Boundary tests | 9 passed |
| Auth tests | 2 passed |
| HTTP tests | 2 passed |
| Execution tests | 27 passed |
| SQL record tests | 5 passed |
| Unit total | 99 passed across 11 test files |
| Browser tests | 9 passed in installed Chrome, including hosted OAuth choices and a mobile viewport |

The suite covers consumer and integration plan sources, revision-bound approval, approval invalidation, stale revisions, invalid transitions, SQL revision CAS, persisted reload, immutable plan history, Supabase OAuth configuration and access-token verification, authenticated workspace separation, HttpOnly application sessions, input-copy behavior, decimal-string validation, asset and product restrictions, position limits, and risk-failure precedence.

Execution regressions cover durable attempts before adapter calls, concurrent submission blocking, rejection retries, uncertain responses, lost-acknowledgement recovery, lookup misses, concurrent worker leases, expired leases, late-result protection, worker shutdown, retained execution terms, and reconciliation quantity and identity checks. An unresolved attempt stays reconcitable after the plan is revised and still blocks another submission. Quote reservations prevent overlapping submits from spending the same funds. Fills debit the illustrative balance; rejections restore available capital. Approve and submit require a current account snapshot and re-run plan-native execution policy, including a hard block for disallowed assets. Binance adapter tests cover HMAC signing, status mapping, submit-ack as unknown, query-backed receipts, free USDT snapshots, clock synchronization, and mainnet refusal without an explicit flag.

An authorized 10 USDT BTC spot testnet plan was also completed through Virgil's application boundary on September 8, 2026. Binance order `13494676` produced receipt `binance-13494676`, and lookup by its persisted client order identifier returned the same filled order. This establishes exchange-backed execution and recovery evidence; it does not replace the remaining user-completed browser acceptance run.

Browser tests cover revision and approval, inspectable revision history, capital-conflict resizing, demo submit and reconcile, reconciliation after a revision, labelled snapshot examples, validation, escaped user input, keyboard dismissal, reload persistence, and mobile overflow. These tests do not establish live exchange integration or trading performance.

Reproduce the checks with:

```sh
pnpm lint
pnpm test
```

Install the browser once with `pnpm exec playwright install chromium`, then run `pnpm test:e2e`. To use an installed Chrome instead, set `VIRGIL_BROWSER_CHANNEL=chrome` in your shell before running the tests. For PowerShell: `$env:VIRGIL_BROWSER_CHANNEL = 'chrome'`.

## Contributing

Follow [AGENTS.md](AGENTS.md). Keep code self-explanatory, comments concise and useful, and changes focused. Add behavioral tests when changing financial rules or lifecycle transitions.

Product semantics are documented in the [product contract](docs/PRODUCT.md); interaction and visual principles are in the [interface specification](docs/INTERFACE.md).

## License

MIT, as declared in [package.json](package.json).
