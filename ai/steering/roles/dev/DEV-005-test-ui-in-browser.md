---
id: DEV-005
title: For UI work, exercise the feature in a browser before claiming done
scope: role:dev
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [testing, ui, done-criteria]
---
**Rule:** For any UI or frontend change, start the dev server and exercise the feature in a real browser before reporting the task complete. Walk through the golden path and the error/edge paths. Watch for regressions in nearby features.

**Why:** Type checks and unit tests verify code, not product behaviour. "Compiles and tests pass" is necessary, not sufficient. We have shipped empty modals, broken navigation, and unstyled states because the agent did not open the page.

**How to apply:**
- Run the dev server. Click the thing.
- If the work changes a form, submit the form. Submit with missing fields. Submit with a 500-on-POST mocked.
- If the work changes navigation, click through from at least two entry points.
- If you cannot run the UI in this environment, say so explicitly ("I implemented the code but did not test it in a browser") rather than implying success.

**Anti-pattern:** "All tests pass, feature ready for review" after a React refactor where the component was never rendered.
