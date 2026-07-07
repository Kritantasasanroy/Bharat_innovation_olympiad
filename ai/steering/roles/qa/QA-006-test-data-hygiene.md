---
id: QA-006
title: Test data carries no PII, no prod IDs, no brittle magic constants
scope: role:qa
owner: qa-council
created: 2026-04-24
updated: 2026-04-24
tags: [test-data, security]
---
**Rule:** Test data is synthetic, bounded, and isolated. No real personal information. No production identifiers. No hard-coded magic values whose meaning is implicit.

**Why:** Real PII in test fixtures is a compliance incident waiting to happen, and a copy-pasted prod ID can silently hit prod systems when a test environment is misconfigured. Magic constants tie scenarios to undocumented assumptions that break when the assumptions shift.

**How to apply:**
- Generate synthetic names, emails, card numbers (use the documented test card numbers from the payment processor, never a real one).
- Tenant/account IDs for tests are deterministic but prefixed (`test-tenant-001`), never a known prod value.
- Constants in scenarios have names: `amount: 42.00 # below min-charge threshold of 50.00 (see BILLING-POLICY-02)`.
- Teardown resets state. Test N should not depend on Test N-1 having run.
- If a fixture is large, check it in as a file with a schema, not embedded in the test body.

**Anti-pattern:** An Examples table with `email | "john.doe@realcompany.com"` or `charge_id | ch_1PqA...` (real Stripe ID format).
