# bio-po AI PRD context

Generated: 2026-06-12

Source role: canonical golden PRD source for BIO.

## Selection rules

- Use `ai/output/prds` for all BIO PRD planning and implementation.
- Historical PRD draft/source packs were consolidated here and removed from the working tree.
- Service repos carry copied subsets in the same `ai/output/prds` layout.
- Use git history for source-pack provenance; do not recreate legacy PRD directories.

## Counts

| Category | Files |
| --- | ---: |
| Context docs | 6 |
| Scaffold docs | 4 |
| Golden PRDs | 39 |
| **Total golden source files** | **49** |

## Golden PRDs

| PRD | Title | Phase | Primary project | Impacted projects |
| --- | --- | --- | --- | --- |
| [`PLAT-01`](PRD-PLAT-01-repo-scaffolding.md) | Repo Scaffolding | P0 Foundation | all four repos / foundation track | bio-portal, bio-admin, bio-exam, bio-proctor |
| [`PLAT-02`](PRD-PLAT-02-shared-contracts-events.md) | Contracts & Events | P0 Foundation | all four repos / foundation track | bio-portal, bio-admin, bio-exam, bio-proctor |
| [`PLAT-03`](PRD-PLAT-03-infrastructure.md) | Infrastructure | P0 Foundation | all four repos / foundation track | bio-portal, bio-admin, bio-exam, bio-proctor |
| [`PLAT-04`](PRD-PLAT-04-observability-audit.md) | Observability & Audit | P0 Foundation | all four repos / foundation track | bio-portal, bio-admin, bio-exam, bio-proctor |
| [`PLAT-05`](PRD-PLAT-05-security-baseline-threat-model.md) | Security Baseline | P0 Foundation | all four repos / foundation track | bio-portal, bio-admin, bio-exam, bio-proctor |
| [`AUTH-01`](PRD-AUTH-01-mobile-otp-login.md) | Mobile OTP Login | P1 Identity/Auth | bio-portal | bio-exam, bio-admin |
| [`AUTH-02`](PRD-AUTH-02-registration-profile.md) | Registration Profile | P1 Identity/Auth | bio-portal | bio-admin, bio-exam |
| [`AUTH-03`](PRD-AUTH-03-dpdp-consent-retention.md) | DPDP Consent & Retention | P1 Identity/Auth | bio-portal | bio-admin, bio-exam, bio-proctor |
| [`AUTH-04`](PRD-AUTH-04-admin-auth-rbac.md) | Admin Auth & RBAC | P1 Identity/Auth | bio-admin | bio-proctor |
| [`AUTH-05`](PRD-AUTH-05-session-token-management.md) | Sessions & Tokens | P1 Identity/Auth | bio-portal + bio-admin | bio-exam, bio-proctor |
| [`ADMIN-01`](PRD-ADMIN-01-question-bank.md) | Question Bank | P2 Admin/Curator | bio-admin | — |
| [`ADMIN-02`](PRD-ADMIN-02-paper-builder.md) | Paper Builder | P2 Admin/Curator | bio-admin | bio-exam |
| [`ADMIN-03`](PRD-ADMIN-03-scheduling-slots-pricing.md) | Scheduling, Slots & Pricing Source | P2 Admin/Curator | bio-admin | bio-portal, bio-exam |
| [`ADMIN-04`](PRD-ADMIN-04-publishing-snapshots.md) | Publishing Snapshots | P2 Admin/Curator | bio-admin | bio-exam, bio-portal |
| [`ADMIN-05`](PRD-ADMIN-05-user-school-management.md) | User & School Management | P2 Admin/Curator | bio-admin | bio-portal |
| [`ADMIN-06`](PRD-ADMIN-06-dashboard-analytics.md) | Dashboard Analytics | P2 Admin/Ops | bio-admin | bio-portal, bio-exam, bio-proctor |
| [`PORTAL-01`](PRD-PORTAL-01-marketing-discovery.md) | Marketing Discovery | P3 Portal/Commerce | bio-portal | — |
| [`PORTAL-02`](PRD-PORTAL-02-slot-catalog.md) | Slot Catalog | P3 Portal/Commerce | bio-portal | bio-admin, bio-exam |
| [`PORTAL-03`](PRD-PORTAL-03-booking-seat-reservation.md) | Booking & Seat Holds | P3 Portal/Commerce | bio-portal | bio-admin, bio-exam |
| [`PORTAL-04`](PRD-PORTAL-04-razorpay-payments.md) | Razorpay Payments | P3 Portal/Commerce | bio-portal | bio-admin, bio-exam |
| [`PORTAL-05`](PRD-PORTAL-05-confirmation-admit-card-notifications.md) | Confirmation, Admit Card & Notifications | P3 Portal/Commerce | bio-portal | bio-admin, bio-exam |
| [`PORTAL-06`](PRD-PORTAL-06-refunds-cancellations.md) | Refunds & Cancellations | P3 Portal/Commerce | bio-portal | bio-admin, bio-exam |
| [`PORTAL-07`](PRD-PORTAL-07-registration-entitlement-sync.md) | Registration Entitlement Sync | P3 Portal/Commerce | bio-portal | bio-exam, bio-admin |
| [`PORTAL-08`](PRD-PORTAL-08-pricing-coupons.md) | Pricing & Coupons | P3 Portal/Commerce | bio-portal | bio-admin |
| [`EXAM-00`](PRD-EXAM-00-runtime-dashboard-handoff.md) | Runtime Dashboard Handoff | P4 Exam Runtime | bio-exam | bio-portal |
| [`EXAM-01`](PRD-EXAM-01-device-identity-check.md) | Device & Identity Check | P4 Exam Runtime | bio-exam | bio-proctor, bio-portal |
| [`EXAM-02`](PRD-EXAM-02-attempt-entitlement-gate.md) | Attempt Entitlement Gate | P4 Exam Runtime | bio-exam | bio-portal, bio-admin |
| [`EXAM-03`](PRD-EXAM-03-player-autosave.md) | Player & Autosave | P4 Exam Runtime | bio-exam | bio-admin |
| [`EXAM-04`](PRD-EXAM-04-durable-timer.md) | Durable Timer | P4 Exam Runtime | bio-exam | bio-admin |
| [`EXAM-05`](PRD-EXAM-05-submission-post-exam.md) | Submission & Post-Exam | P4 Exam Runtime | bio-exam | bio-admin, bio-portal |
| [`EXAM-06`](PRD-EXAM-06-seb-lockdown.md) | SEB Lockdown | P4 Exam Runtime | bio-exam | bio-admin, bio-portal |
| [`SCORE-01`](PRD-SCORE-01-async-scoring.md) | Async Scoring | P5 Scoring/Results | bio-admin | bio-exam |
| [`SCORE-02`](PRD-SCORE-02-results-ranking-certificates.md) | Results, Ranking & Certificates | P5 Scoring/Results | bio-admin | bio-portal, bio-exam, bio-proctor |
| [`PROCTOR-01`](PRD-PROCTOR-01-face-enrollment.md) | Face Enrollment | P6 Proctoring | bio-proctor | bio-exam, bio-portal, bio-admin |
| [`PROCTOR-02`](PRD-PROCTOR-02-frame-analysis-match.md) | Frame Analysis & Match | P6 Proctoring | bio-proctor | bio-exam, bio-admin |
| [`PROCTOR-03`](PRD-PROCTOR-03-events-risk-integrity.md) | Events, Risk & Integrity | P6 Proctoring | bio-proctor | bio-exam, bio-admin |
| [`PROCTOR-04`](PRD-PROCTOR-04-review-console.md) | Review Console | P6 Proctoring | bio-proctor | bio-admin, bio-exam, bio-portal |
| [`PROCTOR-05`](PRD-PROCTOR-05-biometric-retention.md) | Biometric Retention | P6 Proctoring | bio-proctor | bio-portal, bio-admin |
| [`OPS-01`](PRD-OPS-01-exam-day-ops-incident-response.md) | Exam-Day Ops & Incident Response | P7 Ops | bio-admin | bio-portal, bio-exam, bio-proctor |

## Companion artifacts

| File | Purpose |
| --- | --- |
| [`README.md`](README.md) | Golden PRD navigation/context |
| [`PRD-DISTRIBUTION-MATRIX.md`](PRD-DISTRIBUTION-MATRIX.md) | Golden PRD navigation/context |
| [`SOURCE-COVERAGE-MATRIX.md`](SOURCE-COVERAGE-MATRIX.md) | Golden PRD navigation/context |
| [`FINAL-MERMAID-MAP.md`](FINAL-MERMAID-MAP.md) | Golden PRD navigation/context |
| [`EXECUTION-SEQUENCE-STATUS.md`](EXECUTION-SEQUENCE-STATUS.md) | Golden PRD navigation/context |
| [`_final-prd-map.json`](_final-prd-map.json) | Golden PRD navigation/context |
| [`REPO-SCAFFOLD-bio-portal.md`](REPO-SCAFFOLD-bio-portal.md) | Repo scaffold summary |
| [`REPO-SCAFFOLD-bio-admin.md`](REPO-SCAFFOLD-bio-admin.md) | Repo scaffold summary |
| [`REPO-SCAFFOLD-bio-exam.md`](REPO-SCAFFOLD-bio-exam.md) | Repo scaffold summary |
| [`REPO-SCAFFOLD-bio-proctor.md`](REPO-SCAFFOLD-bio-proctor.md) | Repo scaffold summary |

## Verification

```zsh
test -f ai/output/prds/INDEX.md && test -f ai/output/prds/manifest.json
test $(find ai/output/prds -maxdepth 1 -type f -name 'PRD-*.md' ! -name 'PRD-DISTRIBUTION-MATRIX.md' | wc -l | tr -d ' ') = 39
jq -e '.repo == "bio-po" and .counts.goldenPrd == 39' ai/output/prds/manifest.json
```
