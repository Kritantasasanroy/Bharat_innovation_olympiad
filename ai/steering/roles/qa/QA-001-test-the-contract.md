---
id: QA-001
title: Test the contract, not the implementation
scope: role:qa
owner: qa-council
created: 2026-04-24
updated: 2026-04-24
tags: [test-design, bdd]
---
**Rule:** Tests assert on the observable contract: inputs in, outputs out, side effects on shared state. Tests do not assert on internal structures, private methods, internal call order, or incidental ordering.

**Why:** Tests coupled to implementation break every refactor, even when the contract is preserved. They punish good code changes and provide no real signal about product correctness.

**How to apply:**
- Assert on HTTP status + body, emitted events, DB rows changed, UI visible state, return values. Not on "this internal helper was called twice."
- Prefer black-box scenarios: drive the system at its public boundary, verify what a real consumer would see.
- If a test names a private function, ask if it should be testing the public caller instead.
- Mutation testing is the gold standard: if the test still passes after the implementation is replaced with an equivalent, the test is good.

**Anti-pattern:** A unit test that spies on `this._buildCacheKey` and asserts it was called with specific args, while the actual cached value is never checked.
