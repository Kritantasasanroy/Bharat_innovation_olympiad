---
id: TC-001
title: Test cases carry priority, type, suite, automation state, and labels (Zephyr-aligned)
scope: artifact:test-cases
owner: qa-council
created: 2026-04-24
updated: 2026-05-08
tags: [test-cases, triage, zephyr]
---
**Rule:** Every test case in a test-cases file carries five explicit attributes that match the team's Zephyr column structure. No defaults; no ai-workbench-internal vocabulary that diverges from what Zephyr accepts.

| Column | Allowed values | Description |
|---|---|---|
| Priority | `P0 - Critical`, `P1 - High`, `P2 - Medium`, `P3 - Low` | Drives execution order in a time-constrained run. P0 fails block the release. |
| Test Case Type | `FE - Front End`, `API - Application Programming Interface`, `BE - Backend`, `DB - Database` | Layer of the test. Derived from the source BDD's layer tag (`@ui` → FE; `@api` → API; `@backend` → BE; `@db` → DB). Cross-layer tests pick the layer of the primary assertion. Cross-cutting BDD tags (`@security`, `@performance`) do not determine Test Case Type; they flow through to Labels and Suite. |
| Test Case Suite | `Smoke`, `Sanity`, `Regression` | Suite assignment. Smoke verifies build / deployment stability and blocks further testing if it fails. Sanity verifies the new implementation works as expected. Regression verifies existing functionality is not broken. |
| Automation State | `TBA - To be automated`, `NFS - Not feasible` | Honest classification against the team's actual automation scope. UI / API tests are `TBA`. DB / Backend / Performance / log-inspection / infrastructure tests are `NFS`. |
| Labels | `<EPIC-id>, <Type-short>[, <Type-short>...]` | Single-layer TCs carry one Type-short (for example `ICS-24241, BE` for a backend test case). Cross-layer TCs carry multiple comma-separated Type-shorts matching the Test Case Type column (for example `ICS-24241, FE, API` for a UI+API test case). Type-short is one of `FE`, `API`, `BE`, `DB`. |

**Why:** Test-case attributes drive run order, suite execution, and automation backlog tracking. Aligning them to Zephyr column values lets the same artifact serve as the workbench review document AND the Zephyr import source. No double-maintenance, no manual rewriting.

The Smoke / Sanity / Regression vocabulary makes the testing intent explicit:

- **Smoke:** verifies the build is stable enough for further testing. If it fails, no further testing makes sense; the build is rejected. Examples: deployment-time post-deploy checks, "the changelog applied without errors", "the cron job fired on schedule".
- **Sanity:** verifies that the specific change works as expected and has not impacted closely related areas. Typically maps to `@happy-path` BDD scenarios on the new feature behavior.
- **Regression:** ensures existing functionality is not broken by the new change. Maps to `@edge`, `@error`, adjacent-area non-change assertions, performance-target, security non-change, and idempotency BDD scenarios.

**How to apply:**
- Priority: pick exactly one of P0..P3. Use the PRD's risks and ACs to calibrate.
- Test Case Type: pick exactly one (or list both for cross-layer); derive from BDD layer tags.
- Test Case Suite: derive from the BDD scenario subject. Deployment / build subject → Smoke; happy-path on new feature → Sanity; everything else → Regression.
- Automation State: derive from BDD `@manual` tag and layer tags. UI / API without `@manual` → TBA; everything else → NFS.
- Labels: always `<EPIC-id>, <Type-short>[, <Type-short>...]` matching the Test Case Type column. Single-layer TCs carry one Type-short; cross-layer TCs carry all applicable Type-shorts comma-separated.
- The test-cases markdown table uses these column names verbatim so the file imports into Zephyr without column renaming.

**Anti-pattern:** A test-cases file with columns `TC ID | Title` and nothing else. A file using `automated / manual / planned` while the team's Zephyr instance accepts only `TBA / NFS`. A file where every case is marked `TBA` regardless of the source BDD's `@manual` tag. A file where the Suite column is filled by guess rather than by deriving from the BDD scenario subject.
