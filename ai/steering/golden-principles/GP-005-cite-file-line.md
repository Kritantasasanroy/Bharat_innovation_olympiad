---
id: GP-005
title: Cite file:line when referencing code
scope: golden
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [citations, precision]
---
**Rule:** When referring to a specific piece of code in any artifact (PRD, eng spec, TDD, ADR, BDD, test-spec, review comment, commit message), include `path/to/file.ext:line_number`. If the reference spans a range, use `path/to/file.ext:start-end`.

**Why:** Reviewers need to jump straight to the code. Prose like "the auth middleware" forces a search and ages badly once files are renamed.

**How to apply:**
- Prefer `src/auth/middleware.ts:42` over "the auth middleware."
- In a TDD's failure matrix, cite the exact file:line where the error surfaces.
- In an ADR, cite the file:line of the existing implementation you are deciding against.
- When the code does not exist yet (greenfield spec), skip the citation rather than invent a path.

**Anti-pattern:** "The handler logs the request somewhere in the request pipeline."
