# PRD-EXAM-00: Exam Runtime Dashboard & Paid-Registration Handoff

- **Final primary project:** bio-exam | **Impacted projects:** bio-portal | **Phase:** P4 Exam Runtime | **Status:** Final golden PRD
- **Source union:** docs/prds/phase-3-exam-runtime/PRD-14-student-exam-dashboard-handoff.md (PRIMARY) + docs/prd/PRD-PORTAL-07-entitlement-sync.md (consume side) + docs/prd/PRD-EXAM-02-attempt-entitlement-gate.md (gate cross-ref)

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-exam
- **Impacted projects:** bio-portal
- **Deploy cadence:** exam-window runtime; spin up before check-in, scale down after submission/export gates
- **Final boundary note:** Exam owns readiness/check-in/runtime handoff; portal links students into it.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Students who paid in the commerce portal (bio-portal) need a **secure handoff** into the exam runtime (bio-exam). Exam runtime must (a) import only **confirmed, paid registrations** and **published snapshots**, (b) present a student "My Exams" runtime dashboard showing each confirmed exam's live state, and (c) gate **launch visibility** by time window, snapshot availability, registration status, and readiness — **without a hot-path call to the portal at the bell**. This is the read-model + dashboard + launch-affordance layer; the authoritative attempt-creation gate lives in EXAM-02. Goal: a fast, local, idempotent runtime view of entitlements that never mixes commerce-session concerns with exam-attempt state and never shows an exam the student isn't paid-and-entitled to sit.

## 2. Users & Personas
- **Paid/confirmed student** — sees their confirmed exams and launches when eligible.
- **System (exam-api consumer)** — imports `RegistrationConfirmed`/`RegistrationCancelled`/`RefundProcessed` into a local `ExamRegistration` read-model; reconciles drift.
- **Support/Ops** — reads launch-block reasons to triage "paid but can't start" tickets.
- (Indirect) **bio-portal** — source of truth for paid registration; emits the events.

## 3. User Stories
- As a paid student, I land in the exam runtime and see a dashboard of **only my confirmed exams** with title, IST slot time, and current status.
- As a paid student, I can open exam instructions / readiness only when registration is confirmed, the snapshot is imported, I'm not cancelled/refunded, the check-in window is open, and I have no completed attempt.
- As exam-runtime, when a booking is confirmed+paid I create a local `ExamRegistration` read-model so EXAM-02 can authorize attempts **without a portal round-trip**.
- As exam-runtime, when a registration is cancelled/refunded I revoke the local read-model so launch is blocked.
- As the platform, a duplicate `RegistrationConfirmed` event does **not** duplicate the dashboard item.
- As Support, when a launch is blocked I can see the machine-readable reason (no-snapshot, window-closed, cancelled, attempt-completed).

## 4. Functional Requirements (FR-1…)
1. **FR-1 Registration import (idempotent).** Consume `RegistrationConfirmed` (from bio-portal/PORTAL-07) → create/upsert a runtime `ExamRegistration { registrationId, userId, examId, slotId, snapshotId?, status: CONFIRMED, source: bookingId/registrationId, importedAt }`. **Idempotent by `registrationId`** (at-least-once delivery, exactly-once effect via upsert). Link to the exam slot and the published `ExamSnapshot` once both are present.
2. **FR-2 Revocation sync.** Consume `RegistrationCancelled` and `RefundProcessed` → set `ExamRegistration.status = CANCELLED|REFUNDED` (tombstone). **Ordering-safe**: a revoke that arrives before its issue creates a tombstone that suppresses a later late-arriving issue for the same `registrationId`.
3. **FR-3 Snapshot linkage.** On `ExamSnapshotPublished` (bio-exam admin → exam) or at import time, associate the immutable pinned `ExamSnapshot` (key-stripped) version with the registration's slot. Launch requires a linked snapshot.
4. **FR-4 Student runtime dashboard ("My Exams").** For the authenticated student, list `ExamRegistration`s with: exam title; slot date/time in **IST**; **status** ∈ `{upcoming, check-in-open, in-progress, submitted, result-pending, result-released}`; admit-card link back to commerce (deep link) if needed; device/proctor requirements (SEB-required, webcam-required); support contact. Status is derived from registration state + slot window + attempt state (EXAM-02) + result state (SCORE-02).
5. **FR-5 Runtime auth & identity mapping.** Student identity comes from the shared session token (AUTH-05 `auth-kit`) or a federated/signed student-id claim from commerce; **exam-api validates the token and maps to the runtime student id**. No unpaid/unconfirmed student can access any runtime session. (Cross-repo auth mechanism — see §10.)
6. **FR-6 Launch gating (visibility/affordance).** The "Open instructions / Start readiness" affordance is enabled **only if**: registration `CONFIRMED`; snapshot imported+linked; not `CANCELLED`/`REFUNDED`; **current time within the configured check-in window** (`checkInOpensAt..slotEndsAt`); **no completed (terminal) attempt** exists for this registration. Otherwise show a support-safe blocked message with a machine-readable `blockReason`.
7. **FR-7 Separation of concerns.** Do **not** mix commerce session/cart/payment state into attempt state. The runtime holds only the imported read-model; payment truth stays in bio-portal.
8. **FR-8 Reconciliation job.** Periodic reconciliation: portal registrations ↔ exam-runtime `ExamRegistration` store, to detect and repair drift (missed/duplicated/out-of-order events). Surfaces drift count to Ops (OPS-01).
9. **FR-9 Handoff to EXAM-02.** The dashboard "Start" hands off to EXAM-01 readiness then EXAM-02 attempt creation; EXAM-02 re-checks the gate **authoritatively** at start (dashboard gating is advisory UX, not the security boundary).
10. **FR-10 Localized, accessible, low-bandwidth** dashboard (Hindi/English copy hooks, IST display, mid-tier device friendly).

## 5. Non-Functional (perf, security, scale, DPDP)
- **Durable, at-least-once event delivery; exactly-once effect** via idempotent upsert keyed by `registrationId`. Survives consumer downtime (replay from outbox/queue). **Sync lag target < few seconds.**
- **No portal round-trip on the hot path**: dashboard and launch checks read the local read-model only.
- **Security:** deny-by-default; only the owning student sees their registrations (ownership scoping on the dashboard query). Signed/validated identity claims; contract-tested commerce↔runtime identity to prevent mismatch.
- **DPDP / residency:** India data residency; the runtime stores minimal PII (ids, status, slot/snapshot refs); no payment instrument data crosses the seam.
- **Scale:** dashboard load must stay fast at 50k confirmed registrations per slot window.

## 6. Flows, States & Edge Cases
- **Happy path:** booking confirmed+paid → `RegistrationConfirmed` → import → `ExamRegistration(CONFIRMED)` linked to snapshot → dashboard shows `upcoming` → check-in window opens → `check-in-open` → student launches → EXAM-01 → EXAM-02.
- **Revoke path:** `RegistrationCancelled`/`RefundProcessed` → status `CANCELLED`/`REFUNDED` → dashboard shows non-launchable; if an attempt was somehow in-flight, EXAM-02 policy governs (see §10).
- **Edge cases:**
  - Duplicate `RegistrationConfirmed` → upsert, **no duplicate dashboard item**.
  - **Out-of-order**: revoke arrives before issue → tombstone suppresses later issue.
  - **Consumer down** → backlog replayed on recovery; reconciliation repairs gaps.
  - **Missing/unimported snapshot** → launch blocked with support-safe message (`blockReason=NO_SNAPSHOT`); dashboard still lists the exam as `upcoming` (cannot start).
  - **Identity mismatch** (commerce id ≠ runtime id) → access denied; alert; resolved via signed claims + contract tests.
  - **Entitlement for a closed slot** but **within window** → still honored (window, not slot-open-flag, governs).
  - **Completed attempt exists** → launch blocked (`blockReason=ATTEMPT_COMPLETED`); dashboard shows `submitted`/`result-pending`.

## 7. Data Model & Contracts (entities, named events, APIs)
- **Entity (runtime read-model):** `ExamRegistration { registrationId (PK), userId, examId, slotId, snapshotId?, status: CONFIRMED|CANCELLED|REFUNDED, source (bookingId/registrationId), importedAt, updatedAt }` — lives in `exam-api` store; contract type in `domain-contracts`.
- **Consumed events (bio-portal → bio-exam, §5 catalog verbatim):** `RegistrationConfirmed`, `RegistrationCancelled`, `RefundProcessed`.
- **Consumed event (bio-exam admin → exam):** `ExamSnapshotPublished` (links immutable snapshot).
- **Produced (read-models, no new domain events here):** updates `ExamRegistration`; downstream EXAM-02 emits `attempt.started`.
- **APIs (exam-api, all ownership-scoped):**
  - `GET /student/registrations` (or `/student/my-exams`) → dashboard list for the caller.
  - `GET /student/registrations/:registrationId` → detail + `launchable: boolean` + `blockReason?`.
  - (Handoff) `POST /student/registrations/:registrationId/start-attempt` is defined in EXAM-02; EXAM-00 only exposes launch eligibility.
- **Consumer:** EXAM-02 reads `ExamRegistration` as the authoritative local entitlement at attempt start.

## 8. Out of Scope
- Booking/payment/refund execution (PORTAL-03/04/06); admit-card generation (PORTAL-05).
- Authoritative attempt creation, one-attempt-per-registration, ownership-on-write, durable timer (EXAM-02/EXAM-04).
- Device/identity readiness checks (EXAM-01); SEB config/verification (EXAM-06).
- Scoring and result computation (SCORE-01/02) — dashboard only **reflects** result state.
- Cross-repo transport infrastructure (PLAT-02/03).

## 9. Acceptance Criteria (checkboxes)
- [ ] A confirmed paid registration appears in the runtime dashboard within seconds of `RegistrationConfirmed`.
- [ ] A duplicate `RegistrationConfirmed` event does **not** duplicate the dashboard item (idempotent by `registrationId`).
- [ ] A cancelled/refunded registration is non-launchable (status `CANCELLED`/`REFUNDED`); out-of-order revoke-before-issue is handled via tombstone.
- [ ] Missing/unimported snapshot blocks launch with a support-safe message and machine-readable `blockReason=NO_SNAPSHOT`.
- [ ] EXAM-02 can authorize an attempt purely from local `ExamRegistration` state — **no portal call on the hot path**.
- [ ] Launch affordance is disabled outside the check-in window and when a completed attempt exists.
- [ ] Only the owning student can see/launch their registrations (ownership-scoped query; no IDOR on the dashboard endpoints).
- [ ] Reconciliation job detects and repairs portal↔runtime drift.

## 10. Dependencies & Open Decisions
- **Depends on:** PORTAL-07 (event issuance + transport), ADMIN-04 (`ExamSnapshotPublished`), AUTH-05 (`auth-kit` session), EXAM-01/02/06.
- **EXAM-00 ↔ EXAM-02 boundary (for codex):** EXAM-00 owns the **read-model import + dashboard + launch *visibility*** (advisory UX gate). EXAM-02 owns the **authoritative security gate** (entitlement + window + SEB + readiness), ownership-on-every-write, one-attempt-per-registration, and timer scheduling. The `start-attempt` endpoint is **defined in EXAM-02**; EXAM-00 only computes `launchable`. Confirm this split survives codex.
- **Open — event transport:** queue vs signed webhook vs shared outbox table for the portal→runtime seam (mirrors PORTAL-07 open item). Pick one consistently with the slot-catalog seam.
- **Open — cross-repo identity:** `auth-kit` shared session (this set's default) vs federated/signed student-id claims with token introspection across the contract boundary (other set). Decide concrete mechanism; both demand contract tests.
- **Open — admit-card vs entitlement source of truth:** admit-card (PORTAL-05) and runtime registration import overlap; confirm single source of truth for "what authorizes a student to sit" (recommend: entitlement/`ExamRegistration`; admit-card is a human-facing artifact).
- **Open — mid-attempt revocation policy:** if `RefundProcessed`/`RegistrationCancelled` lands while an attempt is IN_PROGRESS, block new actions vs allow finish — defined in EXAM-02 §10; EXAM-00 must reflect the chosen state.
- **Open — reconciliation cadence** (e.g., every N minutes + on-demand).

## 11. Success Metrics
- Registration import latency (event→dashboard) p95 < few seconds.
- Runtime dashboard load success rate; load latency at 50k registrations.
- **0 "paid but can't start"** incidents; **0 "cancelled but still attempted"** incidents.
- Launch-block reasons distribution (observability for support).
- 0 duplicate dashboard items from duplicate events; drift count → 0 after reconciliation.

## 12. Risks & Mitigations
- **Commerce/runtime identity mismatch** → wrong student sees/launches an exam. *Mitigation:* signed student-id claims + contract tests + deny-by-default ownership scoping.
- **Event loss/duplication/reordering** → missing or duplicate dashboard items, ghost entitlements. *Mitigation:* idempotent upsert by `registrationId`, tombstones for ordering, durable replay, reconciliation job.
- **Snapshot not linked at launch time** → student blocked at the bell. *Mitigation:* link on `ExamSnapshotPublished` and at import; surface `NO_SNAPSHOT` early on the dashboard, alert Ops.
- **Hot-path coupling to portal** (regression) → outage in portal blocks exam start. *Mitigation:* hard rule — runtime reads only local read-model; reconciliation, not synchronous calls, repairs drift.
- **Stale dashboard state** (e.g., refund not reflected) → student confusion. *Mitigation:* low sync lag + reconciliation + EXAM-02 authoritative re-check at start.
