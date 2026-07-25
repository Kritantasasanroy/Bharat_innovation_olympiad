# Final PRD Distribution Matrix

Purpose: show which project owns each PRD and which projects are impacted by its contracts, data, UI, deployment, or operational behavior.

| PRD | Title | Phase | Primary project | Impacted projects | Cadence |
|---|---|---|---|---|---|
| [`PLAT-01`](PRD-PLAT-01-repo-scaffolding.md) | Repo Scaffolding | P0 Foundation | all four repos / foundation track | bio-portal, bio-admin, bio-exam, bio-proctor | foundation; applies to all deployment cadences |
| [`PLAT-02`](PRD-PLAT-02-shared-contracts-events.md) | Contracts & Events | P0 Foundation | all four repos / foundation track | bio-portal, bio-admin, bio-exam, bio-proctor | foundation; applies to all deployment cadences |
| [`PLAT-03`](PRD-PLAT-03-infrastructure.md) | Infrastructure | P0 Foundation | all four repos / foundation track | bio-portal, bio-admin, bio-exam, bio-proctor | foundation; applies to all deployment cadences |
| [`PLAT-04`](PRD-PLAT-04-observability-audit.md) | Observability & Audit | P0 Foundation | all four repos / foundation track | bio-portal, bio-admin, bio-exam, bio-proctor | foundation; applies to all deployment cadences |
| [`PLAT-05`](PRD-PLAT-05-security-baseline-threat-model.md) | Security Baseline | P0 Foundation | all four repos / foundation track | bio-portal, bio-admin, bio-exam, bio-proctor | foundation; applies to all deployment cadences |
| [`AUTH-01`](PRD-AUTH-01-mobile-otp-login.md) | Mobile OTP Login | P1 Identity/Auth | bio-portal | bio-exam, bio-admin | always-on |
| [`AUTH-02`](PRD-AUTH-02-registration-profile.md) | Registration Profile | P1 Identity/Auth | bio-portal | bio-admin, bio-exam | always-on |
| [`AUTH-03`](PRD-AUTH-03-dpdp-consent-retention.md) | DPDP Consent & Retention | P1 Identity/Auth | bio-portal | bio-admin, bio-exam, bio-proctor | always-on |
| [`AUTH-04`](PRD-AUTH-04-admin-auth-rbac.md) | Admin Auth & RBAC | P1 Identity/Auth | bio-admin | bio-proctor | admin/curation/results/ops; low baseline outside exams, scale for authoring/results/ops |
| [`AUTH-05`](PRD-AUTH-05-session-token-management.md) | Sessions & Tokens | P1 Identity/Auth | bio-portal + bio-admin | bio-exam, bio-proctor | shared identity/foundation cadence |
| [`ADMIN-01`](PRD-ADMIN-01-question-bank.md) | Question Bank | P2 Admin/Curator | bio-admin | — | admin/curation/results/ops; low baseline outside exams, scale for authoring/results/ops |
| [`ADMIN-02`](PRD-ADMIN-02-paper-builder.md) | Paper Builder | P2 Admin/Curator | bio-admin | bio-exam | admin/curation/results/ops; low baseline outside exams, scale for authoring/results/ops |
| [`ADMIN-03`](PRD-ADMIN-03-scheduling-slots-pricing.md) | Scheduling, Slots & Pricing Source | P2 Admin/Curator | bio-admin | bio-portal, bio-exam | admin/curation/results/ops; low baseline outside exams, scale for authoring/results/ops |
| [`ADMIN-04`](PRD-ADMIN-04-publishing-snapshots.md) | Publishing Snapshots | P2 Admin/Curator | bio-admin | bio-exam, bio-portal | admin/curation/results/ops; low baseline outside exams, scale for authoring/results/ops |
| [`ADMIN-05`](PRD-ADMIN-05-user-school-management.md) | User & School Management | P2 Admin/Curator | bio-admin | bio-portal | admin/curation/results/ops; low baseline outside exams, scale for authoring/results/ops |
| [`ADMIN-06`](PRD-ADMIN-06-dashboard-analytics.md) | Dashboard Analytics | P2 Admin/Ops | bio-admin | bio-portal, bio-exam, bio-proctor | admin/curation/results/ops; low baseline outside exams, scale for authoring/results/ops |
| [`PORTAL-01`](PRD-PORTAL-01-marketing-discovery.md) | Marketing Discovery | P3 Portal/Commerce | bio-portal | — | always-on |
| [`PORTAL-02`](PRD-PORTAL-02-slot-catalog.md) | Slot Catalog | P3 Portal/Commerce | bio-portal | bio-admin, bio-exam | always-on |
| [`PORTAL-03`](PRD-PORTAL-03-booking-seat-reservation.md) | Booking & Seat Holds | P3 Portal/Commerce | bio-portal | bio-admin, bio-exam | always-on |
| [`PORTAL-04`](PRD-PORTAL-04-razorpay-payments.md) | Razorpay Payments | P3 Portal/Commerce | bio-portal | bio-admin, bio-exam | always-on |
| [`PORTAL-05`](PRD-PORTAL-05-confirmation-admit-card-notifications.md) | Confirmation, Admit Card & Notifications | P3 Portal/Commerce | bio-portal | bio-admin, bio-exam | always-on |
| [`PORTAL-06`](PRD-PORTAL-06-refunds-cancellations.md) | Refunds & Cancellations | P3 Portal/Commerce | bio-portal | bio-admin, bio-exam | always-on |
| [`PORTAL-07`](PRD-PORTAL-07-registration-entitlement-sync.md) | Registration Entitlement Sync | P3 Portal/Commerce | bio-portal | bio-exam, bio-admin | always-on |
| [`PORTAL-08`](PRD-PORTAL-08-pricing-coupons.md) | Pricing & Coupons | P3 Portal/Commerce | bio-portal | bio-admin | always-on |
| [`EXAM-00`](PRD-EXAM-00-runtime-dashboard-handoff.md) | Runtime Dashboard Handoff | P4 Exam Runtime | bio-exam | bio-portal | exam-window runtime; spin up before check-in, scale down after submission/export gates |
| [`EXAM-01`](PRD-EXAM-01-device-identity-check.md) | Device & Identity Check | P4 Exam Runtime | bio-exam | bio-proctor, bio-portal | exam-window runtime; spin up before check-in, scale down after submission/export gates |
| [`EXAM-02`](PRD-EXAM-02-attempt-entitlement-gate.md) | Attempt Entitlement Gate | P4 Exam Runtime | bio-exam | bio-portal, bio-admin | exam-window runtime; spin up before check-in, scale down after submission/export gates |
| [`EXAM-03`](PRD-EXAM-03-player-autosave.md) | Player & Autosave | P4 Exam Runtime | bio-exam | bio-admin | exam-window runtime; spin up before check-in, scale down after submission/export gates |
| [`EXAM-04`](PRD-EXAM-04-durable-timer.md) | Durable Timer | P4 Exam Runtime | bio-exam | bio-admin | exam-window runtime; spin up before check-in, scale down after submission/export gates |
| [`EXAM-05`](PRD-EXAM-05-submission-post-exam.md) | Submission & Post-Exam | P4 Exam Runtime | bio-exam | bio-admin, bio-portal | exam-window runtime; spin up before check-in, scale down after submission/export gates |
| [`EXAM-06`](PRD-EXAM-06-seb-lockdown.md) | SEB Lockdown | P4 Exam Runtime | bio-exam | bio-admin, bio-portal | exam-window runtime; spin up before check-in, scale down after submission/export gates |
| [`SCORE-01`](PRD-SCORE-01-async-scoring.md) | Async Scoring | P5 Scoring/Results | bio-admin | bio-exam | admin/curation/results/ops; low baseline outside exams, scale for authoring/results/ops |
| [`SCORE-02`](PRD-SCORE-02-results-ranking-certificates.md) | Results, Ranking & Certificates | P5 Scoring/Results | bio-admin | bio-portal, bio-exam, bio-proctor | admin/curation/results/ops; low baseline outside exams, scale for authoring/results/ops |
| [`PROCTOR-01`](PRD-PROCTOR-01-face-enrollment.md) | Face Enrollment | P6 Proctoring | bio-proctor | bio-exam, bio-portal, bio-admin | exam-window + post-exam review/retention workers; scheduled deletion/DSR jobs may run outside windows |
| [`PROCTOR-02`](PRD-PROCTOR-02-frame-analysis-match.md) | Frame Analysis & Match | P6 Proctoring | bio-proctor | bio-exam, bio-admin | exam-window + post-exam review/retention workers; scheduled deletion/DSR jobs may run outside windows |
| [`PROCTOR-03`](PRD-PROCTOR-03-events-risk-integrity.md) | Events, Risk & Integrity | P6 Proctoring | bio-proctor | bio-exam, bio-admin | exam-window + post-exam review/retention workers; scheduled deletion/DSR jobs may run outside windows |
| [`PROCTOR-04`](PRD-PROCTOR-04-review-console.md) | Review Console | P6 Proctoring | bio-proctor | bio-admin, bio-exam, bio-portal | exam-window + post-exam review/retention workers; scheduled deletion/DSR jobs may run outside windows |
| [`PROCTOR-05`](PRD-PROCTOR-05-biometric-retention.md) | Biometric Retention | P6 Proctoring | bio-proctor | bio-portal, bio-admin | exam-window + post-exam review/retention workers; scheduled deletion/DSR jobs may run outside windows |
| [`OPS-01`](PRD-OPS-01-exam-day-ops-incident-response.md) | Exam-Day Ops & Incident Response | P7 Ops | bio-admin | bio-portal, bio-exam, bio-proctor | admin/curation/results/ops; low baseline outside exams, scale for authoring/results/ops |

## bio-portal

Always-on public/student portal: marketing, OTP login, profile/consent, slot discovery, booking, payments, refunds, admit cards, notifications, entitlement issuance, released-result display.

### Primary PRDs
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

### Impacted PRDs
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

## bio-admin

Trusted admin/curator/results/ops service: question bank, paper builder, scheduling source of truth, publishing, admin RBAC, analytics, scoring, result release, command center.

### Primary PRDs
- [`AUTH-04`](PRD-AUTH-04-admin-auth-rbac.md) — Admin Auth & RBAC
- [`AUTH-05`](PRD-AUTH-05-session-token-management.md) — Sessions & Tokens
- [`ADMIN-01`](PRD-ADMIN-01-question-bank.md) — Question Bank
- [`ADMIN-02`](PRD-ADMIN-02-paper-builder.md) — Paper Builder
- [`ADMIN-03`](PRD-ADMIN-03-scheduling-slots-pricing.md) — Scheduling, Slots & Pricing Source
- [`ADMIN-04`](PRD-ADMIN-04-publishing-snapshots.md) — Publishing Snapshots
- [`ADMIN-05`](PRD-ADMIN-05-user-school-management.md) — User & School Management
- [`ADMIN-06`](PRD-ADMIN-06-dashboard-analytics.md) — Dashboard Analytics
- [`SCORE-01`](PRD-SCORE-01-async-scoring.md) — Async Scoring
- [`SCORE-02`](PRD-SCORE-02-results-ranking-certificates.md) — Results, Ranking & Certificates
- [`OPS-01`](PRD-OPS-01-exam-day-ops-incident-response.md) — Exam-Day Ops & Incident Response

### Impacted PRDs
- [`PLAT-01`](PRD-PLAT-01-repo-scaffolding.md) — Repo Scaffolding (primary: all four repos / foundation track)
- [`PLAT-02`](PRD-PLAT-02-shared-contracts-events.md) — Contracts & Events (primary: all four repos / foundation track)
- [`PLAT-03`](PRD-PLAT-03-infrastructure.md) — Infrastructure (primary: all four repos / foundation track)
- [`PLAT-04`](PRD-PLAT-04-observability-audit.md) — Observability & Audit (primary: all four repos / foundation track)
- [`PLAT-05`](PRD-PLAT-05-security-baseline-threat-model.md) — Security Baseline (primary: all four repos / foundation track)
- [`AUTH-01`](PRD-AUTH-01-mobile-otp-login.md) — Mobile OTP Login (primary: bio-portal)
- [`AUTH-02`](PRD-AUTH-02-registration-profile.md) — Registration Profile (primary: bio-portal)
- [`AUTH-03`](PRD-AUTH-03-dpdp-consent-retention.md) — DPDP Consent & Retention (primary: bio-portal)
- [`PORTAL-02`](PRD-PORTAL-02-slot-catalog.md) — Slot Catalog (primary: bio-portal)
- [`PORTAL-03`](PRD-PORTAL-03-booking-seat-reservation.md) — Booking & Seat Holds (primary: bio-portal)
- [`PORTAL-04`](PRD-PORTAL-04-razorpay-payments.md) — Razorpay Payments (primary: bio-portal)
- [`PORTAL-05`](PRD-PORTAL-05-confirmation-admit-card-notifications.md) — Confirmation, Admit Card & Notifications (primary: bio-portal)
- [`PORTAL-06`](PRD-PORTAL-06-refunds-cancellations.md) — Refunds & Cancellations (primary: bio-portal)
- [`PORTAL-07`](PRD-PORTAL-07-registration-entitlement-sync.md) — Registration Entitlement Sync (primary: bio-portal)
- [`PORTAL-08`](PRD-PORTAL-08-pricing-coupons.md) — Pricing & Coupons (primary: bio-portal)
- [`EXAM-02`](PRD-EXAM-02-attempt-entitlement-gate.md) — Attempt Entitlement Gate (primary: bio-exam)
- [`EXAM-03`](PRD-EXAM-03-player-autosave.md) — Player & Autosave (primary: bio-exam)
- [`EXAM-04`](PRD-EXAM-04-durable-timer.md) — Durable Timer (primary: bio-exam)
- [`EXAM-05`](PRD-EXAM-05-submission-post-exam.md) — Submission & Post-Exam (primary: bio-exam)
- [`EXAM-06`](PRD-EXAM-06-seb-lockdown.md) — SEB Lockdown (primary: bio-exam)
- [`PROCTOR-01`](PRD-PROCTOR-01-face-enrollment.md) — Face Enrollment (primary: bio-proctor)
- [`PROCTOR-02`](PRD-PROCTOR-02-frame-analysis-match.md) — Frame Analysis & Match (primary: bio-proctor)
- [`PROCTOR-03`](PRD-PROCTOR-03-events-risk-integrity.md) — Events, Risk & Integrity (primary: bio-proctor)
- [`PROCTOR-04`](PRD-PROCTOR-04-review-console.md) — Review Console (primary: bio-proctor)
- [`PROCTOR-05`](PRD-PROCTOR-05-biometric-retention.md) — Biometric Retention (primary: bio-proctor)

## bio-exam

Exam-window runtime: readiness handoff, entitlement-gated attempt start, exam player, autosave, durable timer, submission, SEB/lockdown. No answer keys.

### Primary PRDs
- [`EXAM-00`](PRD-EXAM-00-runtime-dashboard-handoff.md) — Runtime Dashboard Handoff
- [`EXAM-01`](PRD-EXAM-01-device-identity-check.md) — Device & Identity Check
- [`EXAM-02`](PRD-EXAM-02-attempt-entitlement-gate.md) — Attempt Entitlement Gate
- [`EXAM-03`](PRD-EXAM-03-player-autosave.md) — Player & Autosave
- [`EXAM-04`](PRD-EXAM-04-durable-timer.md) — Durable Timer
- [`EXAM-05`](PRD-EXAM-05-submission-post-exam.md) — Submission & Post-Exam
- [`EXAM-06`](PRD-EXAM-06-seb-lockdown.md) — SEB Lockdown

### Impacted PRDs
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

## bio-proctor

Exam-window proctoring service: face enrollment, frame analysis, risk events, review workflow, biometric retention/deletion. Independent ML/runtime lifecycle.

### Primary PRDs
- [`PROCTOR-01`](PRD-PROCTOR-01-face-enrollment.md) — Face Enrollment
- [`PROCTOR-02`](PRD-PROCTOR-02-frame-analysis-match.md) — Frame Analysis & Match
- [`PROCTOR-03`](PRD-PROCTOR-03-events-risk-integrity.md) — Events, Risk & Integrity
- [`PROCTOR-04`](PRD-PROCTOR-04-review-console.md) — Review Console
- [`PROCTOR-05`](PRD-PROCTOR-05-biometric-retention.md) — Biometric Retention

### Impacted PRDs
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

