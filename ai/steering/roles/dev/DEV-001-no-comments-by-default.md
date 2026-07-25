---
id: DEV-001
title: Default to no comments; add them only when WHY is non-obvious
scope: role:dev
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [code-style, comments]
---
**Rule:** Write code with no comments by default. Well-named identifiers and small functions already describe what the code does. Only add a comment when the WHY is non-obvious: a hidden constraint, a subtle invariant, a workaround for a specific bug, behaviour that would surprise a reader.

**Why:** Comments that restate the code rot. When the code changes and the comment does not, the comment becomes a lie. Good names do not rot.

**How to apply:**
- Do not write comments that describe WHAT the code does.
- Do not reference the current task, fix, or callers ("used by X", "added for the Y flow", "handles the case from issue #123"). Those belong in the PR description.
- Do not write multi-paragraph docstrings or multi-line comment blocks. One short line max.
- When you do add a comment, lead with the hidden constraint: "throws if buffer < 4KB because kernel page-aligns writes" beats "checks buffer size."

**Anti-pattern:** `// Increment the counter` above `counter++;`.
