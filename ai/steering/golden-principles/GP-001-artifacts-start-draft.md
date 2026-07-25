---
id: GP-001
title: Agents write artifacts at status draft; humans approve
scope: golden
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [lifecycle, accountability]
---
**Rule:** Every artifact written by an AI agent must start at `status: draft`. Agents never set `status: published` or `status: approved` themselves. Transitions happen through `wb.publish` / `wb.approve`, invoked by a human.

**Why:** Approval is an accountability event. It has to bind to a named person who can be held responsible if the downstream work goes sideways. Machine self-approval breaks that chain.

**How to apply:**
- When generating any PRD, eng spec, TDD, BDD, test-cases, test-spec, ERD, ADR, or epic-context, write `status: draft` in the YAML frontmatter (or `# status: draft` in Gherkin header comments).
- Never output a file with `status: published` or `status: approved`.
- Do not hand-edit `.workbench-state/*.json` files.

**Anti-pattern:** Agent stamps a newly-drafted PRD as `approved` to "unblock" a downstream skill.
