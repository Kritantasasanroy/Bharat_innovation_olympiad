---
id: TP-002
title: Test plan references approved PRD and approved BDDs
scope: artifact:test-plan
owner: qa-council
created: 2026-05-17
updated: 2026-05-17
tags: [test-plan, lifecycle, references]
---
**Rule:** A test plan can be drafted only when the source PRD is at `status: approved` AND every relevant BDD feature file is at `status: approved`. The test plan's YAML frontmatter declares the upstream IDs in `prd:` (single PRD ID) and `bdd_features:` (list of BDD IDs, IDs only, not file paths).

**Why:** A test plan composes from the PRD (business goals, ACs, impact areas, performance signals) and BDDs (in-scope surfaces via tag inventory). If either upstream artifact is still a draft, the test plan will be rebuilt the moment those artifacts move, wasting review cycles. Declaring the upstream IDs makes the dependency explicit and lets `wb.reject` of an upstream cascade-invalidate downstream test plans.

**How to apply:**
- Step 0 of `/test-plan-gen` reads `.workbench-state/approved.json` to confirm upstream status. The skill exits before drafting if either upstream is not approved.
- Frontmatter must include both fields:

  ```yaml
  prd: PRD-{NNN}
  bdd_features: [BDD-{NNN}-{capability-1}, BDD-{NNN}-{capability-2}]
  ```

- `bdd_features:` carries BDD IDs, not file paths. The IDs are stable across rename; paths are not.
- `wb.publish` validates that every ID listed in `bdd_features:` exists at `status: approved` in `.workbench-state/approved.json`.

**Anti-pattern:** A test plan that lists `bdd_features: [qa/outputs/bdd/PRD-001-some-capability.feature]` with the path instead of the ID. Renaming or relocating the file invalidates the reference; renaming or relocating the ID does not.
