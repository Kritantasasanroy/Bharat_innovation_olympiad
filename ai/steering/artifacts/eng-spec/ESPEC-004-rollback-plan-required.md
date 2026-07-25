---
id: ESPEC-004
title: Rollback plan is required
scope: artifact:eng-spec
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [rollback, ops]
---
**Rule:** Every eng spec states how the change is rolled back in production: revert path (code, migration, flag), expected data state after rollback, any data-loss window, and the metric that triggers the rollback.

**Why:** If you cannot state how to undo the change, you cannot ship it safely. This is not paranoia: it is the difference between a 15-minute incident and a 6-hour incident.

**How to apply:**
- Code revert: direct revert, or a guarding flag flipped off?
- Migration: reversible (forward + backward script), or one-way with feature-flag rollback?
- Data: new rows / new columns left in place, or cleaned up? What does the app do if it restarts mid-rollback?
- Trigger metric + threshold stated explicitly.
- Time-to-rollback is stated and should be < 15 minutes for most changes.

**Anti-pattern:** Rollback section reads "revert the PR and redeploy."
