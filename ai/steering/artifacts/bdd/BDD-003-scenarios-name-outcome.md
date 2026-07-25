---
id: BDD-003
title: Scenario names state the observable outcome
scope: artifact:bdd
owner: qa-council
created: 2026-04-24
updated: 2026-04-24
tags: [bdd, naming]
---
**Rule:** A scenario's name states the outcome ("refund is issued within 60 days"), not the test mechanism ("test refund endpoint returns 200"). Read alone, the name is a sentence a product owner can validate.

**Why:** Mechanism-named scenarios convey no product meaning. They read as implementation detail and age badly. Outcome-named scenarios double as living documentation.

**How to apply:**
- Pattern: "<subject> <verb> <object> <when/condition>."
- Good: `Scenario: duplicate webhook is ignored within the idempotency window`.
- Bad: `Scenario: POST /webhook with same id twice returns 200 then 200`.
- Review: if the scenario name mentions HTTP verbs, status codes, or function names, rewrite.

**Anti-pattern:** `Scenario: test passes when feature flag is on and user is admin and tenant is valid` (no outcome, only preconditions).
