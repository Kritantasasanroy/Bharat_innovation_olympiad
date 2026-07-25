---
id: PRD-002
title: PRD states "out of scope" explicitly
scope: artifact:prd
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [scope, boundaries]
---
**Rule:** Every PRD has an "Out of scope" section listing the nearby capabilities intentionally excluded from this epic. Minimum two items if any scope ambiguity exists at all.

**Why:** Implicit scope is the leading cause of mid-epic scope expansion. Naming what is excluded forces the conversation now, when it is cheap, rather than during delivery.

**How to apply:**
- List adjacent features the team might assume are included ("export to CSV", "email notifications", "audit log").
- State the reason for exclusion: phased, different team, non-goal, not evidence-backed.
- When a request to add an out-of-scope item arrives mid-epic, raise a scope-change decision rather than silently absorbing it.

**Anti-pattern:** A PRD for a new dashboard with no "Out of scope" list, resulting in two extra weeks of "we assumed filtering was included."
