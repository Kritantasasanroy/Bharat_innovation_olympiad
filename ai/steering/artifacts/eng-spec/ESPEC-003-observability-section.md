---
id: ESPEC-003
title: Observability is a required section
scope: artifact:eng-spec
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [observability, ops]
---
**Rule:** Every eng spec has an "Observability" section that names the metrics, logs, and traces the new capability emits. Metrics: names, labels, dashboards they feed, SLO they inform. Logs: events, structured fields, correlation ID strategy. Traces: spans, attributes, sampling.

**Why:** Observability decided at build time beats observability retrofitted at incident time. We have enough unnamed metrics and unstructured logs already.

**How to apply:**
- For each NFR from the PRD, name the metric that will be watched.
- Structured log events with a documented schema, not free-form strings.
- Correlation / request IDs propagated at every boundary.
- Link to or propose the dashboard that will display the new signals.
- Alerts: what fires, at what threshold, against which SLO.

**Anti-pattern:** Eng spec that says "metrics will be added" with no names, labels, or thresholds.
