---
id: PO-001
title: Acceptance criteria must be verifiable by a test or an observable signal
scope: role:po
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [prd, acceptance, verifiability]
---
**Rule:** Every acceptance criterion can be checked by an automated test or by an observable signal in production (metric, log event, queue state, DB row). ACs that rest on subjective human feeling are rewritten or dropped.

**Why:** ACs are the product team's contract with engineering and QA. A non-verifiable AC cannot gate a release and cannot drive a test case. It becomes a vibe.

**How to apply:**
- Each AC names a measurable state change or observable event.
- If an AC uses the word "feel", "seamless", "smooth", "intuitive", rewrite as a specific interaction (e.g. "completes in < 200 ms", "no more than 2 clicks from listing to detail").
- If the AC cannot be rewritten, move it to the non-goals section or drop it with a note.
- Cross-check each AC against the BDD feature file: is there a `Scenario` whose `Then` step matches this AC?

**Anti-pattern:** "The user feels confident that their action succeeded."
