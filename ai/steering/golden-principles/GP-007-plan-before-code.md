---
id: GP-007
title: Present a plan before writing code or creating fix_plan entries
scope: golden
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [plan-mode, lifecycle]
---
**Rule:** Before writing code in `repos/*` or creating a ralph `fix_plan` entry, present a plan (files to touch, approach, risks) and wait for explicit user approval. Artifacts under `product/`, `design/`, `engineering/`, `qa/` may be drafted without a plan (they start at `status: draft` and require human approval before going downstream).

**Why:** Code and `fix_plan` entries propagate. A wrong plan spawns PRs, tests, and reviews. Catching it before that is cheap.

**How to apply:**
- For engineering tasks touching `repos/*`: walk the user through affected files, proposed approach, and the 1-2 tradeoffs you considered.
- For new `fix_plan` entries: block on approved PRD (+ approved eng spec for service repos) per the lifecycle. If the gate is not met, surface that first, do not work around it.
- For artifact drafts: no plan required, but start at `status: draft` and respect upstream approval gates (per skill prerequisites).

**Anti-pattern:** Agent starts editing `repos/svc-a/src/` in response to "fix the bug in the payment flow," skipping the plan step.
