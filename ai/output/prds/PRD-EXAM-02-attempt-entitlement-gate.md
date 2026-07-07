# PRD-EXAM-02: Attempt Lifecycle & Entitlement Gate (Ownership on HTTP + WS)

- **Final primary project:** bio-exam | **Impacted projects:** bio-portal, bio-admin | **Phase:** P4 Exam Runtime | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-EXAM-02-attempt-entitlement-gate.md + docs/prds/phase-3-exam-runtime/PRD-16-attempt-timer-autosubmit.md (lifecycle portion) + docs/prds/phase-3-exam-runtime/PRD-14-student-exam-dashboard-handoff.md (gate)

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-exam
- **Impacted projects:** bio-portal, bio-admin
- **Deploy cadence:** exam-window runtime; spin up before check-in, scale down after submission/export gates
- **Final boundary note:** Exam owns attempt start and validates portal entitlements plus admin slot/snapshot windows.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Govern an attempt from authorized start through resume to terminal state, gated by a **confirmed paid registration/entitlement**, the slot **time window**, **SEB** requirements (when required), and **readiness**. Goal: only entitled students start; **exactly one attempt per registration**; safely resumable across disconnects/restarts; with **ownership enforced on EVERY attempt/answer/submit/read endpoint AND on the WebSocket path** — fixing the prior **IDOR** and missing-gate bugs. This PRD owns the **authoritative security gate** and attempt state machine; EXAM-00 owns the advisory dashboard/launch view.

## 2. Users & Personas
- **Entitled student** — starts within the window after readiness, resumes after disconnect.
- **System** — durable timer (EXAM-04), auto-submit sweeper (`exam-worker`), scoring trigger.
- **Proctor** — attaches events; may force-submit on critical violation (PROCTOR-03) via the same idempotent terminal path.
- **Runtime Ops** — monitors active/expired attempts; expects zero stuck IN_PROGRESS after window close.

## 3. User Stories
- As an entitled student, I start my attempt within the slot window after passing readiness (EXAM-01).
- As a student who disconnects (network drop / browser restart / laptop death), I **resume the same attempt** with remaining time computed from the server clock — the timer is unaffected.
- As the platform, a non-entitled or out-of-window start request is **rejected**.
- As the platform, **every** attempt action verifies the attempt belongs to the caller — over HTTP **and** over the WebSocket join.
- As the platform, a second start after a terminal state returns the existing attempt and never creates a duplicate.

## 4. Functional Requirements (FR-1…)
1. **FR-1 Entitlement gate.** Start requires an **ACTIVE/CONFIRMED `ExamRegistration`** (EXAM-00 read-model, sourced from PORTAL-07 `RegistrationConfirmed`) for that slot; not `CANCELLED`/`REFUNDED`; else **deny**. No portal round-trip on this path (local read-model).
2. **FR-2 Window + SEB + readiness gate.** Start only within `checkInOpensAt..slotEndsAt` (slot window); **SEB validated when required** (EXAM-06, fail-closed); **readiness passed** (EXAM-01). Snapshot must be imported/linked (EXAM-00).
3. **FR-3 Create / resume attempt (idempotent).** `POST /student/registrations/:registrationId/start-attempt`:
   - **Idempotent by `registrationId`** — if an IN_PROGRESS attempt exists, **resume** it (return same attempt + `endsAt`); if a terminal attempt exists, do **not** create a new one (return terminal/blocked).
   - On create: set `startedAt`; compute authoritative `endsAt = min(startedAt + snapshot.duration, slotEndsAt)`; **schedule the durable timer (EXAM-04)**; write an attempt event; emit `attempt.started`.
   - **Pin** the immutable published `ExamSnapshot`/`ExamPackage` version (key-stripped) onto the attempt.
4. **FR-4 Resume.** Existing IN_PROGRESS attempt resumes after reconnect/restart **if still active**; **remaining time recomputed from server clock**; saved answers restored (EXAM-03); returns `endsAt` for client countdown. Leaving/rejoining the socket room never resets or stops the timer.
5. **FR-5 Ownership enforced everywhere (NO IDOR).** Every attempt/answer/submit/read **HTTP** endpoint asserts `attempt.userId === caller`. The **`exam-ws` socket join** for the timer/heartbeat room performs the **same owner check** before admitting the connection; a non-owner join is rejected. Reading/acting on another's attempt → **403**.
6. **FR-6 State machine.** Superset of both sets:
   `NOT_STARTED → IN_PROGRESS → SUBMITTING → SUBMITTED | AUTO_SUBMITTED | EXPIRED_WITH_ERROR | VOIDED`.
   - `SUBMITTING` is the transient finalize state (EXAM-05).
   - `AUTO_SUBMITTED` set by timer/sweeper expiry (EXAM-04).
   - `EXPIRED_WITH_ERROR` for an attempt past `endsAt` that failed to finalize cleanly (sweeper recovers).
   - `VOIDED` for admin/proctor invalidation.
   No transition out of a terminal state.
7. **FR-7 One active attempt per registration.** Exactly one attempt per `ExamRegistration`; no second start after terminal state; double-start returns the existing attempt.
8. **FR-8 Expiry-aware writes.** All write paths (answer save EXAM-03, submit EXAM-05) are **expiry-aware**: reject/ignore writes after `endsAt + gracePeriod` per policy; submit after expiry routes to the auto-submit path if not already terminal.
9. **FR-9 Force/auto terminal paths.** Proctor force-submit (PROCTOR-03) and timer auto-submit (EXAM-04) reach a terminal state via the **same idempotent finalize** (EXAM-05); manual vs auto race resolves to exactly one terminal state.

## 5. Non-Functional (perf, security, scale, DPDP)
- **Authz deny-by-default; no IDOR** — regression-tested on HTTP and WS paths.
- **Idempotency** on start (by registration) and across resume; start path resilient under **start-burst** (50k concurrent) with the durable-timer design (EXAM-04) and infra (PLAT-03).
- **Server is the only time authority**; client clock never trusted for enforcement.
- **No answer keys** loaded into the attempt/runtime process (key-stripped snapshot).
- India data residency; attempt events audited (OPS-01).

## 6. Flows, States & Edge Cases
- **Happy path:** entitled + window + SEB + readiness → start → IN_PROGRESS → (EXAM-03 answering) → submit (EXAM-05).
- **Edge cases:**
  - Start **before** window → "not started yet"; **after** window → "closed".
  - **No entitlement** / cancelled / refunded → denied.
  - **Double-start** → returns existing IN_PROGRESS (idempotent).
  - **Start after terminal** → blocked (no new attempt).
  - **Entitlement revoked mid-attempt** (refund/cancel lands while IN_PROGRESS) → **policy** (see §10): block new write actions vs allow finish; default = allow finish-and-submit, mark for review, no new attempt.
  - **Reading another's attempt** (HTTP) or **joining another's timer room** (WS) → **403** (IDOR regression test).
  - **Pod restart mid-attempt** → durable timer survives (EXAM-04); resume recomputes from server clock.
  - **Redis/timer unavailable at start** → fail start **closed** (do not start an untimed exam — EXAM-04), surface retry.

## 7. Data Model & Contracts (entities, named events, APIs)
- **Entity:** `Attempt { id, registrationId, userId, slotId, examVersionId/snapshotId, status, startedAt, endsAt, submittedAt, gracePeriod? }` — unique active attempt per `registrationId`.
- **Consumes:** `ExamRegistration` (EXAM-00, from `RegistrationConfirmed`/PORTAL-07), `ExamSnapshot`/`ExamPackage` (ADMIN-04), `AttemptReadiness` (EXAM-01).
- **Emits (bio-exam internal, §5 catalog verbatim):** `attempt.started`; terminal transition emits `attempt.submitted` (finalized in EXAM-05) → triggers SCORE-01.
- **APIs (exam-api, all ownership-checked):**
  - `POST /student/registrations/:registrationId/start-attempt` → `{ attemptId, status, endsAt, serverNow }` (create or resume, idempotent).
  - `GET /student/attempts/:attemptId` → attempt metadata (owner-only).
  - (Answer/session/submit endpoints defined in EXAM-03/EXAM-05; all owner-checked + expiry-aware.)
- **WS contract (`exam-ws`):** timer/heartbeat room join requires authenticated owner check; multi-pod via Redis adapter; **WS is optional** (timer correctness lives in EXAM-04, not the socket).
- **Ports:** `TimerScheduler.schedule(attemptId, endsAt)` (EXAM-04 BullMQ adapter); `EventBus` for `attempt.started/submitted`.

## 8. Out of Scope
- Answer saving/autosave mechanics (EXAM-03).
- Timer scheduling/auto-submit internals (EXAM-04).
- Submission finalize sequence detail (EXAM-05).
- Scoring (SCORE-01); SEB hashing/config internals (EXAM-06); dashboard/import (EXAM-00).

## 9. Acceptance Criteria (checkboxes)
- [ ] Start **denied** without an ACTIVE/CONFIRMED entitlement, outside the window, or with missing/invalid SEB when required.
- [ ] **Exactly one attempt per registration**; resume works; **timer unaffected by disconnect**; remaining time recomputed from server clock.
- [ ] **Every attempt HTTP endpoint enforces ownership**, and the **WS timer-room join enforces ownership** — IDOR regression test covers both (non-owner → 403 / rejected join).
- [ ] Attempt is **pinned to a specific published exam snapshot version** (key-stripped; no answer keys in runtime).
- [ ] Attempt **survives API restart** (durable timer, EXAM-04); a second pod's worker still finalizes.
- [ ] Manual vs auto-submit race produces **one** terminal state; start after terminal returns existing, never duplicates.
- [ ] Save/submit after `endsAt + gracePeriod` is rejected/ignored per policy.

## 10. Dependencies & Open Decisions
- **Depends on:** EXAM-00, PORTAL-07, ADMIN-04, EXAM-01, EXAM-04, EXAM-06.
- **EXAM-00 ↔ EXAM-02 boundary (for codex):** EXAM-00 = advisory dashboard/launch visibility + read-model import; EXAM-02 = authoritative gate + state machine + ownership + timer scheduling. `start-attempt` lives **here**.
- **Open — mid-attempt entitlement revocation** policy: block new write actions vs allow finish-and-submit (default recommendation: allow finish, mark for review, block any **new** attempt). Must align with EXAM-00 status reflection.
- **Open — grace period** for late start within window and the `endsAt + gracePeriod` write-rejection threshold.
- **Open — WS stance** (carried to EXAM-04): WS is **optional** for drift/heartbeat; ownership on join is **mandatory if WS is enabled**.

## 11. Success Metrics
- **0 unauthorized starts; 0 IDOR** (HTTP + WS).
- Resume success rate; start-burst success rate (50k concurrent).
- 0 duplicate attempts per registration; 0 attempts stuck IN_PROGRESS after window close (with EXAM-04 sweeper).

## 12. Risks & Mitigations
- **IDOR regression on a new endpoint or the WS path** → data exposure / cross-attempt tampering. *Mitigation:* centralized ownership middleware/guard applied to all attempt routes **and** the socket-join handshake; IDOR regression test suite in CI.
- **Untimed exam if timer scheduling fails at start** → no enforced end. *Mitigation:* fail start **closed** when Redis/BullMQ unavailable (EXAM-04); surface retry; never start without a scheduled `endsAt`.
- **Duplicate attempt under start-burst race** → two attempts per registration. *Mitigation:* idempotent create keyed by `registrationId` (unique constraint + upsert); double-start returns existing.
- **Mid-attempt revocation ambiguity** → inconsistent UX/state. *Mitigation:* decide §10 policy; reflect consistently in EXAM-00 dashboard + EXAM-05 finalize.
- **Clock-tampering to gain time** → unfair advantage. *Mitigation:* server-authoritative `endsAt`; client clock never trusted; resume recomputes server-side.

---

## 13. Final Codex Augmentation — Entitlement Revocation Rule

- `RegistrationConfirmed` imported as `ExamRegistration` is the authorization to start an attempt.
- If `RegistrationCancelled` or `RefundProcessed` arrives before start: block start immediately.
- If cancellation/refund arrives while attempt is `IN_PROGRESS`: allow finish, mark `ENTITLEMENT_REVOKED_DURING_ATTEMPT`, and hold result for admin review instead of killing the exam mid-flight.
- Every start/write/submit path rechecks ownership and current attempt state; signed handoff claim alone is never enough for mutation.
