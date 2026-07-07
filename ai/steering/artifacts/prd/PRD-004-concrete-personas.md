---
id: PRD-004
title: Personas are concrete, not abstract "users"
scope: artifact:prd
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [personas, scope]
---
**Rule:** Personas referenced in a PRD are named roles with stated context (job, tools, goals, frequency). Avoid "the user" without further qualification.

**Why:** Abstract personas produce abstract requirements. "The user wants to export data" hides which user, why, at what frequency, and in what format. Concrete personas force specificity.

**How to apply:**
- "Billing operations analyst, logs in daily, exports to Excel, uploads to SAP on Friday" beats "the user."
- Link each goal and AC to a named persona.
- If the PRD addresses multiple personas, state their priority ordering.
- When a persona is new, briefly describe their context in the PRD body or link to the persona reference.

**Anti-pattern:** "The user can configure notifications" as a requirement, with no persona given.
