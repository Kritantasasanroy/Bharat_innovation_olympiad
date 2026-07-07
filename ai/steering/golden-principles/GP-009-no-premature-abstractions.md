---
id: GP-009
title: No premature abstractions; three similar lines is fine
scope: golden
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [simplicity, yagni]
---
**Rule:** Do not abstract code, specs, or artifacts on the speculation that the pattern might repeat. Three similar lines or three similar sections is better than a generalisation built on two data points.

**Why:** Early abstractions lock in the wrong shape. The pattern you see at two instances almost never survives the fourth. Refactoring three call sites into a shared helper is easy; unwinding a bad abstraction that has five call sites is expensive.

**How to apply:**
- Do not introduce helper functions, base classes, or config-driven factories to DRY two occurrences.
- Do not invent cross-cutting skill templates until you have drafted three skills by hand and seen the real shape.
- Do not add "extensibility hooks" (plug-in points, event buses, strategy patterns) for features that do not exist yet.
- Trust future refactors: add the abstraction on evidence, not intuition.

**Anti-pattern:** Agent wraps two `fetch(...)` calls in a "request utility module" because "we might want retries later."
