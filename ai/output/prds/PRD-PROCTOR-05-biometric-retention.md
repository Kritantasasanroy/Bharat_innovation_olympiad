# PRD-PROCTOR-05: Biometric Data Retention & Deletion
- **Final primary project:** bio-proctor | **Impacted projects:** bio-portal, bio-admin | **Phase:** P6 Proctoring | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-PROCTOR-05-biometric-retention.md + docs/prds/phase-5-scale-compliance/PRD-23-privacy-consent-retention.md (biometric embeddings + flagged-frames + retention-job + data-request portion; non-biometric categories owned by AUTH-03/PRD-23)

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-proctor
- **Impacted projects:** bio-portal, bio-admin
- **Deploy cadence:** exam-window + post-exam review/retention workers; scheduled deletion/DSR jobs may run outside windows
- **Final boundary note:** Proctor owns biometric deletion/proof; portal consent and admin DPO workflows trigger/read it.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Enforce the promise that **biometric embeddings are actually deleted on schedule**. The prior build claimed "deleted after 30 days" but shipped **no deletion job**, so data would have persisted indefinitely. Goal: automated, **verifiable** retention + deletion of biometric data (face embeddings; optional flagged frames if ever enabled) aligned with DPDP and consent (AUTH-03) — with a **retention clock** per enrollment, **idempotent scheduled deletion jobs**, **immediate consent-withdrawal deletion**, **DSR erasure** support, **proof-of-deletion** records, and **failure alerting with no silent skips**. This is a launch-blocking compliance control. (Non-biometric data categories — OTP logs, profile, payments, attempts/results, audit, support — are governed by AUTH-03/PRD-23; this PRD owns the biometric class.)

## 2. Users & Personas
- **DPO / Compliance Owner / Admin** — oversight; needs proof deletions occurred; tracks pending/overdue.
- **Student / Parent (Guardian)** — data-subject rights: withdraw consent, request access/correction/deletion.
- **Platform / System** — runs automated, verifiable deletion; enforces residency and legal-hold.

## 3. User Stories
- As the platform, biometric embeddings **auto-delete within the retention window** (default ≤30 days) after the last relevant exam.
- As a parent, **withdrawing consent deletes** my child's biometric data promptly (within SLA).
- As a student/guardian, I can raise a **DSR** (access/correction/deletion) covering biometric data through the support flow.
- As the DPO, I can **prove deletions occurred** (proof-of-deletion records + periodic audit report) and see pending/overdue.
- As the platform, a deletion blocked by an **open integrity dispute** is deferred only under a documented **legal hold**.

## 4. Functional Requirements
- **FR-1 (Retention clock):** Each enrollment (PROCTOR-01) carries a retention schedule: delete the embedding **≤ configured window** (default 30 days) after the last relevant exam. Re-enrollment **resets** the clock. Clock starts on `FaceEnrollmentCompleted`.
- **FR-2 (Scheduled deletion jobs):** **BullMQ** (or platform queue) jobs, **idempotent**, that remove the embedding from **pgvector** plus any derived/cached data (and any flagged frames if that mode was ever enabled), then **record a proof-of-deletion**. Due-scan runs on a schedule; already-deleted is a no-op.
- **FR-3 (Consent-withdrawal deletion):** On biometric/proctoring consent withdrawal (AUTH-03), trigger **immediate (within SLA)** deletion of the embedding + derived data, with proof. Withdrawal flow communicates impact on exam eligibility (AUTH-03 owns the UX).
- **FR-4 (DSR erasure):** Support **data-subject erasure** for the biometric class via the AUTH-03/PRD-23 data-request workflow (intake → processing → completed/rejected-with-reason); biometric deletion is executed by this service and proof recorded. Access/export requests include biometric metadata (not the raw embedding bytes) per policy.
- **FR-5 (Verification + alerting — critical fix):** Failed deletions are **retried and alerted**; **no silent skips** (the prior gap). A **periodic audit report** lists pending/completed/overdue deletions. Overdue biometric deletions are a hard alert.
- **FR-6 (Legal-hold / integrity coordination):** Do **not** delete data still needed for an **open integrity dispute** (PROCTOR-04 / SCORE-02) — a **policy-bound legal hold** defers deletion, **documented with justification**; when the hold clears, deletion is rescheduled.
- **FR-7 (Proof-of-deletion):** Every deletion writes an auditable `DeletionProof` (enrollment, deletedAt, method, actor/job). Audit reads of biometric data/exports are themselves audited (sensitive-access audit, AUTH-03 lineage).
- **FR-8 (Sensitive-access audit):** Reads/exports of biometric reports/embeddings metadata are logged (ties to PROCTOR-04 evidence views and PRD-23 sensitive-access audit).

## 5. Non-Functional (perf, security, scale, DPDP)
- **Verifiability:** Deletions **idempotent + verifiable** via proof records; audit-report completeness is a tracked metric.
- **DPDP / legal:** Aligned with **DPDP** and legally-reviewed retention durations; **India data residency**; consent-linked (AUTH-03). Final retention periods + legal-hold rules require **legal/DPO sign-off** (binding).
- **Reliability:** Retry-with-backoff + alerting on failure; **no silent skip**; jobs survive restarts (queue-backed).
- **Scale:** Due-scan handles the full enrollment population at slot/exam scale.
- **Security:** Deletion endpoints/jobs service-to-service auth only; embeddings encrypted at rest until deletion (PROCTOR-01).

## 6. Flows, States & Edge Cases
- **Happy path:** enroll → retention clock set (`dueAt`) → due → deletion job removes embedding + derived → `DeletionProof` written → audit report reflects completion.
- **Withdraw:** consent withdrawn → immediate deletion job (within SLA) → proof.
- **States:** `RetentionSchedule.status`: `SCHEDULED → DUE → DELETED` (+ `HELD` for legal hold, `FAILED→RETRYING`).
- **Edge cases:**
  - **Open integrity dispute** at due time → **legal hold defers** (documented); reschedule on clear.
  - **Job failure** → retry + alert (never silently skipped).
  - **Re-enrollment** before due → clock reset to new `dueAt`.
  - **Already-deleted** → idempotent no-op.
  - **DSR deletion** during a legal hold → deferred with documented justification + subject informed per policy.
  - **Flagged-frame store** (if ever enabled) → deleted alongside the embedding under the same schedule.

## 7. Data Model & Contracts (entities, named events, APIs)
- **Entities:**
  - `RetentionSchedule { scheduleId, enrollmentId, userId, dueAt, status(SCHEDULED|DUE|HELD|DELETED|FAILED), legalHoldRef? }`.
  - `DeletionProof { proofId, enrollmentId, deletedAt, method, actor(JOB|DSR|WITHDRAWAL), verified: bool }`.
  - `LegalHold { holdRef, attemptId/enrollmentId, reason, createdBy, createdAt, clearedAt? }`.
  - Tied to AUTH-03 `ConsentRecord` (biometric/proctoring purpose) and PRD-23 `DataRequest`.
- **APIs / jobs:** scheduled due-scan + deletion worker (BullMQ); consent-withdrawal hook (from AUTH-03); DSR-erasure executor; DPO audit-report endpoint (pending/completed/overdue).
- **Consumes:** `FaceEnrollmentCompleted` (start/reset clock); consent-withdrawal signal (AUTH-03); legal-hold from PROCTOR-04/SCORE-02 disputes.
- **Emits:** deletion-completed / proof events + alerts to ops (and to PRD-23 retention-job logging).

## 8. Out of Scope
- Enrollment capture & embedding compute (PROCTOR-01).
- **Non-biometric** retention classes — OTP logs, student profile, payments, attempts/results, audit logs, support tickets (AUTH-03 / PRD-23 own these; this PRD cross-refs).
- Raw-frame storage mechanics (none by design — frames transient; PROCTOR-02). Flagged-frame deletion is in scope only if that prod-disabled mode is ever enabled.
- Consent capture UX / notice versioning (AUTH-03).

## 9. Acceptance Criteria (checkboxes)
- [ ] Biometric embeddings are **auto-deleted within the retention window** by a verified job (proof recorded; **no silent failure**) — demonstrated in staging.
- [ ] **Consent withdrawal deletes** biometrics within SLA, with proof.
- [ ] **DSR erasure** for the biometric class flows intake → processing → completed/rejected-with-reason and executes deletion + proof.
- [ ] **Proof-of-deletion** recorded for every deletion; **periodic audit report** of pending/completed/overdue available to the DPO.
- [ ] Failed deletions are **retried + alerted**; an overdue biometric deletion raises a hard alert.
- [ ] **Legal hold defers deletion only with documented justification**; deletion reschedules when the hold clears.
- [ ] Re-enrollment resets the clock; already-deleted deletions are idempotent no-ops.
- [ ] Reads/exports of biometric data are audited (sensitive-access audit).

## 10. Dependencies & Open Decisions
- **Dependencies:** PROCTOR-01 (embedding store + `FaceEnrollmentCompleted`), AUTH-03 (consent, notice versions, DSR workflow, retention-policy framework), PROCTOR-04/SCORE-02 (dispute → legal hold), platform queue (BullMQ, PLAT-03), **legal/DPO sign-off (binding)**.
- **Open decisions (for codex):**
  - **Exact retention window** per biometric data class and the definition of "last relevant exam".
  - **Dispute legal-hold mechanics** (who can place/clear, max hold duration, subject notification).
  - **Proof-of-deletion format** (hash/attestation vs log record; tamper-evidence).
  - Consent-withdrawal deletion **SLA** value.
  - **Conflict/boundary resolved:** "theirs" (PRD-23) is a broad multi-category DPDP PRD across all repos; this merged PRD scopes to the **biometric class + the deletion-job/proof/DSR machinery for it**, and explicitly defers the other categories to AUTH-03/PRD-23 to avoid duplication. "Theirs" allowed flagged-frame retention; consistent with PROCTOR-02, flagged frames are prod-disabled and, if ever enabled, deleted under this schedule.

## 11. Success Metrics
- **0 overdue biometric deletions** (hard gate).
- Withdrawal-deletion SLA met (% within SLA); DSR-erasure turnaround.
- **Audit-report completeness 100%**; retention-job success/failure rate (failures → alerted, none silent).
- 100% of deletions have a proof record.

## 12. Risks & Mitigations
- **Risk:** Recurrence of "promised but never deleted" (no job / silent skip). **Mitigation:** scheduled idempotent jobs + retry + alert + overdue audit report + staging deletion test as a launch gate.
- **Risk:** Legal interpretation uncertainty on durations/holds. **Mitigation:** this PRD defines capabilities; final durations + legal-hold rules require binding legal/DPO sign-off.
- **Risk:** Deleting data needed for an open dispute (or failing to delete after it clears). **Mitigation:** documented legal hold defers; reschedule on clear; bounded max-hold.
- **Risk:** Incomplete deletion (embedding gone but derived/cached/flagged-frame data remains). **Mitigation:** deletion removes embedding + all derived/flagged data; proof asserts completeness; verification step.
- **Risk:** Residency / sensitive-access breach. **Mitigation:** India residency, encryption-until-deletion, service-to-service-only, audited biometric reads/exports.

---

## 13. Final Codex Augmentation — Retention Evidence

- Biometric deletion proof must include deletion job id, subject/enrollment id hash, data class, policy version, deletedAt, and storage/provider confirmation where available.
- Consent withdrawal triggers priority deletion workflow subject to legal/exam-integrity holds, with user-visible status.
- Retention failures page Ops and block broad/public proctored launch until cleared.
- AUTH-03 owns non-biometric categories; this PRD owns embeddings and any explicitly enabled flagged-frame storage.
