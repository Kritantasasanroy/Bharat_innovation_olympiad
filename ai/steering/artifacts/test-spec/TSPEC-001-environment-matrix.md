---
id: TSPEC-001
title: Environment matrix is stated
scope: artifact:test-spec
owner: qa-council
created: 2026-04-24
updated: 2026-05-11
tags: [test-spec, environments]
---
**Rule:** Every test spec states the environments each layer in scope runs in: local, CI, staging-like, production-like. For each environment, state what differs from production (real DB vs sqlite, real third-party services vs stubs, real queue vs in-memory, tenant config).

**Why:** Environment drift is a top cause of "passes in CI, fails in staging." Naming the matrix up front forces the team to decide which tests run where, against which data, with which substitutions.

**How to apply:**
- Table with rows = each layer in scope, columns = environment. The layer vocabulary can be the architectural axis (FE / API / BE / DB plus Performance and Security cross-cutting) or the test pyramid axis (unit / integration / contract / e2e). Pick one axis and use it consistently across all artifacts (BDDs, test cases, test spec). The architectural axis is preferred for teams whose BDD tags and test-cases Test Case Type column already use it.
- For each cell, mark run / skip and name the substitutions made (mock third-party API, real DB, sandboxed cloud account).
- Tests that require specific environment capabilities (real network, specific region, real mTLS, specific tenant) get called out.
- Include parallelism per environment (default workers, override env var) and the trigger command per environment.
- When the matrix changes (new env, new layer, new substitution), update the test spec before the change ships.

**Anti-pattern:** Test spec that lists test layers with no environment breakdown, leading to "we thought contract tests ran in CI, turns out they don't" incidents. Or a matrix that uses one axis (test pyramid) while the BDDs and test cases use a different axis (architectural), forcing readers to translate between vocabularies.
