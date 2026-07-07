---
id: TDD-005
title: TDD references an approved eng spec
scope: artifact:tdd
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [lifecycle, traceability]
---
**Rule:** Every TDD's frontmatter links to an approved eng spec. The eng spec must be `status: approved` per `.workbench-state/approved.json` before the TDD is drafted.

**Why:** TDDs are the concrete step from eng spec to code. Without an approved eng spec, a TDD can encode design choices that have not been reviewed.

**How to apply:**
- Frontmatter: `eng_spec: ESPEC-EPIC-123` and `eng_spec_path: engineering/outputs/specs/EPIC-123.md`.
- `/tdd` skill refuses to run when the eng spec is not approved.
- If the TDD deviates from the eng spec (new port, different data model), raise the delta explicitly and require re-approval.

**Anti-pattern:** TDD drafted from a PRD skipping the eng spec entirely, justifying it as "a small change."
