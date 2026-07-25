---
id: BDD-004
title: No PII or real credentials in Examples tables
scope: artifact:bdd
owner: qa-council
created: 2026-04-24
updated: 2026-04-24
tags: [bdd, security, test-data]
---
**Rule:** Examples tables, inline Given values, and test fixtures contain synthetic data only. No real email addresses, account numbers, tenant IDs, API keys, card numbers, or customer names.

**Why:** Feature files are committed to the repo and visible to everyone with read access. Real PII in fixtures is a compliance incident waiting to happen. Real production IDs invite accidental cross-environment calls.

**How to apply:**
- Emails: `user-001@example.test`, not a real domain.
- Card numbers: use the payment processor's documented test numbers (Stripe `4242 4242 4242 4242` etc).
- Tenant / account / user IDs: prefixed (`test-tenant-001`) so grep confirms they are synthetic.
- Names: synthetic (`Test User One`), not drawn from a real customer list.
- If a bug requires a real-world value to reproduce, capture it privately, not in the committed feature file.

**Anti-pattern:** `| email | "real.person@example.com" |` in an Examples table.
