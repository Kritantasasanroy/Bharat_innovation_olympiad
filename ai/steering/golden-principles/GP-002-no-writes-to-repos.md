---
id: GP-002
title: Never write into repos/* from a workbench session
scope: golden
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [boundaries, ralph]
---
**Rule:** Agents operating inside a workbench must not modify files under `repos/*/`. Code changes belong to ralph (which runs inside each code repo) and read approved context from `repos/*/ai/`.

**Why:** The workbench is a planning and specification surface, not a coding surface. Letting agents edit `repos/*` from the workbench breaks the lifecycle (approval gate) and muddies audit (who changed the code).

**How to apply:**
- Treat `repos/*/` as read-only from a workbench session.
- Do not run `cd repos/<name> && ...` to edit files.
- If a workbench task ends with "and then change this in svc-a," produce a `fix_plan` entry under `repos/<name>/ai/fix_plans/`, not a code edit.
- Ralph is the only process allowed to write under `repos/*`.

**Anti-pattern:** Agent opens `repos/svc-a/src/handler.ts` from a workbench session to apply a "quick fix."
