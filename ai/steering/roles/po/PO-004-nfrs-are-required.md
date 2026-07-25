---
id: PO-004
title: NFRs are required for every production feature
scope: role:po
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [prd, nfrs]
---
**Rule:** Every production-facing capability in a PRD has a non-functional requirements section: latency target, availability target, throughput ceiling, error budget, security posture, compliance obligations, data residency. "Best effort" is not a target.

**Why:** NFRs drive architecture decisions (caching, retries, idempotency, region placement, auth model). Skipping them means engineering picks defaults that may or may not match production constraints, and nobody notices until the incident.

**How to apply:**
- `p95 latency`, `p99 latency`, `availability target (e.g. 99.9%)`, `peak QPS`, `error budget burn rate`, `data classification`, `retention`, `residency`.
- Compliance call-outs (PCI, GDPR, SOC2) if the capability touches regulated data.
- If a number cannot be stated, state the *basis for the decision* (e.g. "matches parent service's 99.9% availability target").
- NFRs are a precondition for approving an eng spec. Reject eng specs whose design does not justify each NFR.

**Anti-pattern:** PRD lists functional ACs only, eng spec adds "best effort" for availability, incident at rollout because nobody sized the connection pool.
