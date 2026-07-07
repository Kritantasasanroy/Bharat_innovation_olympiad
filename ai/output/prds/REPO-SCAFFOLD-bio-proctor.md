# Repo Scaffold — `bio-proctor`

**Runtime cadence:** Exam-window + review/retention jobs  
**Final source:** `ai/output/prds`.

## Purpose

Exam-window proctoring service: face enrollment, frame analysis, risk events, review workflow, biometric retention/deletion. Independent ML/runtime lifecycle.

## Suggested scaffold

### Apps
- proctor-review-web or admin-embedded review surface (optional; API remains primary)

### Services / workers
- proctor-api
- proctor-worker
- model-runtime
- retention-worker
- review-event producer

### Packages / shared local modules
- model-runtime
- contracts
- config
- observability
- testkit

## Primary PRDs

- [`PROCTOR-01`](PRD-PROCTOR-01-face-enrollment.md) — Face Enrollment
- [`PROCTOR-02`](PRD-PROCTOR-02-frame-analysis-match.md) — Frame Analysis & Match
- [`PROCTOR-03`](PRD-PROCTOR-03-events-risk-integrity.md) — Events, Risk & Integrity
- [`PROCTOR-04`](PRD-PROCTOR-04-review-console.md) — Review Console
- [`PROCTOR-05`](PRD-PROCTOR-05-biometric-retention.md) — Biometric Retention

## Impacted PRDs

- [`PLAT-01`](PRD-PLAT-01-repo-scaffolding.md) — Repo Scaffolding (primary: all four repos / foundation track)
- [`PLAT-02`](PRD-PLAT-02-shared-contracts-events.md) — Contracts & Events (primary: all four repos / foundation track)
- [`PLAT-03`](PRD-PLAT-03-infrastructure.md) — Infrastructure (primary: all four repos / foundation track)
- [`PLAT-04`](PRD-PLAT-04-observability-audit.md) — Observability & Audit (primary: all four repos / foundation track)
- [`PLAT-05`](PRD-PLAT-05-security-baseline-threat-model.md) — Security Baseline (primary: all four repos / foundation track)
- [`AUTH-03`](PRD-AUTH-03-dpdp-consent-retention.md) — DPDP Consent & Retention (primary: bio-portal)
- [`AUTH-04`](PRD-AUTH-04-admin-auth-rbac.md) — Admin Auth & RBAC (primary: bio-admin)
- [`AUTH-05`](PRD-AUTH-05-session-token-management.md) — Sessions & Tokens (primary: bio-portal + bio-admin)
- [`ADMIN-06`](PRD-ADMIN-06-dashboard-analytics.md) — Dashboard Analytics (primary: bio-admin)
- [`EXAM-01`](PRD-EXAM-01-device-identity-check.md) — Device & Identity Check (primary: bio-exam)
- [`SCORE-02`](PRD-SCORE-02-results-ranking-certificates.md) — Results, Ranking & Certificates (primary: bio-admin)
- [`OPS-01`](PRD-OPS-01-exam-day-ops-incident-response.md) — Exam-Day Ops & Incident Response (primary: bio-admin)

## Required scripts and gates

- `dev`
- `build`
- `typecheck`
- `lint`
- `format:check`
- `test`
- `test:contract`
- `security:audit`
- `boundaries`
- secret scan and production env validation

## Boundary rules

- Domain/core code cannot import adapters, infra, vendor SDKs, ORM rows, or UI.
- Cross-service payloads must come from `domain-contracts`; no handwritten duplicate DTOs.
- Production config fails closed on missing secrets or missing required provider credentials.
- Contract fixtures must exist for every event consumed or emitted by this repo.
