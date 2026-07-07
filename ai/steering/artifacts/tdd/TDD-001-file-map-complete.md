---
id: TDD-001
title: File map lists every new and modified file
scope: artifact:tdd
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [tdd, traceability]
---
**Rule:** The TDD includes a "File map" section listing every file the change will touch, categorised as `new`, `modified`, `deleted`, grouped by repo. Each entry has a one-line purpose.

**Why:** The file map is the quickest reviewer sanity check. It also becomes the skeleton for the ralph fix_plan. Missing entries become surprises at review time.

**How to apply:**
- `repos/<name>/path/to/file.ext` and `new | modified | deleted`.
- One line per file naming its role: `new — wire OAuth callback`, `modified — add tenant scoping`.
- Group by repo so reviewers from different services can scan their own subset quickly.
- Tests belong in the file map (alongside the production file they cover).

**Anti-pattern:** TDD describing "the auth handler and some supporting files" without a concrete file list.
