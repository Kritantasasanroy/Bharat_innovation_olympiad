---
id: QA-005
title: One scenario asserts one observable outcome
scope: role:qa
owner: qa-council
created: 2026-04-24
updated: 2026-04-24
tags: [bdd, scenario-design]
---
**Rule:** A BDD scenario exercises one user intent and ends with `Then` steps that assert a single observable outcome (possibly with a few tightly-related facets of that outcome). Scenarios are not "end-to-end tours" with ten assertions about unrelated state.

**Why:** Multi-outcome scenarios obscure which assertion failed, which is the point of a test. They also encourage coupling unrelated behaviour into one test case, so one regression breaks ten scenarios.

**How to apply:**
- A scenario should read as one clear sentence of intent: "refund is issued when a charge is disputed within 60 days."
- If you find yourself writing `And the inventory is updated And the audit log has an entry And the email is sent And the dashboard refreshes`, split into separate scenarios.
- Use `Scenario Outline` for the same intent across multiple input rows. Do not use it to bundle unrelated intents.
- `Background` carries shared preconditions, not shared assertions.

**Anti-pattern:** A single `Scenario: checkout happy path` that asserts cart state, pricing, inventory, user session, analytics events, and email send, all in one `Then` stanza.
