---
id: PO-003
title: Prefer outcome over output in goals
scope: role:po
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [prd, goals]
---
**Rule:** Goals in a PRD name an outcome (user behaviour changed, metric moved, cost reduced). They do not name an output (feature built, page shipped, API added).

**Why:** Outputs are easy to count and easy to ship without moving the needle. Outcomes are what we actually want. Stating an outcome forces the team to think about whether the feature is the right lever.

**How to apply:**
- Goal: "reduce checkout abandonment for mobile users by 15% in 60 days." Not: "build a one-page mobile checkout."
- Every goal names a metric, a target, and a window.
- If a goal cannot be phrased as an outcome, ask whether it is a goal at all or a requirement.

**Anti-pattern:** Goals list that reads like a feature list ("build the admin dashboard, add SSO, write the migration script").
