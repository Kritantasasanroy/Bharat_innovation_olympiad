---
id: ESPEC-006
title: Eng spec references an approved PRD
scope: artifact:eng-spec
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [lifecycle, traceability]
---
**Rule:** Every eng spec's frontmatter links to its upstream approved PRD. The PRD must be `status: approved` per `.workbench-state/approved.json` before the eng spec is drafted.

**Why:** Eng specs written before PRD approval re-do work when the PRD shifts. The lifecycle chain exists so downstream work is not wasted.

**How to apply:**
- Frontmatter: `prd: PRD-EPIC-123` and `prd_path: product/outputs/prds/EPIC-123.md`.
- `/eng-spec` skill refuses to run when the named PRD is not approved.
- Reviewers verify the linked PRD before approving the eng spec.

**Anti-pattern:** An eng spec drafted "to get ahead" before the PRD clears `wb.approve`.
