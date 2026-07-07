# PRD-AUTH-03: DPDP Parental Consent, Retention & Data Requests

- **Final primary project:** bio-portal | **Impacted projects:** bio-admin, bio-exam, bio-proctor | **Phase:** P1 Identity/Auth | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-AUTH-03-dpdp-consent-retention.md + docs/prds/phase-1-growth-commerce/PRD-05-student-profile-consent-eligibility.md (consent parts) + docs/prds/phase-5-scale-compliance/PRD-23-privacy-consent-retention.md

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-portal
- **Impacted projects:** bio-admin, bio-exam, bio-proctor
- **Deploy cadence:** always-on
- **Final boundary note:** Portal captures student/guardian consent; proctor and admin enforce biometric/data-retention obligations.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
The platform processes **minors' PII and biometrics** (mobile, school/class, payments, attempts, results, webcam-derived proctor events, **face embeddings**) under India's **DPDP Act 2023**, which requires **verifiable parental consent** for minors and enforced retention. The prior build shipped no consent capture and no retention deletion (silent gap). **Goal:** capture verifiable parent-OTP consent before any minor data/biometric processing; store versioned, immutable consent records; enforce retention/deletion automatically per data category with proof-of-deletion; and provide data-subject request (DSR) workflows. **This is a launch blocker** before broad public scale. Biometric capture/retention specifics live in **PROCTOR-05** (cross-referenced here).

## 2. Users & Personas
- **Parent/Guardian** — grants/withdraws verifiable consent (parent OTP).
- **Student (minor)** — data subject.
- **DPO / Compliance owner / Admin** — oversight, consent records, DSR intake/processing, sensitive-access audit.
- **Platform/workers** — scheduled retention deletion/anonymization jobs.

## 3. User Stories
- As a parent, I review what data is collected (incl. webcam/biometric for proctoring) and grant consent via a **parent OTP** before my child can book/test.
- As a parent, I can **withdraw** consent and request data deletion, and I'm told the impact on exam eligibility/refund.
- As the DPO, I can produce a consent record on demand and honor erasure within the mandated window.
- As the DPO/admin, I can move a data request through intake → processing → completed/rejected (with reason) and export data across repos.
- As the platform, biometric embeddings and other expired data auto-delete/anonymize on the retention schedule and log completion.

## 4. Functional Requirements
- **FR-1 — Verifiable parental consent (minors):** purpose-specific consent screen (account/registration, **payment**, **webcam/proctoring** if exam requires, **face enrollment** if required, result processing, communications, support/grievance) → **parent-OTP** confirmation → immutable `ConsentRecord` `{ version, purposes[], timestamp, parentContact, method=PARENT_OTP, IP, userAgent }`. Plain-language, **Hindi/English** copy with support link.
- **FR-2 — Consent gating:** minor account reaches `ACTIVE` (AUTH-02) **only after** consent; **booking/payment blocked without current consent versions**; **biometric/face enrollment (PROCTOR-01/05) blocked without explicit biometric/proctoring consent**; proctored-exam readiness blocked without proctoring consent.
- **FR-3 — Notice & consent versioning:** store versions of **privacy notice**, **proctoring notice**, and **refund/cancellation policy**; link the accepted version to student/registration; **re-consent on policy change**.
- **FR-4 — Consent records:** capture timestamp, IP, user agent, notice version, consent type/purposes, parent contact, method; immutable + exportable; partial consent supported (e.g. account yes, biometric no).
- **FR-5 — Retention policies (per category):** define retention + scheduled **deletion/anonymization** jobs (BullMQ) for: **OTP logs/challenges**, **student profile/identity**, **payment records**, **attempt answers/results**, **proctor embeddings** (e.g. **≤30 days post-exam** — authoritative detail in PROCTOR-05), **flagged frames** (if enabled), **audit logs**, **support tickets**. Jobs must delete/anonymize expired data, be **idempotent**, and **log completion (proof-of-deletion)** — **no silent skip**; failure → retry + alert.
- **FR-6 — Data-subject requests (DSR):** student/guardian request **access / correction / withdrawal / erasure** via support flow; admin console tracks request status `intake → processing → completed | rejected (reason)`; export compiles data across repos/services; deletion **respects legal/financial/exam-integrity retention constraints**.
- **FR-7 — Withdrawal handling:** withdraw consent → suspend processing + schedule erasure (subject to retention constraints) + record proof; explain impact on eligibility/refund.
- **FR-8 — Sensitive-access audit:** audit **reads** of answer keys, proctor reports/images, payment/refund details, student PII exports, and DSR exports (PLAT-04). Consent + retention + DSR events audited.
- **FR-9 — Event emission:** on captured/verified consent, record **`GuardianConsentCaptured`** in `bio-portal` and emit consent-status copies to `bio-admin`, `bio-exam`, and `bio-proctor` where enforcement requires it: `{ studentId, purposes[], policyVersion, method=PARENT_OTP, grantedAt }`.
- **FR-10 — CERT-In / incident posture:** maintain a retention posture compatible with CERT-In/incident-response data requirements (coordinated with OPS-01).

## 5. Non-Functional (perf, security, scale, DPDP)
- Consent records **immutable, versioned, exportable**. Deletion jobs **idempotent + verifiable** (proof-of-deletion), monitored (success/failure metric). **India data residency.** Plain-language, **localized** consent copy. Sensitive-access audit is append-only. PII/OTP/biometric redaction in logs (PLAT-05). DSR exports themselves audited and access-controlled.

## 6. Flows, States & Edge Cases
- **Consent flow:** Register(minor) → consent screen → parent OTP → `ConsentRecord` → account `ACTIVE`.
- **Withdrawal:** withdraw → suspend processing + schedule erasure (honoring retention holds) → proof recorded → eligibility/refund impact shown.
- **DSR:** request → intake → processing → completed | rejected(reason); export across repos.
- **Edges:** consent OTP sent to a **different parent number** than registration (allowed, recorded); **partial consent** (account yes, biometric no → can book non-proctored, but proctoring requires biometric → blocked/guided); policy version bump → forced re-consent before next sensitive action; **retention job failure → retry + alert (never silent skip)** — closes the prior build's gap; erasure conflicts with legal/financial/exam-integrity hold → deletion deferred/partial with documented reason; adult (non-minor) → privacy-notice acknowledgment path instead of parent-OTP.

## 7. Data Model & Contracts (entities, named events, APIs)
- **Entities:**
  - `ConsentRecord { id, userId, parentContact, purposes[], policyVersion, method=PARENT_OTP, grantedAt, withdrawnAt?, ip, userAgent }`
  - `NoticeVersion { id, type: PRIVACY|PROCTORING|REFUND, version, effectiveAt, body }`
  - `RetentionPolicy { dataCategory, retentionPeriod, action: DELETE|ANONYMIZE, legalHold? }`
  - `RetentionJobRun { id, dataCategory, scannedCount, deletedCount, status, completedAt, error? }` (proof-of-deletion)
  - `ErasureRequest / DataRequest { id, subjectUserId, type: ACCESS|CORRECTION|WITHDRAWAL|ERASURE, status: INTAKE|PROCESSING|COMPLETED|REJECTED, reason?, exportRef?, createdAt }`
  - `SensitiveAccessLog { id, actorId, resourceType, resourceId, action=READ, at }`
- **Data categories (retention scope):** Identity (name, mobile, email, school, class, city/state) · Guardian (name/mobile/consent) · Commerce (reservations, payments, receipts, refunds) · Exam (attempts, answers, scores, results) · Proctor (embeddings, derived events, optional flagged frames) · Audit (admin/system logs) · Support (tickets/comments).
- **Events:** emits **`GuardianConsentCaptured`** (portal → core). Coordinates with PROCTOR `FaceEnrollmentCompleted` gating.
- **Cross-ref:** **biometric capture + retention detail authoritative in PROCTOR-05**; payment-data retention follows policy defined here.

## 8. Out of Scope
- Proctor capture mechanics / face-embedding storage internals (PROCTOR-01); **authoritative biometric retention window detail (PROCTOR-05)** — referenced, not redefined here.
- Profile field capture & eligibility (AUTH-02); refund execution (PORTAL-06).
- Final legal policy copy & exact retention durations (legal-review-bound — see §10).

## 9. Acceptance Criteria
- [ ] Minor cannot reach `ACTIVE` / book / pay / enroll biometrics without verifiable parent-OTP consent.
- [ ] Booking/payment blocked without current consent versions; proctor enrollment blocked without proctoring/biometric consent.
- [ ] Withdrawal suspends processing and schedules erasure (honoring holds); proof recorded; impact shown.
- [ ] Retention job deletes expired **OTP challenges** in a staging test; **biometric retention deletion job runs and is verified** with proof — **no silent failures** (retry + alert on failure).
- [ ] Consent records immutable, versioned, exportable, audited; sensitive export creates an audit log.
- [ ] A data request moves intake → processing → completed | rejected(reason); export compiles cross-repo data.
- [ ] `GuardianConsentCaptured` emitted on consent.

## 10. Dependencies & Open Decisions
- **Legal/DPO review of consent copy + retention durations is binding.**
- Depends on AUTH-02 (minor flag), PLAT-04 (audit), PROCTOR-05 (biometric retention), OPS-01 (incident/CERT-In posture).
- **Open (for codex):**
  - Exact retention windows per data category; erasure/DSR SLA.
  - Whether a **Consent Manager / DPDP Consent Artifact** integration is needed later.
  - Cross-repo erasure orchestration (saga vs per-service jobs) given data spans all 4 repos.
  - Adult vs minor consent UX divergence (acknowledgment vs parent-OTP).
  - Reconcile with **PROCTOR-05** on the single source of truth for biometric retention period.

## 11. Success Metrics
- 100% of minors with valid consent before processing; consent completion/acceptance rate.
- **0 overdue retention deletions**; retention job success/failure rate tracked.
- DSR turnaround within SLA; data requests by status; sensitive-access counts.

## 12. Risks & Mitigations
- **Legal interpretation uncertainty** → this PRD defines product/system capabilities; final copy + periods gated on legal review.
- **Silent retention-job failure** (prior gap) → idempotent jobs + proof-of-deletion + retry + alerting; no silent skip.
- **Parent/student confusion over consent** → simple Hindi/English language + support link.
- **Cross-repo erasure drift** → shared retention contracts + orchestrated DSR export/deletion + audit.
- **Over-deletion vs legal hold conflict** → retention policy with explicit legal/financial/exam-integrity holds; documented deferral.
