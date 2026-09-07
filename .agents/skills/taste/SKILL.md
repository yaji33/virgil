---
name: taste
description: Product and engineering taste guidelines for Vigil. Use when making design, naming, UX, or architectural taste decisions.
---

# Taste Skill — Vigil

## Product Taste

- Prefer clarity over cleverness.
- The name of a function, type, or module should reveal its intent.
- Default to the safer option when trade-offs are close.
- Expose complexity only when the user explicitly needs control.

## Engineering Taste

- Small, focused modules > large god objects.
- Explicit over implicit.
- Make illegal states unrepresentable (use types + Zod).
- Tests should read like specifications of desired behavior.

## Naming Taste

- Prefer short, strong, memorable names for core concepts (Mandate, Decision, RiskReport, AuditEntry).
- Avoid generic names like `utils`, `helpers`, `manager`, `service` unless scoped tightly.
- Risk agents should be named after what they evaluate: `evaluatePositionSize`, `evaluateConcentration`, etc.

## When in Doubt

Ask: “Would a senior engineer at a high-quality trading firm be embarrassed by this in 6 months?”
If yes, redesign.
