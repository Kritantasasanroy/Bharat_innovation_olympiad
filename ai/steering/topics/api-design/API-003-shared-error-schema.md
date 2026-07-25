---
id: API-003
title: Errors use a shared error schema
scope: topic:api-design
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [api, errors]
---
**Rule:** All error responses from public and inter-service APIs conform to the shared error schema (code, message, correlation ID, optional details). Do not invent a per-endpoint error shape.

**Why:** Clients need predictable error handling. Per-endpoint error shapes force consumers to special-case every call, and the special cases rot when endpoints change.

**How to apply:**
- Use the canonical `Error` type from the shared API library.
- Error `code` is a stable machine-readable string (`invoice_not_found`), not a free-form sentence.
- `message` is user-safe prose (clients display it).
- `correlation_id` echoes the request ID so incidents can be traced.
- `details` is an optional structured payload for validation errors or policy violations.

**Anti-pattern:** One endpoint returns `{"error": "..."}`, another returns `{"message": "..."}`, a third returns `{"err": "..."}`.
