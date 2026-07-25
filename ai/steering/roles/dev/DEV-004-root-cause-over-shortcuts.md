---
id: DEV-004
title: Root-cause bugs; do not use destructive shortcuts to make them go away
scope: role:dev
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [debugging, safety]
---
**Rule:** When a test fails, a hook blocks, a migration errors, or CI rejects a PR, diagnose the underlying cause and fix that. Do not bypass the check.

**Why:** Bypassed checks stay bypassed. The symptom returns in production. The next engineer pays.

**How to apply:**
- Never use `--no-verify` on commits unless the user has explicitly asked for it. If a hook fails, investigate.
- Never use `--no-gpg-sign` / `-c commit.gpgsign=false` to silence signing failures.
- Never delete a lock file because it seems to be blocking you. Find the process holding it.
- Never `rm -rf node_modules && reinstall` as a first move. That hides dependency mismatches.
- Never skip a failing test. Either fix the production code or delete the test with the user's approval after an explicit discussion.
- If you truly cannot fix the root cause in scope, surface the trade-off to the user and get explicit go-ahead before bypassing.

**Anti-pattern:** Agent adds `git commit --no-verify` to "unblock a broken pre-commit hook" without telling the user why.
