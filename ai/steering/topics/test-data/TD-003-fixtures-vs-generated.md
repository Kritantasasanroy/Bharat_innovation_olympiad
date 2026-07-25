---
id: TD-003
title: Golden files versioned; volatile fixtures generated at runtime
scope: topic:test-data
owner: qa-council
created: 2026-04-24
updated: 2026-04-24
tags: [test-data, fixtures]
---
**Rule:** Fixtures fall into two buckets. Golden fixtures (snapshot outputs used for contract assertions) are versioned in the repo with a schema. Volatile fixtures (test users, tenants, timestamps) are generated at runtime by a shared factory.

**Why:** Everything-in-repo fixtures rot and pollute diffs with unrelated changes every time a generator runs. Everything-generated fixtures make contract tests non-deterministic. Split by purpose.

**How to apply:**
- Golden: schema-validated JSON/YAML files in `fixtures/golden/`, regenerated only by an explicit `update-golden` script (never by a test run).
- Volatile: created through a factory (`UserFactory.build()`, `TenantFactory.build()`). Seeded values are deterministic (e.g. by test-name hash) when reproducibility matters.
- Do not mix: a "sample user" checked in as a golden fixture but generated freshly by some tests produces inconsistent behaviour.
- Document which tests depend on a golden update when updating it.

**Anti-pattern:** A repo where every test run overwrites `fixtures/orders/sample.json` with the current day's timestamp, making PR diffs noisy and review impossible.
