---
id: DEV-002
title: Do not design for hypothetical future requirements
scope: role:dev
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [yagni, simplicity]
---
**Rule:** Build for the requirements on the ticket. Do not add features, extensibility points, or configuration knobs for scenarios the product has not asked for.

**Why:** Every "what if we need X later" carries real cost today (code to read, tests to maintain, options to document) and rarely matches the actual X when it arrives. Code is cheaper to add when needed than to unwind when wrong.

**How to apply:**
- No feature flags for features nobody asked for.
- No "pluggable backend" interfaces when there is one backend and no plan for a second.
- No config options whose only caller is the test suite.
- No backwards-compatibility shims when the only consumer is the code you just changed.

**Anti-pattern:** Adding a `providers: Map<string, AuthProvider>` registry when the app has one auth provider and no ticket mentions a second.
