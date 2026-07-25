---
id: GP-010
title: Validate only at system boundaries; trust internal code
scope: golden
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [simplicity, defensive-code]
---
**Rule:** Input validation, type guards, null checks, and error normalisation belong at system boundaries (HTTP handlers, message consumers, CLI arg parsers, external API responses). Internal functions trust their callers. Internal functions trust framework invariants.

**Why:** Every defensive check inside the system is a line that never runs, a branch that is never tested, and a place where the "happy path" gets harder to read. Bugs do not hide in boundary checks; they hide in untested internal branches.

**How to apply:**
- Validate once, at the entry point. Downstream functions take already-validated types.
- Do not write `if (user == null) return` inside a handler that received a validated `User` from the router.
- Do not wrap every DB call in a `try / catch` that logs and rethrows. Let exceptions propagate to the boundary handler.
- Framework guarantees (React children are rendered, Express `req.body` is parsed per middleware) do not need to be re-checked.

**Anti-pattern:** Agent adds `typeof x === 'string'` checks inside helper functions whose only caller already narrowed the type.
