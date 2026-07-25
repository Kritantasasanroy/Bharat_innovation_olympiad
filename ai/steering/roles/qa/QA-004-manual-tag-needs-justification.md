---
id: QA-004
title: The @manual tag requires a written justification
scope: role:qa
owner: qa-council
created: 2026-04-24
updated: 2026-04-24
tags: [automation, bdd]
---
**Rule:** A scenario tagged `@manual` must include an inline comment stating why automation is not worth the cost (technical obstacle, unreasonable setup, intentional human-in-the-loop check). "TBD" is not a justification. Over time `@manual` should trend toward zero.

**Why:** `@manual` compounds. Without discipline, teams accumulate hundreds of "manual" scenarios that nobody actually runs, giving false coverage. Requiring a justification forces the conversation about whether the scenario should be automated, moved to exploratory testing, or dropped.

**How to apply:**
- Every `@manual` scenario is followed by a single comment line explaining the blocker.
- Review: if the blocker has been resolved since the tag was added, remove `@manual` and automate.
- Accessibility audits, visual regression on deeply animated UI, and exploratory charter scenarios are legitimate `@manual` candidates; "I did not have time to automate" is not.
- Report count of `@manual` scenarios per release. Trend, not absolute, is the signal.

**Anti-pattern:** `@manual` on a login-happy-path scenario with no comment, added because the test harness had a flaky fixture that week.
