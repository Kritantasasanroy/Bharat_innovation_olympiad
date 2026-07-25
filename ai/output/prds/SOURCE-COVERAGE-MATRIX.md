# Final Source Coverage Matrix

Purpose: prove every final golden PRD maps back to prior source packs while applying the final `bio-admin` / `bio-exam` split.

Historical inputs consolidated into this golden set and removed from the working tree:

- `docs/prd/`
- `docs/prds/`
- `docs/all-prds-re-arch/`
- `docs/all-prds-re-arch-pass-2/`

Use git history for source-pack provenance; use this directory for implementation.

| Final PRD | Title | Final primary project | Source union |
|---|---|---|---|
| [`PLAT-01`](PRD-PLAT-01-repo-scaffolding.md) | Repo Scaffolding | all four repos / foundation track | docs/prd/PRD-PLAT-01-repo-scaffolding.md + docs/prds/phase-0-foundation/PRD-00-platform-foundation.md |
| [`PLAT-02`](PRD-PLAT-02-shared-contracts-events.md) | Contracts & Events | all four repos / foundation track | docs/prd/PRD-PLAT-02-shared-packages.md + docs/prds/phase-0-foundation/PRD-01-shared-contracts-events.md |
| [`PLAT-03`](PRD-PLAT-03-infrastructure.md) | Infrastructure | all four repos / foundation track | docs/prd/PRD-PLAT-03-infrastructure.md + docs/prds/phase-0-foundation/PRD-00-platform-foundation.md (infra / env / config / secrets / CI portions) |
| [`PLAT-04`](PRD-PLAT-04-observability-audit.md) | Observability & Audit | all four repos / foundation track | docs/prd/PRD-PLAT-04-observability-audit.md + docs/prds/phase-5-scale-compliance/PRD-22-analytics-dashboards.md (observability / read-model parts) + docs/prds/phase-5-scale-compliance/PRD-24-exam-day-ops-incident-response.md (telemetry parts) |
| [`PLAT-05`](PRD-PLAT-05-security-baseline-threat-model.md) | Security Baseline | all four repos / foundation track | docs/prds/phase-0-foundation/PRD-02-identity-security-baseline.md (security-baseline + policy-interface + threat-model portions) + docs/prd/PRD-AUTH-05-session-token-management.md (security invariants only, cross-ref) |
| [`AUTH-01`](PRD-AUTH-01-mobile-otp-login.md) | Mobile OTP Login | bio-portal | docs/prd/PRD-AUTH-01-mobile-otp-login.md + docs/prds/phase-1-growth-commerce/PRD-04-student-mobile-otp-msg91.md |
| [`AUTH-02`](PRD-AUTH-02-registration-profile.md) | Registration Profile | bio-portal | docs/prd/PRD-AUTH-02-registration-profile.md + docs/prds/phase-1-growth-commerce/PRD-05-student-profile-consent-eligibility.md |
| [`AUTH-03`](PRD-AUTH-03-dpdp-consent-retention.md) | DPDP Consent & Retention | bio-portal | docs/prd/PRD-AUTH-03-dpdp-consent-retention.md + docs/prds/phase-1-growth-commerce/PRD-05-student-profile-consent-eligibility.md (consent parts) + docs/prds/phase-5-scale-compliance/PRD-23-privacy-consent-retention.md |
| [`AUTH-04`](PRD-AUTH-04-admin-auth-rbac.md) | Admin Auth & RBAC | bio-admin | docs/prd/PRD-AUTH-04-admin-auth-rbac.md + docs/prds/phase-2-admin-ops/PRD-09-admin-auth-rbac-audit.md + docs/prds/phase-0-foundation/PRD-02-identity-security-baseline.md (admin-identity parts) |
| [`AUTH-05`](PRD-AUTH-05-session-token-management.md) | Sessions & Tokens | bio-portal + bio-admin | docs/prd/PRD-AUTH-05-session-token-management.md + docs/prds/phase-0-foundation/PRD-02-identity-security-baseline.md (session parts) |
| [`ADMIN-01`](PRD-ADMIN-01-question-bank.md) | Question Bank | bio-admin | docs/prd/PRD-ADMIN-01-question-bank.md + docs/prds/phase-2-admin-ops/PRD-10-question-bank-imports.md |
| [`ADMIN-02`](PRD-ADMIN-02-paper-builder.md) | Paper Builder | bio-admin | docs/prd/PRD-ADMIN-02-paper-builder.md + docs/prds/phase-2-admin-ops/PRD-11-paper-builder-review.md |
| [`ADMIN-03`](PRD-ADMIN-03-scheduling-slots-pricing.md) | Scheduling, Slots & Pricing Source | bio-admin | docs/prd/PRD-ADMIN-03-scheduling-slots-pricing.md + docs/prds/phase-2-admin-ops/PRD-12-admin-slot-schedule-management.md |
| [`ADMIN-04`](PRD-ADMIN-04-publishing-snapshots.md) | Publishing Snapshots | bio-admin | docs/prd/PRD-ADMIN-04-publishing.md + docs/prds/phase-2-admin-ops/PRD-13-publish-exam-snapshots.md |
| [`ADMIN-05`](PRD-ADMIN-05-user-school-management.md) | User & School Management | bio-admin | docs/prd/PRD-ADMIN-05-user-school-management.md + (theirs has **no standalone equivalent**; school/user-admin bits pulled from docs/prds/phase-2-admin-ops/PRD-09-admin-auth-rbac-audit.md and docs/prds/phase-1-growth-commerce/PRD-05-student-profile-consent-eligibility.md) |
| [`ADMIN-06`](PRD-ADMIN-06-dashboard-analytics.md) | Dashboard Analytics | bio-admin | docs/prd/PRD-ADMIN-06-dashboard-analytics.md + docs/prds/phase-5-scale-compliance/PRD-22-analytics-dashboards.md |
| [`PORTAL-01`](PRD-PORTAL-01-marketing-discovery.md) | Marketing Discovery | bio-portal | docs/prd/PRD-PORTAL-01-marketing-content.md + docs/prds/phase-1-growth-commerce/PRD-03-marketing-site-exam-discovery.md |
| [`PORTAL-02`](PRD-PORTAL-02-slot-catalog.md) | Slot Catalog | bio-portal | docs/prd/PRD-PORTAL-02-slot-catalog.md + docs/prds/phase-1-growth-commerce/PRD-06-exam-slot-seat-reservations.md (discovery/availability portion) |
| [`PORTAL-03`](PRD-PORTAL-03-booking-seat-reservation.md) | Booking & Seat Holds | bio-portal | docs/prd/PRD-PORTAL-03-booking-seat-reservation.md + docs/prds/phase-1-growth-commerce/PRD-06-exam-slot-seat-reservations.md (reservation/hold portion) |
| [`PORTAL-04`](PRD-PORTAL-04-razorpay-payments.md) | Razorpay Payments | bio-portal | docs/prd/PRD-PORTAL-04-razorpay-payments.md + docs/prds/phase-1-growth-commerce/PRD-07-razorpay-payments.md |
| [`PORTAL-05`](PRD-PORTAL-05-confirmation-admit-card-notifications.md) | Confirmation, Admit Card & Notifications | bio-portal | docs/prd/PRD-PORTAL-05-booking-lifecycle-notifications.md + docs/prds/phase-1-growth-commerce/PRD-08-confirmation-admit-card-notifications.md |
| [`PORTAL-06`](PRD-PORTAL-06-refunds-cancellations.md) | Refunds & Cancellations | bio-portal | docs/prd/PRD-PORTAL-06-refunds-cancellations.md + docs/prds/phase-1-growth-commerce/PRD-07-razorpay-payments.md (refunds portion) |
| [`PORTAL-07`](PRD-PORTAL-07-registration-entitlement-sync.md) | Registration Entitlement Sync | bio-portal | docs/prd/PRD-PORTAL-07-entitlement-sync.md + docs/prds/phase-1-growth-commerce/PRD-08-confirmation-admit-card-notifications.md (RegistrationConfirmed payload) + docs/prds/phase-3-exam-runtime/PRD-14-student-exam-dashboard-handoff.md (consume contract only, for the seam) |
| [`PORTAL-08`](PRD-PORTAL-08-pricing-coupons.md) | Pricing & Coupons | bio-portal | docs/prd/PRD-PORTAL-08-pricing-coupons.md (theirs folds pricing into PRD-06/07; pricing/discount bits pulled in — see §10) |
| [`EXAM-00`](PRD-EXAM-00-runtime-dashboard-handoff.md) | Runtime Dashboard Handoff | bio-exam | docs/prds/phase-3-exam-runtime/PRD-14-student-exam-dashboard-handoff.md (PRIMARY) + docs/prd/PRD-PORTAL-07-entitlement-sync.md (consume side) + docs/prd/PRD-EXAM-02-attempt-entitlement-gate.md (gate cross-ref) |
| [`EXAM-01`](PRD-EXAM-01-device-identity-check.md) | Device & Identity Check | bio-exam | docs/prd/PRD-EXAM-01-device-identity-check.md + docs/prds/phase-3-exam-runtime/PRD-15-seb-device-readiness.md (device/readiness portion) |
| [`EXAM-02`](PRD-EXAM-02-attempt-entitlement-gate.md) | Attempt Entitlement Gate | bio-exam | docs/prd/PRD-EXAM-02-attempt-entitlement-gate.md + docs/prds/phase-3-exam-runtime/PRD-16-attempt-timer-autosubmit.md (lifecycle portion) + docs/prds/phase-3-exam-runtime/PRD-14-student-exam-dashboard-handoff.md (gate) |
| [`EXAM-03`](PRD-EXAM-03-player-autosave.md) | Player & Autosave | bio-exam | docs/prd/PRD-EXAM-03-player-autosave.md + docs/prds/phase-3-exam-runtime/PRD-17-exam-player-answer-autosave.md |
| [`EXAM-04`](PRD-EXAM-04-durable-timer.md) | Durable Timer | bio-exam | docs/prd/PRD-EXAM-04-durable-timer.md + docs/prds/phase-3-exam-runtime/PRD-16-attempt-timer-autosubmit.md (timer/auto-submit portion) |
| [`EXAM-05`](PRD-EXAM-05-submission-post-exam.md) | Submission & Post-Exam | bio-exam | docs/prd/PRD-EXAM-05-submission-post-exam.md + docs/prds/phase-3-exam-runtime/PRD-16-attempt-timer-autosubmit.md (submit portion) + docs/prds/phase-3-exam-runtime/PRD-17-exam-player-answer-autosave.md (submit portion) |
| [`EXAM-06`](PRD-EXAM-06-seb-lockdown.md) | SEB Lockdown | bio-exam | docs/prd/PRD-EXAM-06-seb-lockdown.md + docs/prds/phase-3-exam-runtime/PRD-15-seb-device-readiness.md (SEB portion) |
| [`SCORE-01`](PRD-SCORE-01-async-scoring.md) | Async Scoring | bio-admin | docs/prd/PRD-SCORE-01-async-scoring.md + docs/prds/phase-3-exam-runtime/PRD-18-scoring-result-release.md (scoring-engine half) |
| [`SCORE-02`](PRD-SCORE-02-results-ranking-certificates.md) | Results, Ranking & Certificates | bio-admin | docs/prd/PRD-SCORE-02-results-ranking-certificates.md + docs/prds/phase-3-exam-runtime/PRD-18-scoring-result-release.md (result-release half) |
| [`PROCTOR-01`](PRD-PROCTOR-01-face-enrollment.md) | Face Enrollment | bio-proctor | docs/prd/PRD-PROCTOR-01-face-enrollment.md + docs/prds/phase-4-proctoring/PRD-19-face-enrollment.md |
| [`PROCTOR-02`](PRD-PROCTOR-02-frame-analysis-match.md) | Frame Analysis & Match | bio-proctor | docs/prd/PRD-PROCTOR-02-frame-analysis-match.md + docs/prds/phase-4-proctoring/PRD-20-frame-analysis-risk-events.md (frame ingestion / model analysis portion; events & risk-scoring portion → PROCTOR-03) |
| [`PROCTOR-03`](PRD-PROCTOR-03-events-risk-integrity.md) | Events, Risk & Integrity | bio-proctor | docs/prd/PRD-PROCTOR-03-events-risk-integrity.md + docs/prds/phase-4-proctoring/PRD-20-frame-analysis-risk-events.md (events & risk-scoring portion; frame analysis/match portion → PROCTOR-02) |
| [`PROCTOR-04`](PRD-PROCTOR-04-review-console.md) | Review Console | bio-proctor | docs/prd/PRD-PROCTOR-04-review-console.md + docs/prds/phase-4-proctoring/PRD-21-proctor-review-console.md |
| [`PROCTOR-05`](PRD-PROCTOR-05-biometric-retention.md) | Biometric Retention | bio-proctor | docs/prd/PRD-PROCTOR-05-biometric-retention.md + docs/prds/phase-5-scale-compliance/PRD-23-privacy-consent-retention.md (biometric embeddings + flagged-frames + retention-job + data-request portion; non-biometric categories owned by AUTH-03/PRD-23) |
| [`OPS-01`](PRD-OPS-01-exam-day-ops-incident-response.md) | Exam-Day Ops & Incident Response | bio-admin | docs/prds/phase-5-scale-compliance/PRD-24-exam-day-ops-incident-response.md (+ cross-cutting ops notes from docs/prd/: PLAT-04, ADMIN-06, EXAM-03/04, PORTAL-04/07, AUTH-01, ADMIN-04) |

## Coverage check

- Final PRD count: **39** feature/platform PRDs.
- Repo scaffold summaries added: **4** (`bio-portal`, `bio-admin`, `bio-exam`, `bio-proctor`).
- Pass-2 `bio-core` ownership split:
  - Admin/authoring/scheduling/scoring/results/ops → `bio-admin`.
  - Attempt/runtime/timer/submission/SEB → `bio-exam`.
  - Shared contracts/auth-kit/UI/test fixtures → foundation track consumed by all four repos.
