---
id: TSPEC-003
title: Coverage target per layer is stated
scope: artifact:test-spec
owner: qa-council
created: 2026-04-24
updated: 2026-05-11
tags: [test-spec, coverage]
---
**Rule:** Every test spec states a coverage target for each layer in scope. The layer vocabulary can be the architectural axis (FE / API / BE / DB plus Performance and Security cross-cutting) or the test pyramid axis (unit / integration / contract / e2e). Pick one axis and use it consistently across the BDDs, test cases, and test spec. A single "80% overall" figure is not enough; targets are per-layer because the layers serve different purposes.

**Why:** A high total masks a missing layer. 90% FE coverage and 0% API coverage is a riskier profile than 60% FE and 60% API. The same logic holds on the test pyramid axis (90% unit, 0% integration is a riskier profile than 60% / 60%). Layer-level targets force balanced investment.

**How to apply:**
- Table with columns: layer, target (%), currently-achieved, gap, rationale.
- For each layer in scope, state the target and the rationale (why this layer needs more or less). For a layer marked out of scope, write "n/a" and state why (for example: "BE - Backend is exercised only via integration tests through the API layer; no separate BE test target").
- Gaps come with a dated remediation plan, not an open-ended TODO.
- For new capabilities, state the "must-have" tests at launch (the subset below which launch is blocked).
- For teams whose BDD tags carry layer information (`@ui`, `@api`, `@db`, `@backend`) and whose test cases column uses the same vocabulary (FE / API / BE / DB), pick the architectural axis. This keeps a single vocabulary across all three artifacts and avoids cross-axis translation in the AC traceability matrix.

**Anti-pattern:** Test spec says "aim for >=80% coverage" and nothing else. Or a coverage matrix on the test pyramid axis while the BDDs and test cases use the architectural axis, forcing readers to map "integration" -> "API + DB" by hand.
