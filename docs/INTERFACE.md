# Virgil interface specification

## Character

A calm financial workspace with an intelligent operator available in context. Dark charcoal surfaces, subtle borders, restrained accent color, clean sans-serif typography, aligned numbers, and purposeful spacing. Motion explains changes rather than decorating the screen.

Use green for successful outcomes, amber for attention, and red for blocked or failed actions. Include text and icons so color never carries meaning alone. Support keyboard navigation, visible focus, accessible contrast, and reduced motion.

## Navigation

- Overview: attention queue, account state, active plans, recent outcomes.
- Plans: create and manage persistent instructions.
- Activity: decisions, approvals, orders, and receipts.
- Developer tools: optional integrations, capital access, credentials, playground, events, and traces.
- Settings: connections, permissions, notifications, and preferences.

Avoid a global beginner/expert switch. Developer activity also appears in the consumer timeline with readable attribution. Keep environment and connection status visible.

## Overview

Prioritize decisions needing attention, followed by portfolio value, available funds, committed funds, active plans, and recent activity. Define each balance and its timestamp. Do not imply that cached data is live.

## Plan creation and review

Offer plain-language input and a structured form. Produce an editable card containing account, assets, amount and denomination, schedule, constraints, and approval behavior. Advanced controls appear only when supported.

The decision card answers: what happens, why, estimated cost, resulting account impact, and the next action. Use explicit buttons such as 'Approve purchase of 150 USDT of BTC'. Show actual fees and fills only after exchange confirmation.

Changes invalidate the previous review. A stale approval returns the user to the latest terms. Unknown estimates are shown as unavailable, not zero.

Conversation opens beside the relevant plan. Users never need to reconstruct current instructions from chat history.

## Plan detail and activity

Show objective, current revision, status, funding, rules, next action, outstanding approvals, and execution history. Keep order and plan states distinct. Each receipt connects to the applicable revision and source integration.

Pause means stop preparing new actions. Cancel orders and close positions are separate operations with explicit consequences and authorization.

## Developer tools

Integrations manage identities and scoped access. Capital access shows pools and budgets. API access supports credential rotation and revocation without revealing exchange secrets. The playground evaluates proposals without submitting them. Events show delivery attempts; traces link requests to final receipts.

Do not display placeholder tools as operational features. Clearly label planned or simulated capabilities.

## Required prototype states

- Empty workspace with a clear create-plan action.
- Draft, review, approved, and revised plan.
- Competing-capital explanation with alternative actions.
- Loading, disconnected, expired connection, and stale account data.
- Rejected order, partial fill, unknown order status, and verified receipt.

Simulated states remain visibly labelled. Unknown order status should explain that reconciliation is underway before retrying. Responsive layouts prioritize reviewing and acting; onboarding reflects the actual exchange connection's device requirements.

## Acceptance

A user can identify the environment, proposed spend, account impact, next action, and current outcome without opening technical details. The interface exposes evidence on demand and keeps decisions readable under pressure.
