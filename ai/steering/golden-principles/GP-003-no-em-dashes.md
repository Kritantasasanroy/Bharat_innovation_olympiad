---
id: GP-003
title: No em dashes in documents
scope: golden
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [style, docs]
---
**Rule:** Do not use em dashes (`—`) in generated documents (PRDs, eng specs, TDDs, BDDs, test specs, ADRs, ERDs, READMEs, commit messages, PR bodies). Use commas or parentheses instead. Code blocks are exempt when the content itself requires the character.

**Why:** Em dashes are a reliable fingerprint of LLM-generated prose. We want documents to read as if a human wrote them.

**How to apply:**
- Replace `— ` with `, ` or `(` / `)` during drafting, not as a post-edit pass.
- When quoting external text verbatim, preserve the original characters. Do not rewrite quoted material.
- Avoid `–` (en dash) in the same roles for the same reason.

**Anti-pattern:** "This PR reduces latency, critical for our SLO — also improves error handling."
