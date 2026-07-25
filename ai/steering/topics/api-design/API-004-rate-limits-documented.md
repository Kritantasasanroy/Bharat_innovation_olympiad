---
id: API-004
title: Rate limits documented at design time
scope: topic:api-design
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [api, rate-limits]
---
**Rule:** Any API exposed outside the service itself ships with documented rate limits: per-caller ceiling, burst allowance, 429 response semantics, retry-after header guarantee.

**Why:** Rate limits are a production safety net. Documenting them at design time forces the team to think about the scale of the service and about what well-behaved clients look like.

**How to apply:**
- Per-caller identity: user ID, API key, tenant ID, IP — pick one and document which.
- Ceiling expressed in requests per unit time (`60 rpm per API key`).
- Burst allowance stated (`up to 10 requests in 1 second`).
- `429 Too Many Requests` with `Retry-After` header; callers must honour it.
- Rate limits are tuned in config, not hard-coded; operations can adjust without a deploy.

**Anti-pattern:** Service ships with no limits, attracts one heavy consumer, cascades into a latency incident, team adds a hard-coded limit in a panic PR.
