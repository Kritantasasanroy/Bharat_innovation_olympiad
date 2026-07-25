---
id: UXD-003
title: Error and empty states are first-class, not afterthoughts
scope: role:uxd
owner: ux-council
created: 2026-04-24
updated: 2026-04-24
tags: [state-coverage, errors, empty-states]
---
**Rule:** Every screen spec includes the error state, the empty state, and the loading state explicitly. Each state names what the user sees, what they can do from it, and how they recover. A screen is not "designed" until all four states (default, loading, empty, error) are specified.

**Why:** Users spend more time in error and empty states than designers expect. Missing states are filled in at build time by the frontend engineer's best guess, which is how we end up with unstyled spinners, "undefined" error messages, and blank screens for zero-result lists.

**How to apply:**
- Error state: human-readable message, recommended action, escape hatch (retry, contact support, navigate away).
- Empty state: why is it empty, what can the user do first (CTA, tutorial link).
- Loading state: skeleton over spinner when the layout is known; spinner for bounded operations.
- Long-running state: show progress or expected time when possible.

**Anti-pattern:** A Figma screen labelled "Dashboard" that shows only the populated state, with no version for "no data," "API down," or "still loading."
