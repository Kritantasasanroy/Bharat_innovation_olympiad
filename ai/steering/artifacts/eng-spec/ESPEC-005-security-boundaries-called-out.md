---
id: ESPEC-005
title: Security boundary crossings are called out
scope: artifact:eng-spec
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [security, trust-boundary]
---
**Rule:** Any crossing of a trust boundary (internet → app, app → internal services, tenant A → tenant B, untrusted file → parser) is named. For each, state: what authenticates, what authorises, what validates input, what sanitises output, what logs the event.

**Why:** Security bugs hide at boundaries. A clear inventory of crossings forces thinking about authn, authz, input validation, and auditing consistently, rather than per-endpoint.

**How to apply:**
- List each crossing with direction, auth mechanism (token, mTLS, session), authz model (RBAC, ABAC, tenant-scoped), validation (schema, allowlist), output encoding (SQL parameterisation, HTML encoding), audit (log line + retained fields).
- Multi-tenant crossings: state explicitly how tenant isolation is enforced at query level.
- File parsing boundaries: name the parser, whether it is sandboxed, maximum size, accepted mime types.
- Secrets: where they live, how they rotate, what service fetches them at runtime.

**Anti-pattern:** Eng spec that names "JWT auth" and nothing else about the boundary model.
