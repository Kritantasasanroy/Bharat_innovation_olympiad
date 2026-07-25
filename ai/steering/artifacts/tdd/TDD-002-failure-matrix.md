---
id: TDD-002
title: Failure matrix enumerates error paths with expected behaviour
scope: artifact:tdd
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [tdd, errors]
---
**Rule:** Every TDD has a failure matrix: each row is a failure mode (timeout, 4xx, 5xx, partial response, malformed payload, auth failure, rate-limit, cancellation). Each row states: what triggers, what the system does, what the user sees, what we observe.

**Why:** Error paths are where untested behaviour lives. Enumerating them at design time surfaces the ones the team has not thought about yet.

**How to apply:**
- Table columns: Trigger, System action (retry, fail, fallback), User-visible outcome, Observability (log, metric, alert).
- Cover external dependency failures (each outbound port from ESPEC-001).
- Cover internal invariant violations (assertion failed, state impossible).
- Cancellation and timeout are always rows, even when you think "won't happen."

**Anti-pattern:** TDD that only lists happy-path flow and says "errors are logged and retried."
