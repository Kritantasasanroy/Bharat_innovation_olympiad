---
id: TD-001
title: No PII in any committed test data
scope: topic:test-data
owner: qa-council
created: 2026-04-24
updated: 2026-04-24
tags: [test-data, security, pii]
---
**Rule:** Test fixtures, seed data, Examples tables, and in-repo snapshots never contain personally identifiable information (real names, real emails, real addresses, real phone numbers, real payment cards, real government IDs). Synthetic data only.

**Why:** Anything in the repo is indexed by anyone with read access (including external auditors, eventual open-sourcing, misconfigured tooling). PII in test data is a compliance incident, not a "minor slip."

**How to apply:**
- Email: `*@example.test`, `*@example.com` (reserved for documentation), or the synthetic-user pool.
- Card numbers: payment processor test numbers (Stripe `4242...`, Braintree `4111...`), never a real number.
- Phone: `+1-555-01xx` range (reserved for fiction) or country-specific fictional ranges.
- Names: synthetic generator output (`Test User One`).
- If a defect reproduction requires a real value, capture it in an out-of-repo ticket attachment, not in the repo.

**Anti-pattern:** A fixtures file with a real customer's email and order ID, captured "to debug issue #1234" and forgotten.
