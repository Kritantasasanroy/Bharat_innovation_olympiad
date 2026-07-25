---
id: BDD-001
title: Feature files cover happy/edge/error/security plus in-scope layer, performance, and manual tags
scope: artifact:bdd
owner: qa-council
created: 2026-04-24
updated: 2026-05-08
tags: [bdd, tags, coverage]
---
**Rule:** Every `.feature` file includes scenarios tagged with `@happy-path`, `@edge`, `@error`, and `@security` as the always-required minimum. In addition, the feature file MUST include layer tags, performance tags, and manual tags whenever the change touches those concerns:

- `@ui` — required when frontend UI is in scope (covers screens, components, routes, and end-to-end functional flows across screens with navigation, state transitions, validation, and conditional rendering).
- `@api` — required when an HTTP API surface is in scope.
- `@db` — required when database state, constraints, indexes, stored procedures, or migrations are in scope.
- `@backend` — required when a service, lambda, scheduled job, batch worker, or message consumer is in scope.
- `@performance` — required when the PRD signals data volume, batch processing, lock contention, latency, throughput, first-run backlog, concurrent execution, or timeout windows.
- `@manual` — required on any scenario whose primary assertion sits at a layer outside the team's automation scope. Today the team automates UI and API only; DB-state, stored-procedure, backend-service, lambda, scheduled-job, message-consumer, performance, log-inspection, and infrastructure assertions are tagged `@manual`. Mixed-layer scenarios are tagged `@manual` if the failing assertion happens off the UI/API surface.

Additional tags (`@epic-*`, `@prd-*`) are fine.

**Why:** Layered, impact-aware coverage prevents the failure mode where a feature file has four token scenarios (one per category) and ships without exercising the actual surface area of the change. Performance and impact-area gaps are common review findings; making them tag-required (or coverage-rule-required, in the case of impact areas) catches them at write time, not after a regression.

**How to apply:**
- Mark each layer IN_SCOPE or OUT_OF_SCOPE before writing scenarios. Skip layers that are out of scope; do not invent UI scenarios for a DB-only change.
- For each IN_SCOPE layer, include positive + negative + edge + error scenarios where each is meaningful for that layer.
- For endpoints without a meaningful security boundary, write the `@security` scenario as explicit "any authenticated user may access this endpoint; no authorization rule changed" with a comment explaining why no boundary applies.
- Performance scenarios MUST state a measurable target ("completes within 30 seconds for 1M rows"). A `@performance` scenario without a target is not testable.
- Impact-area scenarios (one per area derived from the PRD or any ad-hoc impact assessment) assert that the adjacent area is UNCHANGED. They do NOT carry their own tag; they live under the real layer tag of the assertion (`@ui`, `@api`, `@db`, or `@backend`) and also carry `@manual` when that assertion sits outside UI/API automation scope.
- Review: missing required tag = blocking comment on the PR.

**Anti-pattern:** A feature file with one `@happy-path`, one `@edge`, one `@error`, one `@security` scenario authored as "minimum to pass review" while the change adds a stored procedure with a 6-month retention cutoff and a documented safety analysis listing four adjacent areas.
