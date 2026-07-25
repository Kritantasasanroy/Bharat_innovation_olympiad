---
id: TSPEC-002
title: Flaky-test strategy is stated
scope: artifact:test-spec
owner: qa-council
created: 2026-04-24
updated: 2026-04-24
tags: [test-spec, flake]
---
**Rule:** Every test spec states the team's flaky-test policy: retry budget per test, retry budget per run, quarantine rules, quarantine review cadence.

**Why:** Without a policy, flaky tests proliferate. Teams accumulate "it passes on the third try" tests until signal is gone.

**How to apply:**
- Per-test retries: how many retries allowed before the test is flagged.
- Per-run retries: total retry budget per CI run (prevents "retry everything" abuse).
- Quarantine: when a test is flagged, how long until it is fixed or deleted.
- Quarantine review: who owns the quarantined set, and when is it audited.
- Alerting when a non-flaky test enters the flaky bucket.

**Anti-pattern:** Test spec that says nothing about flakes; team adds `retry 3` wrappers ad hoc.
