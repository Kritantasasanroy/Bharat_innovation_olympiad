---
id: PRD-006
title: Every PRD references an approved epic-context
scope: artifact:prd
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [lifecycle, traceability]
---
**Rule:** A PRD's frontmatter or header links to its upstream approved epic-context file. The linked epic must be at `status: approved` per `.workbench-state/approved.json` before the PRD is drafted.

**Why:** PRDs that skip epic-context drift from the original business intent. Linking upstream also keeps the lifecycle chain visible: one broken gate is visible immediately.

**How to apply:**
- PRD frontmatter: `epic: EPIC-123` and `epic_context_path: product/context-library/epics/EPIC-123.md`.
- `/prd-draft` skill refuses to run when the named epic-context is not approved.
- Reviewers verify the linked epic-context before approving the PRD.

**Anti-pattern:** A PRD drafted "based on the ticket I found in Jira" with no link to a captured epic-context in the workbench.
