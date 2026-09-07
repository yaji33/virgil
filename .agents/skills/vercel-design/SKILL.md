---
name: vercel-design
description: Design system and UI quality guidelines inspired by high-craft product design (Vercel-level). Use when building any frontend, dashboard, or visual interface for Vigil.
---

# Vercel-Inspired Design Skill

## Core Principles

- Clarity and hierarchy first
- Generous but purposeful whitespace
- High signal-to-noise ratio
- Consistent spacing scale
- Accessible contrast and focus states

## Visual Language for Vigil

- Dark mode as primary (trading tools context)
- Accent color: restrained, high-contrast (avoid neon overload)
- Typography: clean sans-serif, clear hierarchy (title → section → body → mono for data)
- Data density is allowed, but never at the cost of scannability
- Status colors:
  - APPROVE → green
  - BLOCK → red
  - NEEDS_HUMAN → amber/yellow

## Component Taste

- Prefer simple, composable components
- Avoid heavy animation unless it aids understanding
- Loading and empty states must be intentional
- Error states must be helpful, not just red

## When Building UI

1. Start with the decision flow visualization (Proposal → Risks → Decision)
2. Make the Mandate visible and editable
3. Always surface the Audit Trail
4. Demo Mode must feel first-class, not like a degraded experience
