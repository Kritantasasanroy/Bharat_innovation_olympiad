---
id: ESPEC-001
title: Enumerate every inbound and outbound port
scope: artifact:eng-spec
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [interfaces, boundaries]
---
**Rule:** An engineering spec lists all inbound interfaces (HTTP routes, message topics, scheduled jobs, CLI commands) and all outbound dependencies (services called, queues produced to, DB tables read/written, caches, third-party APIs). Each entry names protocol, schema, auth, error mapping.

**Why:** Hidden ports are hidden failure modes. Enumerating them is the only way to reason about auth, retries, idempotency, and rollback coherently.

**How to apply:**
- Use a table or a bulleted list under "Inbound" and "Outbound" headings.
- For each inbound: path / topic / command, method, auth mechanism, input schema reference, expected error responses.
- For each outbound: target, protocol, auth, retry policy, timeout, failure fallback.
- Diagrams (C4 Level 2 or sequence) supplement the list, not replace it.

**Anti-pattern:** Eng spec with only a prose description of "how the service works," no enumerated ports.
