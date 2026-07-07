---
id: TP-006
title: Test plan declares target_repos and must name registered automation-tests repos
scope: artifact:test-plan
owner: qa-council
created: 2026-05-17
updated: 2026-05-17
tags: [test-plan, target-repos, ralph-routing]
---
**Rule:** Every test plan's YAML frontmatter declares a `target_repos:` list. The list is the union of source BDDs' `# target_repos:` headers and the registered automation-tests repos in `project.conf REPOS`. Every name in `target_repos:` must be a registered repo in `project.conf`; `wb.publish` and `wb.approve` validate this.

**Why:** `sync-context.sh` routes approved test plans into `repos/<repo-name>/ai/outputs/test-plan/` for every registered repo with `role=automation-tests`. The `target_repos:` field is the source of truth for which automation-tests repos receive the test plan. Inheriting from source BDDs keeps the routing consistent: if a BDD targets `ics-unified-automation`, the test plan derived from it routes to the same place.

**How to apply:**
- Step 1 working model captures the BDDs' `# target_repos:` headers and the registered automation-tests repos.
- Step 3 frontmatter sets `target_repos:` to the union of those two sources.
- `scripts/validate-artifact.py` checks `target_repos:` against `project.conf REPOS` at `wb.publish` and `wb.approve` (per the `from_project_conf` allowed_targets semantics in `scripts/artifact-schema.json`).
- The Grill pass in Step 4 runs one pass per repo in `target_repos:` (mode = `/domain-grill` if `${WB_ROOT}/context/<repo>/CONTEXT.md` exists, else `/grill-me`).

**Anti-pattern:** Test plan with `target_repos: [some-unregistered-repo]`. The validator rejects the publish. The test plan cannot be approved or synced.

**Anti-pattern:** Test plan with no `target_repos:` field at all. The validator rejects the publish; sync-context has no routing target; downstream ralph in the automation-tests repo never sees the QA strategy.
