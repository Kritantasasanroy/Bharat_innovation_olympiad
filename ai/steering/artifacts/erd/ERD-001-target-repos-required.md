---
id: ERD-001
title: ERDs declare target_repos for the repos that own the data
scope: artifact:erd
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [routing, lifecycle, ralph-adapter]
---
**Rule:** Every ERD's frontmatter carries `target_repos: [...]` naming the repo(s) that own the schema or the components shown in the C4 diagram. Validated at `wb.publish` / `wb.approve` against `project.conf REPOS`.

**Why:** Schema-touching ERDs drive migration tasks for a specific service repo. C4 ERDs may span multiple services, but each box still maps to one repo that owns it. Without `target_repos`, sync-context broadcasts the ERD into repos whose AI context has no use for it.

**How to apply:**
- If the ERD is schema-focused, `target_repos` equals the repo that owns the schema (usually one service repo).
- If the ERD is a C4-L2 component diagram, `target_repos` is the union of repos whose components appear in the diagram.
- Copy the list from the parent spec's `target_repos` when the ERD was created to illustrate a spec-level change.

**Anti-pattern:** Drafting a cross-service ERD and leaving `target_repos: []` because "it is architectural". ADRs are for stand-alone architectural decisions; ERDs always have at least one concrete owner.
