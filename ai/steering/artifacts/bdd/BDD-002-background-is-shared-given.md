---
id: BDD-002
title: Background holds shared Given steps, not scenario-specific setup
scope: artifact:bdd
owner: qa-council
created: 2026-04-24
updated: 2026-04-24
tags: [bdd, structure]
---
**Rule:** `Background` holds preconditions genuinely shared across every scenario in the feature. Scenario-specific setup belongs inside the scenario's own `Given` steps.

**Why:** Overloaded `Background` blocks hide which preconditions matter for a given scenario. They also slow down every test by running unused setup.

**How to apply:**
- If a `Given` line is referenced by all scenarios, it belongs in `Background`.
- If only two of five scenarios need a particular state, move it into those scenarios' `Given` steps.
- When `Background` grows past five steps, reconsider splitting the feature file.
- `Background` does not have outcomes; it has state.

**Anti-pattern:** A 15-line `Background` block followed by 12 scenarios where each scenario only uses 3 of the preconditions.
