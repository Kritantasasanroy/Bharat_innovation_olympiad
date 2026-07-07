---
id: BDD-007
title: BDD feature files declare target_repos in the header
scope: artifact:bdd
owner: qa-council
created: 2026-04-24
updated: 2026-04-24
tags: [routing, lifecycle, ralph-adapter]
---
**Rule:** Every `.feature` file's header comment block contains `# target_repos: [...]` naming one or more repos registered in `project.conf REPOS` (usually role=automation-tests). Validated at `wb.publish` / `wb.approve`.

**Why:** BDD ownership sits with the automation repo. When a PRD spans a service + an automation repo, the BDD still routes exclusively to automation-tests. Declaring the field keeps that intent explicit and survives the YAML vs Gherkin format split that already forced the `# status:` header convention.

**How to apply:**
- `/bdd-gen` writes `# target_repos: [automation-tests]` (or the appropriate repo name) as part of the header block alongside `# status: draft`.
- Contract-style BDDs that live in a service repo (rare) set the service repo as the target.
- Keep the list to one repo unless a feature literally runs in two automation suites.

**Anti-pattern:** Omitting the header line and relying on the PRD's `target_repos` to propagate. It does not: BDDs are approved as independent artifacts and validated on their own frontmatter/header.
