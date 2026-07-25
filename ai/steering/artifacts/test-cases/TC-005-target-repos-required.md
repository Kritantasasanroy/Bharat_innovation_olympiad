---
id: TC-005
title: Test-case sets declare target_repos before publish
scope: artifact:test-cases
owner: qa-council
created: 2026-04-24
updated: 2026-04-24
tags: [routing, lifecycle, ralph-adapter]
---
**Rule:** Every test-cases artifact's frontmatter carries `target_repos: [...]` matching the source BDDs. Validated at `wb.publish` / `wb.approve` against `project.conf REPOS`.

**Why:** Test-cases expand scenarios into runnable tests inside the automation repo. The planner uses `target_repos` to decide where TC-NNN lands in the `## <repo-name>` sections of the workspace fix_plan. Missing or diverging routing produces duplicated or dropped test tasks.

**How to apply:**
- When drafting a TC-set, read every source BDD's `# target_repos` header and take the union as the TC-set's `target_repos`.
- Cross-repo automation coverage (rare) is legal; keep `target_repos` as the full union so the planner emits tasks in each automation repo.

**Anti-pattern:** Approving a test-case set with `target_repos` narrower than the BDD sources. The dropped repos silently miss automation work.
