# Repo Scaffold — `bio-exam`

**Runtime cadence:** Exam-window; spin up/down around slots  
**Final source:** `ai/output/prds`.

## Purpose

Exam-window runtime: readiness handoff, entitlement-gated attempt start, exam player, autosave, durable timer, submission, SEB/lockdown. No answer keys.

## Suggested scaffold

### Apps
- exam-web

### Services / workers
- exam-api
- exam-ws or polling gateway
- exam-worker
- timer-worker
- snapshot-import-consumer
- entitlement-consumer

### Packages / shared local modules
- runtime domain
- contract clients
- SEB/readiness adapters
- observability/testkit

## Primary PRDs

- [`EXAM-00`](PRD-EXAM-00-runtime-dashboard-handoff.md) — Runtime Dashboard Handoff
- [`EXAM-01`](PRD-EXAM-01-device-identity-check.md) — Device & Identity Check
- [`EXAM-02`](PRD-EXAM-02-attempt-entitlement-gate.md) — Attempt Entitlement Gate
- [`EXAM-03`](PRD-EXAM-03-player-autosave.md) — Player & Autosave
- [`EXAM-04`](PRD-EXAM-04-durable-timer.md) — Durable Timer
- [`EXAM-05`](PRD-EXAM-05-submission-post-exam.md) — Submission & Post-Exam
- [`EXAM-06`](PRD-EXAM-06-seb-lockdown.md) — SEB Lockdown

## Impacted PRDs

- [`PLAT-01`](PRD-PLAT-01-repo-scaffolding.md) — Repo Scaffolding (primary: all four repos / foundation track)
- [`PLAT-02`](PRD-PLAT-02-shared-contracts-events.md) — Contracts & Events (primary: all four repos / foundation track)
- [`PLAT-03`](PRD-PLAT-03-infrastructure.md) — Infrastructure (primary: all four repos / foundation track)
- [`PLAT-04`](PRD-PLAT-04-observability-audit.md) — Observability & Audit (primary: all four repos / foundation track)
- [`PLAT-05`](PRD-PLAT-05-security-baseline-threat-model.md) — Security Baseline (primary: all four repos / foundation track)
- [`AUTH-01`](PRD-AUTH-01-mobile-otp-login.md) — Mobile OTP Login (primary: bio-portal)
- [`AUTH-02`](PRD-AUTH-02-registration-profile.md) — Registration Profile (primary: bio-portal)
- [`AUTH-03`](PRD-AUTH-03-dpdp-consent-retention.md) — DPDP Consent & Retention (primary: bio-portal)
- [`AUTH-05`](PRD-AUTH-05-session-token-management.md) — Sessions & Tokens (primary: bio-portal + bio-admin)
- [`ADMIN-02`](PRD-ADMIN-02-paper-builder.md) — Paper Builder (primary: bio-admin)
- [`ADMIN-03`](PRD-ADMIN-03-scheduling-slots-pricing.md) — Scheduling, Slots & Pricing Source (primary: bio-admin)
- [`ADMIN-04`](PRD-ADMIN-04-publishing-snapshots.md) — Publishing Snapshots (primary: bio-admin)
- [`ADMIN-06`](PRD-ADMIN-06-dashboard-analytics.md) — Dashboard Analytics (primary: bio-admin)
- [`PORTAL-02`](PRD-PORTAL-02-slot-catalog.md) — Slot Catalog (primary: bio-portal)
- [`PORTAL-03`](PRD-PORTAL-03-booking-seat-reservation.md) — Booking & Seat Holds (primary: bio-portal)
- [`PORTAL-04`](PRD-PORTAL-04-razorpay-payments.md) — Razorpay Payments (primary: bio-portal)
- [`PORTAL-05`](PRD-PORTAL-05-confirmation-admit-card-notifications.md) — Confirmation, Admit Card & Notifications (primary: bio-portal)
- [`PORTAL-06`](PRD-PORTAL-06-refunds-cancellations.md) — Refunds & Cancellations (primary: bio-portal)
- [`PORTAL-07`](PRD-PORTAL-07-registration-entitlement-sync.md) — Registration Entitlement Sync (primary: bio-portal)
- [`SCORE-01`](PRD-SCORE-01-async-scoring.md) — Async Scoring (primary: bio-admin)
- [`SCORE-02`](PRD-SCORE-02-results-ranking-certificates.md) — Results, Ranking & Certificates (primary: bio-admin)
- [`PROCTOR-01`](PRD-PROCTOR-01-face-enrollment.md) — Face Enrollment (primary: bio-proctor)
- [`PROCTOR-02`](PRD-PROCTOR-02-frame-analysis-match.md) — Frame Analysis & Match (primary: bio-proctor)
- [`PROCTOR-03`](PRD-PROCTOR-03-events-risk-integrity.md) — Events, Risk & Integrity (primary: bio-proctor)
- [`PROCTOR-04`](PRD-PROCTOR-04-review-console.md) — Review Console (primary: bio-proctor)
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
