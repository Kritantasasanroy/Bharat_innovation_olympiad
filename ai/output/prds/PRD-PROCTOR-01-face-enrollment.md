# PRD-PROCTOR-01: Face Enrollment & Verification Setup
- **Final primary project:** bio-proctor | **Impacted projects:** bio-exam, bio-portal, bio-admin | **Phase:** P6 Proctoring | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-PROCTOR-01-face-enrollment.md + docs/prds/phase-4-proctoring/PRD-19-face-enrollment.md

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-proctor
- **Impacted projects:** bio-exam, bio-portal, bio-admin
- **Deploy cadence:** exam-window + post-exam review/retention workers; scheduled deletion/DSR jobs may run outside windows
- **Final boundary note:** Proctor owns enrollment/embeddings; portal captures consent; exam invokes readiness; admin audits.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Proctored exams need a verified baseline face enrollment before live frame analysis (PROCTOR-02) can detect identity mismatch. The prior build **defined embedding storage but never called it** — enrollment wrote to an in-memory/never-read path, so matching silently never worked and would have fallen back to random embeddings in prod. Goal: a consent-gated, secure, encrypted, identity-bound enrollment that produces a **persisted** face embedding wired **end-to-end** — bio-exam/bio-admin triggers it, bio-proctor computes and persists it, and EXAM-01 / PROCTOR-02 read that same persisted embedding for real verification. Enrollment must be tied to student identity, confirmed registration, and exam/proctor policy, support audited re-enrollment, and start the retention clock (PROCTOR-05).

## 2. Users & Personas
- **Student** — captures their face once (or guided multi-frame sequence) before exam check-in; retries on quality failure.
- **Parent / Guardian** — grants explicit biometric consent (AUTH-03) for a minor; without it, enrollment is blocked.
- **Proctor Reviewer** — relies downstream on a valid enrollment existing so match scores are meaningful (PROCTOR-04).
- **Platform / System** — verifies identity later (EXAM-01 readiness, PROCTOR-02 live match); enforces consent, residency, and retention.

## 3. User Stories
- As a consented student with a confirmed registration on a proctored slot, I capture my face once during the enrollment window and it is enrolled for identity checks.
- As the platform, I block enrollment for any student without explicit biometric (proctoring) consent.
- As the platform, I store the embedding **encrypted, keyed by user, tagged with model version**, and never store raw frames.
- As the platform, EXAM-01 readiness and PROCTOR-02 live match read the **persisted** embedding (no in-memory dict, no random fallback) so end-to-end identity match actually works.
- As a student, I can retry capture before successful enrollment; after success, re-enrollment is controlled (support/admin approval or a configured self-service limit) and audited.
- As the platform, on successful enrollment I start a retention clock (PROCTOR-05) and surface enrollment status in readiness (EXAM-01).

## 4. Functional Requirements
- **FR-1 (Consent gate):** Enrollment is blocked unless the biometric/proctoring purpose is currently consented (AUTH-03). Consent state is checked server-side at enrollment request time; withdrawal triggers deletion (PROCTOR-05).
- **FR-2 (Eligibility):** Enrollment allowed only when (a) student has a confirmed/paid registration (EXAM-02), (b) the booked slot requires proctoring, (c) the enrollment window is open, and (d) consent is present. All four enforced server-side.
- **FR-3 (Capture flow):** exam-web requests webcam permission, shows framing/lighting guidance, and captures a short guided sequence (target 3 frames). Frames are uploaded to bio-proctor via the exam-api proxy or a direct short-lived signed token; the receiving API **validates attempt/registration ownership** (a student cannot enroll for another student/registration).
- **FR-4 (Quality checks):** Reject unless exactly one face, face centered and sufficiently large, and basic lighting/blur thresholds pass. Return structured retake guidance per failure reason. (Liveness/anti-spoof challenge is a later add — see §8/§10.)
- **FR-5 (Embedding + persistence):** bio-proctor `proctor-api`/`proctor-worker` detect a single face (SCRFD) → compute embedding (ArcFace) → **persist to pgvector, encrypted at rest, keyed by `userId`, tagged with `modelVersion` and `enrolledAt`**. **Never store raw frames** (transient in memory only); raw-frame storage permitted only behind an explicitly-enabled, retention-bound debug mode that is **off in prod**.
- **FR-6 (End-to-end wiring — critical fix):** bio-exam/bio-admin triggers enrollment and **records enrollment status on the user/registration**; EXAM-01 readiness and PROCTOR-02 read the **persisted** embedding via a defined port. The prior in-memory-only path is removed; there is **no random-embedding fallback in prod builds** (models are required; missing model → fail closed).
- **FR-7 (Re-enrollment / update):** Student may retry freely before a successful enrollment. After success, re-enrollment requires support/admin approval or a configured self-service limit, runs the same quality + ownership checks, **overwrites the prior embedding with full audit** (who, when, old/new model version), and **resets the retention clock** (PROCTOR-05).
- **FR-8 (Status surfacing):** Enrollment status (`NOT_ENROLLED | PENDING | ENROLLED | FAILED`) is surfaced to bio-exam/bio-admin readiness (EXAM-01) so a proctored attempt cannot start un-enrolled.
- **FR-9 (Event emission):** On successful persistence, emit **`FaceEnrollmentCompleted`** (proctor→core) so bio-exam/bio-admin marks readiness and starts/links the retention clock.
- **FR-10 (Retention clock):** Successful enrollment starts the retention schedule owned by PROCTOR-05 (≤30-day default window; consent-withdrawal deletion).

## 5. Non-Functional (perf, security, scale, DPDP)
- **Security / auth:** bio-proctor is reachable **only from bio-exam/bio-admin via service-to-service auth (mTLS or signed API key)** — never publicly open; CORS not `*`. Direct-upload signed tokens are short-lived and attempt-scoped.
- **Privacy / DPDP:** Embeddings **encrypted at rest** (KMS-managed keys); **India data residency**; raw frames never persisted in prod; consent-gated; subject to PROCTOR-05 retention/deletion. Biometric data is a sensitive class under AUTH-03/DPDP.
- **Scale / availability:** Persistence is store-backed (pgvector), **not in-process**, so it is replica-independent and survives restarts/scale-out. Embedding compute may run on `proctor-worker` (queue) for burst load.
- **Correctness:** Models (SCRFD/ArcFace, ONNX) are **required in prod**; no dev/random fallback in prod builds. Structured logging only (no raw image bytes logged).

## 6. Flows, States & Edge Cases
- **Happy path:** consent present → eligibility ok → capture → quality ok → embed → persist (encrypted, model-versioned) → `status=ENROLLED` → emit `FaceEnrollmentCompleted` → retention clock started → readiness reflects enrolled.
- **States:** `NOT_ENROLLED → PENDING → ENROLLED`; `→ FAILED` on quality/model failure (retryable).
- **Edge cases:**
  - No face / multiple faces → reject with guidance; do not persist.
  - Poor lighting/blur/too-small → retake guidance.
  - Ownership mismatch (enroll for another student/registration) → reject + audit (security event).
  - Consent missing → blocked; consent withdrawn after enrollment → embedding deleted (PROCTOR-05).
  - Re-enrollment after success → overwrite with audit, reset clock.
  - Model unavailable in prod → **fail closed** (no fake embedding); alert ops.
  - Camera/device variability → clear UI guidance, retry, support fallback.

## 7. Data Model & Contracts (entities, named events, APIs)
- **Entities:**
  - `Enrollment { enrollmentId, userId, registrationId?, embedding: vector (pgvector, encrypted), modelVersion, status, enrolledAt, retentionAt }` — unique active embedding per user; history retained for audit.
  - `EnrollmentAudit { enrollmentId, action(ENROLL|RE_ENROLL|DELETE), actor, reason?, oldModelVersion?, at }`.
- **APIs (service-to-service authenticated):**
  - `POST /enroll` — body: frames + `userId` + `registrationId`/`attemptContext`; validates consent + ownership + quality; persists; returns `{ status, enrollmentId, modelVersion }`.
  - `GET /enrollment/{userId}/status` — readiness lookup for EXAM-01.
  - `POST /enroll/re-enroll` — gated overwrite (approval/limit), audited.
  - Internal port read by PROCTOR-02 to fetch the persisted embedding (no public exposure).
- **Emits:** `FaceEnrollmentCompleted { userId, enrollmentId, modelVersion, enrolledAt }` (proctor→core).
- **Consumes:** core→proctor active-attempt / proctor-policy claims (enrollment-window + proctoring-required policy); AUTH-03 consent state.

## 8. Out of Scope
- Live frame analysis & match (PROCTOR-02).
- Event ingest / risk aggregation (PROCTOR-03).
- Review/adjudication UI (PROCTOR-04).
- Retention deletion mechanics & proof-of-deletion (PROCTOR-05).
- Consent capture UX & versioning (AUTH-03).
- Liveness / anti-spoof challenge (future enhancement; noted in §10).

## 9. Acceptance Criteria (checkboxes)
- [ ] Enrollment is blocked without current biometric/proctoring consent (AUTH-03).
- [ ] Eligibility enforced: confirmed registration + proctored slot + open window, all server-side.
- [ ] A student cannot enroll for another student/registration (ownership validated; rejection audited).
- [ ] No-face / multi-face / poor-quality captures are rejected with structured retake guidance.
- [ ] Embedding is persisted to pgvector, **encrypted**, keyed by user, **tagged with model version**; raw frames are never stored (prod); the prior in-memory-only path is removed.
- [ ] EXAM-01 readiness and PROCTOR-02 successfully read the **persisted** embedding (end-to-end identity match works).
- [ ] Prod build has **no random-embedding fallback**; missing model fails closed; service is not publicly reachable (service-to-service auth + CORS restricted).
- [ ] Successful enrollment emits `FaceEnrollmentCompleted`, sets enrollment status, and starts the retention clock (PROCTOR-05).
- [ ] Re-enrollment after success is gated (approval/limit), overwrites with audit, and resets the retention clock.
- [ ] Consent withdrawal deletes the enrollment (delegated to PROCTOR-05).

## 10. Dependencies & Open Decisions
- **Dependencies:** ONNX models (SCRFD detection + ArcFace embedding) provisioned in prod (PLAT-03 / model-runtime); pgvector + KMS; AUTH-03 consent service; EXAM-01/EXAM-02 readiness & entitlement; PROCTOR-05 retention jobs.
- **Open decisions (for codex):**
  - Exact embedding model + version pin and the migration/re-embed story when the model changes (model-version mismatch handling).
  - Quality thresholds (face size %, blur/lighting cutoffs) and number of capture frames (3 vs guided sequence).
  - Encryption key management (per-tenant vs global KMS key; rotation).
  - Self-service re-enrollment limit vs always support/admin-approved.
  - Whether liveness/anti-spoof is required at launch or deferred.
  - **Conflict resolved:** "theirs" allowed optional raw-frame storage in a debug mode; "mine" forbids raw-frame storage outright. Resolution → **never store raw frames in prod**; raw storage only behind an explicit, retention-bound, prod-disabled debug flag (more secure path kept).

## 11. Success Metrics
- Enrollment success rate; quality-failure reasons distribution; re-enrollment count.
- End-to-end match verified working in EXAM-01/PROCTOR-02 (non-zero, accurate match scores) — primary signal the prior bug is fixed.
- 0 raw-frame persistence in prod; 0 prod random/fake embeddings; 0 cross-student enrollments.
- 100% of successful enrollments have a started retention clock and an emitted `FaceEnrollmentCompleted`.

## 12. Risks & Mitigations
- **Risk:** Silent enrollment failure recurs (storage written but never read). **Mitigation:** end-to-end integration test (enroll → EXAM-01 read → PROCTOR-02 match on fixtures); remove in-memory path; CI gate.
- **Risk:** Prod random-embedding fallback fakes a match. **Mitigation:** prod build forbids fallback; missing model fails closed; assert in startup checks.
- **Risk:** Camera/device variability blocks legitimate students. **Mitigation:** clear UI guidance, retries, support-assisted fallback.
- **Risk:** Biometric data exposure / residency breach. **Mitigation:** encryption at rest (KMS), India residency, service-to-service-only access, no raw frames, PROCTOR-05 deletion.
- **Risk:** Cross-student enrollment / IDOR. **Mitigation:** server-side ownership validation on every capture/enroll call + audit.
