---
id: ESPEC-002
title: Data model changes require a migration plan
scope: artifact:eng-spec
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [migrations, data]
---
**Rule:** Any schema change (new column, new table, changed type, dropped field, new index) is accompanied by a migration plan: forward migration, backward compatibility window, backfill strategy, rollback procedure.

**Why:** Schema changes without a plan are the single largest source of production incidents we see. Locks under load, partial backfills, deploy ordering, reader/writer compatibility — all have to be thought through before the migration runs.

**How to apply:**
- Forward: exact DDL / migration commands.
- Compatibility: are old readers OK with the new schema? Are new readers OK with the old schema? What is the window in which both must coexist?
- Backfill: how populated columns are backfilled (online, via job, batch size, throttle).
- Rollback: either reversible migrations, or a stated one-way flag with rollback-by-feature-flag.
- Deploy ordering: app-first or migration-first, and why.

**Anti-pattern:** Eng spec that mentions "add a column for X" with no DDL, no backfill, no rollback note.
