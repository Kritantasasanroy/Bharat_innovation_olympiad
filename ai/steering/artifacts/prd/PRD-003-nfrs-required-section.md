---
id: PRD-003
title: Non-functional requirements are a required section
scope: artifact:prd
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [nfrs, quality]
---
**Rule:** Every PRD includes an "NFRs" section with at minimum: latency targets (p95, p99), availability target, peak load / throughput, security posture, data classification, residency, compliance obligations. See also PO-004.

**Why:** Architecture decisions (caching, retries, region placement, auth model) flow from NFRs. A PRD without NFRs produces an eng spec full of default assumptions that rarely survive production.

**How to apply:**
- Concrete numbers or an explicit reference to a parent service's numbers.
- For regulated data, name the regime (PCI, GDPR, HIPAA, SOC2).
- If a figure cannot be set yet, state what decision gates it and when it will be set.

**Anti-pattern:** NFR section reads "Standard company targets apply."
