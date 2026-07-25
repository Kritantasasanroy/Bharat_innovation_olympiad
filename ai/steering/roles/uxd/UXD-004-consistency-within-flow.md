---
id: UXD-004
title: Consistency within a flow beats local prettiness
scope: role:uxd
owner: ux-council
created: 2026-04-24
updated: 2026-04-24
tags: [consistency, flows]
---
**Rule:** When a user walks through a connected flow (signup, checkout, onboarding), component choices, tone, spacing, and interaction patterns stay consistent step to step. A single screen that is locally clever but breaks flow consistency is a regression.

**Why:** Flow-level consistency is how users build confidence. Mid-flow surprises (different primary colour, different button style, different form-field behaviour) push users to re-read everything and erode trust.

**How to apply:**
- Spec flows as a sequence, not as a set of independent screens. Review flow drafts screen-by-screen.
- When a step introduces a new pattern (e.g. inline vs modal confirmation), apply it to the rest of the flow's equivalent steps, not to one isolated place.
- Typography, spacing tokens, and microcopy voice stay constant within a flow.
- Cross-flow consistency (same pattern across *different* flows) is also a goal, but flow-local consistency is the non-negotiable floor.

**Anti-pattern:** A 4-step onboarding where step 2 uses a side-drawer form, step 3 uses a modal, step 4 uses an inline dialog, each with different button placement.
