---
id: TC-004
title: Test-cases file references approved PRD, BDD features, and test plan
scope: artifact:test-cases
owner: qa-council
created: 2026-04-24
updated: 2026-04-24
tags: [lifecycle, traceability]
---
**Rule:** Every test-cases file's frontmatter links to the approved PRD, the approved BDD feature files that seed the cases, and the approved test plan that supplies scope, risk, dependency, and test-data strategy. The PRD, BDDs, and test plan must be `status: approved` per `.workbench-state/approved.json` before test-case generation runs.

**Why:** Test cases generated from a draft PRD, draft BDDs, or a missing / draft test plan re-do work when upstream behavior or QA strategy shifts. The gate keeps generated work valuable.

**How to apply:**
- Frontmatter: `prd: PRD-{NNN}` listing the approved PRD ID (matching the ID in `.workbench-state/approved.json`).
- Frontmatter: `bdd_features: [BDD-{NNN}-{capability-a}, BDD-{NNN}-{capability-b}]` listing the approved BDD IDs (matching the IDs in `.workbench-state/approved.json`).
- Frontmatter: `test_plan: TPLAN-{NNN}` listing the approved test plan ID (matching the ID in `.workbench-state/approved.json`).
- A `## Source BDDs` section near the bottom of the markdown file lists each BDD ID alongside its file path and approval date for reviewer convenience.
- `/test-cases-gen` skill refuses to run when the referenced PRD, any referenced BDD, or the test plan is not approved.
- When a referenced BDD is later updated, regenerate the test cases rather than hand-editing.

**Anti-pattern:** Test-cases generated from "the feature files I found in qa/outputs/bdd/" without checking their lifecycle state.
