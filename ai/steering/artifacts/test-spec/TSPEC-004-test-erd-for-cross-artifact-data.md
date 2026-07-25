---
id: TSPEC-004
title: Test ERD for any cross-artifact test data
scope: artifact:test-spec
owner: qa-council
created: 2026-04-24
updated: 2026-04-24
tags: [test-spec, test-erd, data]
---
**Rule:** When test data spans multiple entities (customer → subscription → invoices → payments), the test spec links to a test ERD showing the entity relationships used by tests. Prose alone is not enough.

**Why:** Multi-entity test setups are where fixture drift happens. An ERD makes the data shape explicit so new scenarios reuse the same graph rather than inventing a parallel one.

**How to apply:**
- Use Mermaid ER diagrams inside `qa/outputs/test-erd/`.
- Include cardinalities, required vs optional fields, and "test-only" attributes (e.g. `scenario_tag`).
- When a new feature adds a new entity, extend the test ERD rather than authoring a sibling.
- Link the ERD from the test spec frontmatter (`test_erd_path: qa/outputs/test-erd/...md`).

**Anti-pattern:** Every test file invents its own customer/subscription/invoice graph because there is no shared reference.
