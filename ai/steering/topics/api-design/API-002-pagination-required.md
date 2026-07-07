---
id: API-002
title: List endpoints are paginated from day one
scope: topic:api-design
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [api, pagination]
---
**Rule:** Any endpoint that returns a list of items ships with pagination from the first version. No "we will add pagination later."

**Why:** Unbounded list endpoints are a ticking DoS vector and a latency regression waiting to happen. Adding pagination later is a breaking change that every consumer has to adapt to simultaneously.

**How to apply:**
- Use the team's standard pagination convention (cursor-based preferred for large sets, offset/limit acceptable for small admin-only lists).
- Default page size documented, max page size enforced on the server.
- Response envelope includes pagination metadata (next cursor, total if cheap).
- Tests include the "more than one page" scenario.

**Anti-pattern:** `GET /orders` returning 50,000 rows because an admin called it during business hours.
