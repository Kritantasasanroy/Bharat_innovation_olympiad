---
id: TDD-006
title: TDDs mirror the spec's target_repos before publish
scope: artifact:tdd
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [routing, lifecycle, ralph-adapter]
---
**Rule:** Every TDD's frontmatter carries `target_repos: [...]` matching the parent engineering spec. Validated at `wb.publish` / `wb.approve` against `project.conf REPOS`.

**Why:** The TDD's file map is repo-local. ralph-plan uses `target_repos` to decide which repo's `## <repo-name>` section receives each bullet. A mismatch between spec and TDD routing produces fix_plan entries that reference files in the wrong repo.

**How to apply:**
- Read the parent spec's `target_repos` and copy the list into the TDD frontmatter verbatim.
- The TDD's §2 file map must only reference files under those repos. If you need to touch another repo, go back and update the spec first.
- When splitting one spec across two TDDs (per-repo), each TDD lists only its own repo; keep the spec as the single source of the union.

**Anti-pattern:** A TDD listing file changes for a repo not in `target_repos`. ralph will skip those entries and the task silently disappears from the plan.
