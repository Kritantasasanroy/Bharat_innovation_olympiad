---
id: TSPEC-005
title: Test spec references approved PRD, BDDs, test plan, and test cases
scope: artifact:test-spec
owner: qa-council
created: 2026-04-24
updated: 2026-04-24
tags: [lifecycle, traceability]
---
**Rule:** Every test spec's frontmatter links to the approved PRD, approved BDD feature files, approved test-plan file, and approved test-cases file. All upstream artifacts must be `status: approved` before the test spec is drafted.

**Why:** The test spec operationalises the testing approach. It has to rest on a stable PRD / BDD / test-plan / test-case base, or it encodes assumptions that will shift underneath.

**How to apply:**
- Frontmatter: `prd:`, `bdd_features:` (list), `test_plan:`, `test_cases_path:`.
- `/test-spec` skill refuses to run when any upstream reference is not approved.
- When an upstream ship changes post-approval, regenerate or explicitly re-approve the test spec.

**Anti-pattern:** A test spec drafted in parallel with a still-draft PRD, locking in assumptions that the PRD later removes.
