---
id: UXD-001
title: Start from design system primitives; escape hatch second
scope: role:uxd
owner: ux-council
created: 2026-04-24
updated: 2026-04-24
tags: [design-system, consistency]
---
**Rule:** Compose screens from the design system's existing primitives (tokens, components, patterns). Bespoke elements are the second choice, introduced only when an existing primitive clearly does not fit and the deviation is documented.

**Why:** Every bespoke button drift fragments the product. Consistency beats local prettiness: a user who learns one component learns it everywhere.

**How to apply:**
- Open the design system reference (`design/context-library/design-system-ref.md`) before sketching a new component.
- When you deviate, add a note to `design/context-library/deviations.md` with reason + ticket to revisit.
- Bring recurring deviations back to the design-system council for promotion (new primitive) or alignment (stop deviating).
- Component naming in mockups matches the design-system name, not a team-local synonym.

**Anti-pattern:** Inventing a custom modal shell per feature because "the design-system one is not quite right" and never logging the gap.
