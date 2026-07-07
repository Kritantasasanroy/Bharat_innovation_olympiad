---
id: TC-002
title: Minimum one test case per acceptance criterion
scope: artifact:test-cases
owner: qa-council
created: 2026-04-24
updated: 2026-04-24
tags: [test-cases, coverage]
---
**Rule:** Every AC in the PRD maps to at least one test case. Negative and edge ACs get their own cases. A test case may cover more than one AC; an AC cannot be left uncovered.

**Why:** Test-case coverage against ACs is the cheapest traceability check. Gaps show up immediately when ACs are listed alongside case IDs.

**How to apply:**
- The test-cases file includes a traceability table: AC ID → TC IDs.
- At review, eyeball the coverage matrix; any empty cell is a blocker.
- If an AC genuinely does not need a distinct test (e.g. "system must use our brand font"), record the waiver with the reason.

**Anti-pattern:** A test-cases file with 30 cases whose authors cannot tell you which ACs they cover.
