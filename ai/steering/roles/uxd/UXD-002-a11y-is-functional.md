---
id: UXD-002
title: Accessibility is functional, not cosmetic
scope: role:uxd
owner: ux-council
created: 2026-04-24
updated: 2026-04-24
tags: [accessibility, wcag]
---
**Rule:** Accessibility requirements are treated as functional requirements, not cosmetic polish. WCAG AA is the minimum. Keyboard navigation, screen-reader announcements, focus management, colour contrast, and motion-reduction preferences are part of the spec, not an afterthought added at review.

**Why:** A11y defects are experienced as "the product does not work" by users who rely on assistive technology. Retrofitted a11y is more expensive than designing for it up front, and often ships with compromises.

**How to apply:**
- Every flow has a keyboard-only walkthrough noted in the design spec.
- Focus order is explicit, not implicit.
- Colour is never the sole carrier of meaning (errors, required fields, status).
- Interactive targets meet minimum size (44x44 px on touch).
- Respect `prefers-reduced-motion` for animations.
- Screen-reader labels are defined at design time, not generated from CSS classes at build time.

**Anti-pattern:** An error state communicated only by red colour, with no icon, no text label, and no ARIA live-region announcement.
