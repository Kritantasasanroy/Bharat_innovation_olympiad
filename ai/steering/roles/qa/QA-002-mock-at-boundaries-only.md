---
id: QA-002
title: Mock at system boundaries only; never between internal layers
scope: role:qa
owner: qa-council
created: 2026-04-24
updated: 2026-04-24
tags: [mocks, integration]
---
**Rule:** Mocks live at system boundaries: external HTTP APIs, third-party SDKs, message brokers, time, file system, network. Do not mock your own modules, services, or internal functions.

**Why:** Internal mocks fossilise implementation details and let broken refactors pass. They also hide integration bugs (wrong arg shape, wrong serialisation, wrong error mapping) that only appear when the real code runs.

**How to apply:**
- Integration-style tests for internal flows. Real DB, real queues, real app code.
- Mock `Stripe.charges.create`, do not mock `BillingService.chargeCustomer`.
- Mock `Date.now()`, do not mock `OrderService.getCurrentOrder`.
- If the internal layer is slow or flaky, fix the layer or add a real test double at the boundary, not a mock inside the layer.
- Record, replay, or contract-test external services where possible.

**Anti-pattern:** `jest.mock('./userRepository')` inside a test for `UserController`, so "controller logic" is exercised against a hand-rolled fake that drifts from the real repository.
