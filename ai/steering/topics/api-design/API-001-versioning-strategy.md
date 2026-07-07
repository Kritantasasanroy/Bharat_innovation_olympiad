---
id: API-001
title: Versioning strategy stated before the first endpoint
scope: topic:api-design
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [api, versioning]
---
**Rule:** When a new public or inter-service API is introduced, the versioning strategy is decided before the first endpoint ships. Either URL-path versioning (`/v1/...`), header versioning (`Accept: application/vnd.company.v1+json`), or strict no-versioning-with-deprecation-policy. Choose one; document why.

**Why:** APIs accrete. The first endpoint's versioning choice is the choice for everything after. Retrofitting versioning is expensive and error-prone.

**How to apply:**
- Eng spec names the versioning strategy in the "Interfaces" section.
- For inter-service APIs, match the company's existing convention unless a documented exception applies.
- Deprecation policy stated (notice period, sunset date, migration path) even if no deprecation is expected.
- Breaking changes produce a new version; non-breaking changes do not.

**Anti-pattern:** First endpoint ships at `/users`. Six months later, second endpoint ships at `/v2/orders`. No versioning policy captured anywhere.
