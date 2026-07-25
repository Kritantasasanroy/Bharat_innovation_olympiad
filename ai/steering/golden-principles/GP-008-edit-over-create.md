---
id: GP-008
title: Prefer editing existing files over creating new ones
scope: golden
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [simplicity, codebase-hygiene]
---
**Rule:** When a change can be made by editing an existing file, do that. Do not create a new file unless the existing structure clearly rejects the change (different module boundary, different concern, different lifecycle).

**Why:** New files accrete. Each one is a place future readers must learn about. Edits stay discoverable by people already reading the file they are changing.

**How to apply:**
- If a skill already has a rule that matches, edit the existing rule, do not add a sibling.
- If an eng spec already has a section for observability, extend it, do not open a new top-level doc.
- Never create documentation files (`*.md`, `README.md`) proactively. Only when the user asks.

**Anti-pattern:** Agent invents `steering/golden-principles/GP-999-notes.md` as a scratch space instead of editing the rule it was supposed to update.
