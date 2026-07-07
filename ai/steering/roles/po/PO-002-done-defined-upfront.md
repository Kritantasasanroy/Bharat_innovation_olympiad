---
id: PO-002
title: Every story has a "done" definition stated before work begins
scope: role:po
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [prd, done-criteria]
---
**Rule:** The PRD (or story-level spec) states what "done" means for each capability before engineering and QA start. "Done" includes functional behaviour, quality gates (test coverage, error budget), and rollout (flag state, rollout percentage, rollback trigger).

**Why:** Without a stated "done," teams ship at whatever point feels stable. That varies by team, by week, by individual. Explicit done is the only way retrospectives and SLOs stay honest.

**How to apply:**
- Every capability in the PRD has a "done when" paragraph.
- Include quality gates: test coverage target, p95 latency target, error budget burn tolerance.
- Include rollout: behind a flag, at N% rollout, with rollback trigger stated.
- "Done" is a precondition for `wb.approve` on the PRD. Reject PRDs missing it.

**Anti-pattern:** A PRD whose only done-criteria is "implementation complete and reviewed."
