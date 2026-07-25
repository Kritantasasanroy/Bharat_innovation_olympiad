---
id: TDD-003
title: Sequence diagrams for every cross-service interaction
scope: artifact:tdd
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [tdd, diagrams]
---
**Rule:** Any interaction involving more than one service, or more than one internal layer with latency implications, is drawn as a Mermaid sequence diagram. Each message has a label, each actor is named, each async boundary is visible.

**Why:** Prose obscures ordering and concurrency. A sequence diagram catches deadlocks, ordering bugs, and accidental sync-where-it-should-be-async at design time.

**How to apply:**
- Use Mermaid `sequenceDiagram` inside the TDD for visual review.
- Name every arrow: method call, event name, DB query.
- Dashed arrows for async, solid for sync.
- Show error paths (alt blocks) for the failure matrix rows that span services.
- For DB calls show isolation level / locking where it matters.

**Anti-pattern:** "The service calls the other service to update the state" in prose, with no diagram and no ordering assertion.
