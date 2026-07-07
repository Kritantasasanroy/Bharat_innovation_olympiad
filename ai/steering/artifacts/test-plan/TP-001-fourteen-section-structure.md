---
id: TP-001
title: Test plan follows the 14-section structure in strict order
scope: artifact:test-plan
owner: qa-council
created: 2026-05-17
updated: 2026-05-17
tags: [test-plan, structure]
---
**Rule:** Every test plan carries exactly 14 sections in this strict order: Vision and Goal, Release Schedule, Test Environment, Types of Testing, Testing Scope and Efficiencies, Test Data Bed, Components, Dependencies, Risk Profile and Challenges, Tools / Resources / Environments / Other Dependencies, Supporting Device Types and Terminal Releases, Entry and Exit Criteria, Execution Logs and Results, Reviewers. Sections are not omitted; sections are not reordered.

**Why:** A test plan is reviewed by stakeholders across QA, DEV, PO, and (sometimes) the customer. A predictable section order shortens review and lets readers cross-reference between epics. Implicit "skip if N/A" creates ambiguity about whether the section was considered.

**How to apply:**
- Use Markdown `## N. Section Name` headings exactly (numbered, then space, then name).
- When a section is not applicable for this epic, include the section with an explicit "Not applicable" statement and a one-line reason. Example: section 11 (Supporting Device Types) for a backend-only epic reads "Not applicable. This epic is a server-side change with no terminal-side effect."
- Performance Testing row in section 3 (Test Environment) is the one conditional element: include the row only when the PRD has a performance signal.
- Self-review pass at the end of Step 3 verifies all 14 headings are present in order before the artifact returns to the user.

**Anti-pattern:** A test plan with 11 sections because "device types and execution logs were N/A so we dropped them". Implicit drops hide whether the author thought about that section. Always include the section with an explicit "Not applicable" note.
