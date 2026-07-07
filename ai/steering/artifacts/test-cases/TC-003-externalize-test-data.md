---
id: TC-003
title: Test data is externalised, not inline magic values
scope: artifact:test-cases
owner: qa-council
created: 2026-04-24
updated: 2026-04-24
tags: [test-cases, test-data]
---
**Rule:** Concrete data values referenced by a test case come from named fixtures or generator utilities, not from inline magic numbers in the case description.

**Why:** Inline magic numbers bake assumptions into the case (the threshold is 100, the minimum charge is 50, the pagination size is 25) that go stale when the product changes. External fixtures stay in sync with the code.

**How to apply:**
- Test case references fixture names: "input: `fixtures/users/admin.json`" rather than a literal email address.
- Thresholds and limits come from constants or config tables (`fixtures/pricing/min-charge.json`), not copy-pasted into each case.
- If a case does use an inline value, comment the meaning: `amount: 42 # below min-charge threshold of 50`.

**Anti-pattern:** A test case that hard-codes `account_id: 9001` with no explanation of why 9001.
