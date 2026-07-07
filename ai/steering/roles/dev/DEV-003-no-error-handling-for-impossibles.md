---
id: DEV-003
title: Do not handle errors for scenarios that cannot happen
scope: role:dev
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [error-handling, simplicity]
---
**Rule:** Do not write error handling, fallbacks, or defensive branches for scenarios that cannot occur given the types, framework guarantees, or internal invariants already in place. Trust the system inside the boundary (see also GP-010).

**Why:** Dead branches hide real bugs. They inflate the test surface. They suggest to future readers that the impossible case is possible, which misleads debugging.

**How to apply:**
- If a function parameter is typed `User`, do not handle `null` inside the function. Reject `null` at the boundary that built the `User`.
- If a framework guarantees middleware ordering, do not write "just in case" checks that duplicate the guarantee.
- Do not catch an exception only to rethrow it with no added context or no different handling.
- If you find yourself writing an "impossible branch" comment, delete the branch.

**Anti-pattern:** `if (user.id === undefined) throw new Error("user.id missing")` inside a function whose type signature is `(user: User) => ...`.
