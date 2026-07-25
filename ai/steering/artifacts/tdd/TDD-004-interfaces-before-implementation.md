---
id: TDD-004
title: Interfaces defined before implementation sketch
scope: artifact:tdd
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [tdd, interfaces]
---
**Rule:** The TDD defines the public interfaces of new modules (types / class signatures / function signatures / message schemas) before it sketches the implementation. Implementation details are a supporting section, not the primary artefact.

**Why:** Interfaces are the contract. Reviewing them first catches design issues quickly; reviewing implementations first hides interface confusion under syntactic detail.

**How to apply:**
- For each new module, list exported types and function signatures with doc-comments.
- For events / messages, specify the schema with field names and types.
- The implementation sketch says "how," not "what." It can be rough; the interface cannot.
- If the interface has changed from the eng spec's port definitions (ESPEC-001), flag the delta explicitly.

**Anti-pattern:** TDD with pages of algorithm description and no explicit interface signatures for the module being added.
