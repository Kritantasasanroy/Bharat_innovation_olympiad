---
id: ESPEC-007
title: Engineering specs declare target_repos before publish
scope: artifact:eng-spec
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [routing, lifecycle, ralph-adapter]
---
**Rule:** Every engineering spec's frontmatter carries `target_repos: [...]` as a non-empty subset of the parent PRD's target_repos, naming only repos registered in `project.conf REPOS`. Validated at `wb.publish` / `wb.approve`.

**Why:** TDDs, ERDs, and ralph-plan inherit repo routing from the spec. A spec that narrows or widens the PRD's routing silently produces fix_plan entries for the wrong repos. Declaring the field explicitly makes that divergence reviewable.

**How to apply:**
- `/eng-spec` step 4 walks `project.conf REPOS`, asks modified? y/n per repo, writes the yes-entries as `target_repos: [...]`.
- Keep the set equal to or a proper subset of the PRD's `target_repos`. A spec that expands routing signals a missing PRD update — flag it.
- Infra-only specs still set the field if an infra repo is registered; otherwise the spec is an ADR, not a spec.

**Anti-pattern:** Copy-pasting target_repos from a sibling spec without re-reading the PRD. The repos are a design decision, not a filename.
