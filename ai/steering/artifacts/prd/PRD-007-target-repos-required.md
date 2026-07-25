---
id: PRD-007
title: PRDs declare target_repos before publish
scope: artifact:prd
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [routing, lifecycle, ralph-adapter]
---
**Rule:** Every PRD's frontmatter carries `target_repos: [...]` naming one or more repos registered in `project.conf REPOS`. The list is validated at `wb.publish` and `wb.approve`; missing or unknown names block the transition.

**Why:** ralph-plan routes AC-to-repo work using this field. A PRD that reaches `approved` without target_repos either broadcasts noise to every code repo or forces the planner to guess, which it cannot do safely when a PRD spans services.

**How to apply:**
- `/prd-draft` asks for target repos from the `project.conf REPOS` list and writes `target_repos: [payments-svc, payments-web]`.
- Multi-repo PRDs list all intended repos; cross-repo contract tests still land in `automation-tests` via the test-spec chain.
- If the target set is not yet decided, keep the PRD at `draft` and do not publish until it is.

**Anti-pattern:** Publishing a PRD with no target_repos and relying on reviewers to remember "this is a payments-svc PRD" in conversation. The planner does not read Slack.
