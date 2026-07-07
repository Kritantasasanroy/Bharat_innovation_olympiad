# Repo Scaffold — `bio-portal`

**Runtime cadence:** Always-on  
**Final source:** `ai/output/prds`.

## Purpose

Always-on public/student portal: marketing, OTP login, profile/consent, slot discovery, booking, payments, refunds, admit cards, notifications, entitlement issuance, released-result display.

## Suggested scaffold

### Apps
- marketing-web (SEO/content)
- student-portal-web (login/catalog/booking/payment/my bookings/results)

### Services / workers
- portal-api or Next API routes
- commerce-worker
- notification-worker
- entitlement-outbox-consumer/producer

### Packages / shared local modules
- contracts client
- ui
- config
- observability
- testkit

## Primary PRDs

- [`AUTH-01`](PRD-AUTH-01-mobile-otp-login.md) — Mobile OTP Login
- [`AUTH-02`](PRD-AUTH-02-registration-profile.md) — Registration Profile
- [`AUTH-03`](PRD-AUTH-03-dpdp-consent-retention.md) — DPDP Consent & Retention
- [`AUTH-05`](PRD-AUTH-05-session-token-management.md) — Sessions & Tokens
- [`PORTAL-01`](PRD-PORTAL-01-marketing-discovery.md) — Marketing Discovery
- [`PORTAL-02`](PRD-PORTAL-02-slot-catalog.md) — Slot Catalog
- [`PORTAL-03`](PRD-PORTAL-03-booking-seat-reservation.md) — Booking & Seat Holds
- [`PORTAL-04`](PRD-PORTAL-04-razorpay-payments.md) — Razorpay Payments
- [`PORTAL-05`](PRD-PORTAL-05-confirmation-admit-card-notifications.md) — Confirmation, Admit Card & Notifications
- [`PORTAL-06`](PRD-PORTAL-06-refunds-cancellations.md) — Refunds & Cancellations
- [`PORTAL-07`](PRD-PORTAL-07-registration-entitlement-sync.md) — Registration Entitlement Sync
- [`PORTAL-08`](PRD-PORTAL-08-pricing-coupons.md) — Pricing & Coupons

## Impacted PRDs

- [`PLAT-01`](PRD-PLAT-01-repo-scaffolding.md) — Repo Scaffolding (primary: all four repos / foundation track)
- [`PLAT-02`](PRD-PLAT-02-shared-contracts-events.md) — Contracts & Events (primary: all four repos / foundation track)
- [`PLAT-03`](PRD-PLAT-03-infrastructure.md) — Infrastructure (primary: all four repos / foundation track)
- [`PLAT-04`](PRD-PLAT-04-observability-audit.md) — Observability & Audit (primary: all four repos / foundation track)
- [`PLAT-05`](PRD-PLAT-05-security-baseline-threat-model.md) — Security Baseline (primary: all four repos / foundation track)
- [`ADMIN-03`](PRD-ADMIN-03-scheduling-slots-pricing.md) — Scheduling, Slots & Pricing Source (primary: bio-admin)
- [`ADMIN-04`](PRD-ADMIN-04-publishing-snapshots.md) — Publishing Snapshots (primary: bio-admin)
- [`ADMIN-05`](PRD-ADMIN-05-user-school-management.md) — User & School Management (primary: bio-admin)
- [`ADMIN-06`](PRD-ADMIN-06-dashboard-analytics.md) — Dashboard Analytics (primary: bio-admin)
- [`EXAM-00`](PRD-EXAM-00-runtime-dashboard-handoff.md) — Runtime Dashboard Handoff (primary: bio-exam)
- [`EXAM-01`](PRD-EXAM-01-device-identity-check.md) — Device & Identity Check (primary: bio-exam)
- [`EXAM-02`](PRD-EXAM-02-attempt-entitlement-gate.md) — Attempt Entitlement Gate (primary: bio-exam)
- [`EXAM-05`](PRD-EXAM-05-submission-post-exam.md) — Submission & Post-Exam (primary: bio-exam)
- [`EXAM-06`](PRD-EXAM-06-seb-lockdown.md) — SEB Lockdown (primary: bio-exam)
- [`SCORE-02`](PRD-SCORE-02-results-ranking-certificates.md) — Results, Ranking & Certificates (primary: bio-admin)
- [`PROCTOR-01`](PRD-PROCTOR-01-face-enrollment.md) — Face Enrollment (primary: bio-proctor)
- [`PROCTOR-04`](PRD-PROCTOR-04-review-console.md) — Review Console (primary: bio-proctor)
- [`PROCTOR-05`](PRD-PROCTOR-05-biometric-retention.md) — Biometric Retention (primary: bio-proctor)
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
