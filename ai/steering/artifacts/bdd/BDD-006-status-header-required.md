---
id: BDD-006
title: Every .feature file has a lifecycle header
scope: artifact:bdd
owner: qa-council
created: 2026-04-24
updated: 2026-04-24
tags: [bdd, lifecycle]
---
**Rule:** Every Gherkin `.feature` file begins with a comment header containing lifecycle metadata. Required fields: `id`, `status` (draft on first write), `epic`, `prd`, `created`, `owner`, `language`.

**Why:** The lifecycle system uses the `# status:` comment to flip Gherkin files through `draft -> published -> approved`. Without the header, `wb.publish` has nothing to rewrite. The other fields keep provenance visible to reviewers.

**How to apply:**
- Header block at the top, before the first `@` tag.
- `# status: draft` exactly in this form on first write. `wb.publish` rewrites it.
- `# epic:` and `# prd:` link to the upstream artifacts for traceability.
- Do not move or delete the header, even after approval.

**Anti-pattern:** A `.feature` file whose first non-blank line is `Feature:`, with no comment header — `wb.publish` rejects it.
