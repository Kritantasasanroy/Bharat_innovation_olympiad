---
id: BDD-005
title: Scenario Outline preferred over copy-pasted scenarios
scope: artifact:bdd
owner: qa-council
created: 2026-04-24
updated: 2026-04-24
tags: [bdd, outline]
---
**Rule:** When the same intent is exercised across multiple inputs, use `Scenario Outline` with an `Examples:` table. Do not copy-paste the same `Scenario` body three times with one value changed.

**Why:** Copy-pasted scenarios drift (someone edits one, forgets the others). Outlines keep the intent in one place and make the input variation visible.

**How to apply:**
- Parameterise with `<placeholder>` syntax.
- Each Examples row is one input set. Include a header row with column names.
- Use a final `| _notes |` column if rows need explanation (e.g. "edge case: exactly at threshold").
- Do not use Outlines to bundle *unrelated* intents. Different intent = different Scenario.

**Anti-pattern:** Three identical Scenarios named "with USD", "with EUR", "with GBP" whose bodies are byte-identical except the currency code.
