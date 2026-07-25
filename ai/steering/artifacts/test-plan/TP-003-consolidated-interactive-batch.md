---
id: TP-003
title: Test plan asks the user up front in one consolidated batch, marks TBD on deferred fields, never invents
scope: artifact:test-plan
owner: qa-council
created: 2026-05-17
updated: 2026-05-17
tags: [test-plan, interactive-prompt, discipline]
---
**Rule:** Step 2 of `/test-plan-gen` composes a single consolidated prompt that asks the user for all seven question groups at once (Release Schedule, Test Environment, Test Data Bed, Components / APIs, Dependencies, Supporting Device Types, Reviewers). The agent never asks one question at a time, never proceeds without an answer for every group, and never invents values for fields the user defers.

**Why:** Section-by-section asking creates seven separate roundtrips when one suffices. Inventing values pollutes the test plan with data the user did not actually confirm, which is then carried forward by `/test-cases-gen` and reviewed as if it were ground truth. Marking deferred fields `TBD` keeps the plan honest and surfaces what the user still needs to provide.

**How to apply:**
- Step 2 emits a single prompt that lists all seven groups with the specific fields each needs (per the table in the SKILL).
- If the user defers a field, write `TBD` in the corresponding cell or bullet. Do not omit the row; do not fill with a guess.
- The Step 6 user-facing handoff surfaces every `TBD` in an "Open items" line so the user can fill them in before publishing.
- Self-review pass at end of Step 3 verifies that every cell sourced from a user question has either a real value or a `TBD` placeholder; no cell is silently blank.

**Anti-pattern:** Agent asks for the Release Schedule, drafts section 2, then asks for the Test Environment, drafts section 3, then asks for the Test Data Bed... Seven roundtrips. The user re-reads context every time. The plan takes twenty minutes instead of three.

**Anti-pattern:** Agent invents a Reviewer name ("Reviewer 1: QA Lead") when the user defers the Reviewers question. Reviewers are role-and-name pairs; an invented name pollutes the artifact and is hard to spot in review.
