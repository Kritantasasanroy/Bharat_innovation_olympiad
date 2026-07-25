---
id: GP-004
title: No hype words in prose
scope: golden
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [style, docs]
---
**Rule:** Do not use hype words in generated prose. Banned defaults: `leverage`, `utilize`, `robust`, `streamline`, `unlock`, `seamless`, `revolutionary`, `world-class`, `best-in-class`, `cutting-edge`, `delightful`, `powerful`. Plain English substitutes are always available.

**Why:** Hype vocabulary obscures meaning, signals LLM authorship, and makes skimming harder. We want documents that say what they mean.

**How to apply:**
- `leverage` → `use`. `utilize` → `use`. `robust` → drop or say what specifically is robust and to what.
- `streamline` → name the step that was removed. `unlock` → name the capability that is now possible.
- When tempted to praise a design, state what it lets us do instead.

**Anti-pattern:** "This robust solution leverages our cutting-edge infrastructure to unlock seamless user experiences."
