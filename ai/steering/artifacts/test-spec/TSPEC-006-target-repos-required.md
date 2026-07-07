---
id: TSPEC-006
title: Test specs declare target_repos before publish
scope: artifact:test-spec
owner: qa-council
created: 2026-04-24
updated: 2026-04-24
tags: [routing, lifecycle, ralph-adapter]
---
**Rule:** Every test spec's frontmatter carries `target_repos: [...]` naming the automation repo(s) that will host the coverage. Validated at `wb.publish` / `wb.approve` against `project.conf REPOS`.

**Why:** The test spec is the last artifact ralph-plan consumes before dispatch. `target_repos` on the test spec is what decides which automation repo gets suite scaffolding, environment matrix, and parallelism plan tasks. Skipping it forces the planner to fall back on the TC-set routing, which is fine only when they agree — a gap the field exists to surface.

**How to apply:**
- Mirror the union of `target_repos` across the source BDDs and the TC-set. If they disagree, resolve on the test spec itself and back-port the correction.
- Single-automation-repo projects still set the field; the planner does not treat "obviously one repo" as a license to omit it.

**Anti-pattern:** Dropping `target_repos` because the test spec has an `automation_repo` field. They are not equivalent; `automation_repo` is a human-readable label, `target_repos` is the machine-validated routing primary key.
