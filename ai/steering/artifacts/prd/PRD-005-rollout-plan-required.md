---
id: PRD-005
title: Rollout plan is required
scope: artifact:prd
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [rollout, ops]
---
**Rule:** Every PRD states how the capability reaches production: flag state, rollout cohorts, rollout percentage over time, monitoring triggers, rollback criteria. "Ship to prod" is not a rollout plan.

**Why:** A feature without a rollout plan reaches 100% on merge. That is the highest-risk path. Staged rollout (flag, cohort, percentage) is the only affordable way to catch the defects that unit tests and staging do not.

**How to apply:**
- Flag name (if applicable) and default state.
- Initial cohort (internal, beta list, region, % of traffic).
- Ramp schedule (1% day 1, 10% day 3, 50% day 7, 100% day 14).
- Monitoring signals to watch (error rate, latency, business metric, user complaints).
- Rollback trigger: the specific metric change that reverts the ramp.

**Anti-pattern:** Rollout section that reads "Deploy after QA signs off."
