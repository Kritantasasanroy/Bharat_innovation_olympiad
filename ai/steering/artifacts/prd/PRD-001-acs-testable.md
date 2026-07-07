---
id: PRD-001
title: Acceptance criteria must be verifiable by test or observable signal
scope: artifact:prd
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [acceptance, testability]
---
**Rule:** Every AC in a PRD is verifiable by an automated test, a metric, an observable log/event, or a clearly-defined manual check with pass/fail criteria.

**Why:** Unverifiable ACs cannot be used to gate a release. They also cannot drive BDD scenario generation.

**How to apply:**
- Each AC names the observable signal: a test step, a metric threshold, a log event, a UI state.
- Cross-check ACs against the downstream BDD feature file: each AC maps to at least one scenario.
- Reject a PRD at review if any AC is subjective ("feels fast", "easy to use").

**Anti-pattern:** "The system must be reliable under load."
