---
id: QA-003
title: Negative paths are first-class, not optional
scope: role:qa
owner: qa-council
created: 2026-04-24
updated: 2026-04-24
tags: [coverage, error-paths, security]
---
**Rule:** Every feature ships with error-path and security-path scenarios, not just the happy path. BDD feature files always include `@error` and `@security` scenarios. Test cases enumerate failure modes explicitly.

**Why:** Happy paths get exercised by real users. Error and security paths get exercised by attackers, outages, and bad inputs, and those are the paths that cause incidents. An untested error path is an unknown-behaviour path in production.

**How to apply:**
- For every `@happy-path` scenario, write the corresponding `@error` scenario (what happens when the dependency fails, the input is malformed, the user is unauthorised).
- For every user-facing endpoint or UI action, write a `@security` scenario (unauthenticated, unauthorised, tenant mismatch, injection attempt).
- Do not accept "covered by the happy path" as a reason to omit error tests.
- Review: if the `.feature` file has no `@error` scenarios, the PRD acceptance criteria are incomplete.

**Anti-pattern:** A BDD file for a payment endpoint that only has `Scenario: charges a card successfully` and no scenarios for declined card, network timeout, amount-too-large, or tampered signature.
