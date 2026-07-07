---
id: TD-002
title: Test data setup and teardown are idempotent
scope: topic:test-data
owner: qa-council
created: 2026-04-24
updated: 2026-04-24
tags: [test-data, idempotency]
---
**Rule:** Test setup can run multiple times without corrupting state. Test teardown can run against a partially-set-up environment without throwing. Order dependence between tests is forbidden.

**Why:** Order-dependent tests are flaky by design. They pass today because of an accidental ordering and break tomorrow when parallelisation changes. Idempotent setup/teardown makes tests independently runnable at any time, in any order.

**How to apply:**
- Setup uses `upsert` or "create if missing" patterns.
- Teardown uses `delete if exists`, not `delete` that throws on missing rows.
- Shared resources (tenant, admin user) are created on first use and reused, not created in one test and expected by another.
- Tests do not depend on execution order. Use per-test fixtures unless the cost is prohibitive.

**Anti-pattern:** Test A creates a record, test B updates it, test C reads it. Running B alone fails. Running in reverse order fails.
