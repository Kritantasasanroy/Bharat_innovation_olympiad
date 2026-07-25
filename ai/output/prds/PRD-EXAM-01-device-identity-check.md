# PRD-EXAM-01: Pre-Exam Device, System & Identity Readiness Check

- **Final primary project:** bio-exam | **Impacted projects:** bio-proctor, bio-portal | **Phase:** P4 Exam Runtime | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-EXAM-01-device-identity-check.md + docs/prds/phase-3-exam-runtime/PRD-15-seb-device-readiness.md (device/readiness portion)

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-exam
- **Impacted projects:** bio-proctor, bio-portal
- **Deploy cadence:** exam-window runtime; spin up before check-in, scale down after submission/export gates
- **Final boundary note:** Exam owns preflight/readiness; proctor provides biometric/device signals where enabled.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Before an attempt starts, run a guided **preflight readiness** flow that verifies the student's environment (webcam, mic optional, network, viewport/device minimum, browser/SEB presence) and **identity** (face match vs enrollment) to reduce mid-exam failures and impersonation. Goal: a localized, accessible, low-bandwidth readiness gate that must pass (per slot policy) before EXAM-02 attempt start — with clear pass/fail and remediation guidance, and an explicit relaxed mode for mock/non-SEB exams.

## 2. Users & Personas
- **Student** — runs the checks and the identity match.
- **Proctor/Admin** — trusts the gate; sets per-slot readiness policy (proctor-required, webcam-required, SEB-required, mock/relaxed).
- **Platform** — blocks start when required checks fail.

## 3. User Stories
- As a student, I run a quick preflight (webcam + preview, mic if required, network, browser/SEB, viewport/device) and see pass/fail with fixes for each.
- As a student, I complete a **face match against my enrollment** before starting a proctored exam.
- As a student on a mock/non-SEB slot, I see the relaxed mode clearly indicated and can proceed without SEB.
- As the platform, I block start if a **required** check fails (e.g., no webcam when proctoring required; SEB required but absent).
- As a student with no enrollment yet, I'm routed to enroll (PROCTOR-01) and back.

## 4. Functional Requirements (FR-1…)
1. **FR-1 Readiness page / checks.** Run and display status for: **exam time window** (within check-in), **registration valid** (EXAM-00 read-model), **browser/SEB status** (SEB presence when required, EXAM-06), **viewport/device minimum**, **webcam available + live preview** (required if proctored), **microphone available** (if required), **network connectivity** (speed/stability), **consent acknowledged** (AUTH-03). Each check shows pass / soft-warn / hard-fail with remediation copy.
2. **FR-2 Identity verification.** Capture a frame → call PROCTOR-02 match vs the enrolled embedding → pass threshold; retries with guidance up to N attempts; on repeated mismatch, escalate/block + support path. Required when proctoring is on.
3. **FR-3 Consent re-affirmation.** Re-affirm biometric-capture consent (AUTH-03) if not already active before any frame capture.
4. **FR-4 Block/allow logic (policy-driven).** **Hard-fail** (block start): no webcam when proctoring required; SEB required but absent/invalid (EXAM-06); identity mismatch beyond retries; no consent. **Soft-warn** (allow + proceed): slow/flaky network, mic unavailable when optional. Admin slot policy may permit **bypass for mock/non-SEB exams** (relaxed mode) — but ownership/timer/SEB-for-required still enforced downstream.
5. **FR-5 Readiness token/state.** Produce a short-lived `AttemptReadiness` state/token gating EXAM-02 start; EXAM-02 re-checks readiness authoritatively at start (readiness here is a precondition, not the sole security boundary).
6. **FR-6 Mock/non-SEB indication.** When the slot is marked non-SEB/mock, the UI clearly indicates relaxed mode; readiness still validates registration + device basics.
7. **FR-7 Localized, accessible, low-bandwidth.** Hindi/English copy hooks, keyboard/screen-reader support, IST time display, graceful degradation on low bandwidth and mid-tier devices.

## 5. Non-Functional (perf, security, scale, DPDP)
- Works on **mid-tier Android/desktop**; degrades gracefully on low bandwidth.
- **Frames are transient** — used only for the match, **not persisted** beyond the match call (DPDP minimization); India data residency.
- Readiness checks must complete quickly; identity match latency surfaced to the user.
- Deny-by-default for required checks; relaxed mode is **explicit per-slot policy**, never default-open.

## 6. Flows, States & Edge Cases
- **Flow:** checks → consent → identity match → ready → handoff to EXAM-02 start.
- **Edge cases:**
  - **Face mismatch** → retry up to N → escalate/block + support.
  - **No enrollment yet** → route to PROCTOR-01 enroll → return to readiness.
  - **Camera denied** → instructions to grant permission; hard-fail if proctored.
  - **SEB required but normal browser** → blocked with "launch SEB" deep link (EXAM-06).
  - **Flaky/slow network** → soft-warn + proceed.
  - **Mic unavailable** when optional → warn; when required → hard-fail.
  - **Window not open / registration invalid** → block (defer to EXAM-00 messaging).
  - **Mock slot** → SEB check skipped; relaxed mode banner shown.

## 7. Data Model & Contracts (entities, named events, APIs)
- **Entity / state:** `AttemptReadiness { userId, slotId, registrationId, checks: { window, registration, browserSeb, viewport, webcam, mic, network, consent }, identityVerified: boolean, readinessToken?, expiresAt }` → consumed by EXAM-02.
- **Calls:** PROCTOR-02 (frame match) — on success may relate to `FaceEnrollmentCompleted` (proctor→core) state; failed SEB/device signals surfaced as integrity events to PROCTOR-03 (`ProctorEventRaised`) per policy.
- **APIs (exam-api, ownership-scoped):** `GET /student/registrations/:id/readiness` (compute check status), `POST /student/registrations/:id/readiness/identity` (submit captured frame for match), `POST /student/registrations/:id/readiness/confirm` (issue readiness state/token).
- **SEB launch token / config flow** is owned by EXAM-06 (referenced here, not duplicated).

## 8. Out of Scope
- Live in-exam proctoring / continuous frame analysis (PROCTOR-02/03).
- Attempt creation, ownership-on-write, timer (EXAM-02/EXAM-04).
- Face **enrollment** (PROCTOR-01).
- SEB **config generation & header verification** internals (EXAM-06) — this PRD only consumes "SEB present?".

## 9. Acceptance Criteria (checkboxes)
- [ ] Required checks must pass before start; hard-fails block, soft-warns allow.
- [ ] Identity match against enrollment is required when proctoring is on; mismatch → retry/escalate path; no enrollment → guided to enroll.
- [ ] **Device readiness blocks a missing webcam for a proctored exam.**
- [ ] **SEB-required exam cannot proceed to start from a normal browser** (defers to EXAM-06); launch link shown.
- [ ] **Mock/non-SEB exam can bypass SEB only when the slot policy allows**, with relaxed mode clearly indicated.
- [ ] Frames captured for the check are **not persisted** beyond the match.
- [ ] A failed SEB/device validation logs an integrity event where policy requires.

## 10. Dependencies & Open Decisions
- **Depends on:** PROCTOR-01/02 (enroll/match), EXAM-06 (SEB presence), AUTH-03 (consent), EXAM-00 (window/registration), EXAM-02 (consumes readiness).
- **Open — match threshold** and **retry count** (shared with PROCTOR-02).
- **Open — identity-check mandatory for all exams or proctored-only?** (default: proctored-only).
- **Open — readiness token TTL** and whether EXAM-02 trusts the token or fully recomputes at start (recommend: recompute critical checks at start; token is UX continuity).
- **Open — relaxed-mode policy surface** (admin slot flag from ADMIN-03).

## 11. Success Metrics
- Mid-exam technical-failure rate ↓; impersonation caught at the gate.
- Readiness pass/fail rate; check completion time; device-check failure rate.
- SEB launch failure rate (shared with EXAM-06); support tickets bucketed by readiness reason.

## 12. Risks & Mitigations
- **SEB version differences** → false readiness fails. *Mitigation:* test matrix + fallback instructions.
- **False-reject identity match** locks out a legitimate student. *Mitigation:* tuned threshold, N retries, human escalation/support override.
- **Camera/mic permission friction** on mid-tier devices → drop-off. *Mitigation:* clear per-platform remediation copy; soft-warn where the check is non-critical.
- **Relaxed mode misconfiguration** opens a proctored exam without checks. *Mitigation:* explicit per-slot policy, deny-by-default, audit of relaxed-mode usage.
- **Frame leakage** (DPDP). *Mitigation:* transient frames, no storage beyond match, India residency.
