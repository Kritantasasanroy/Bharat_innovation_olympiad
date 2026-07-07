# PRD-PORTAL-07: Registration / Entitlement Issuance & Sync to Exam Runtime
- **Final primary project:** bio-portal | **Impacted projects:** bio-exam, bio-admin | **Phase:** P3 Portal/Commerce | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-PORTAL-07-entitlement-sync.md + docs/prds/phase-1-growth-commerce/PRD-08-confirmation-admit-card-notifications.md (RegistrationConfirmed payload) + docs/prds/phase-3-exam-runtime/PRD-14-student-exam-dashboard-handoff.md (consume contract only, for the seam)

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-portal
- **Impacted projects:** bio-exam, bio-admin
- **Deploy cadence:** always-on
- **Final boundary note:** Portal emits paid entitlement; exam start gate consumes it; admin audits/reports it.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
A confirmed, **paid** registration **is** the entitlement that authorizes a student to attempt a specific exam slot — and exam-runtime (`bio-exam`) must check it **without** a hot-path call to the portal. Goal: durably issue **`RegistrationConfirmed`** on confirmation and sync it to `bio-exam`'s read store (`ExamRegistration`) for fast, **local** gate checks (EXAM-00/02); **revoke** on cancellation/refund. This PRD owns the **cross-repo issuance/replay/reconciliation** contract; the runtime side (EXAM-00) is referenced as a **consumer** only.

## 2. Users & Personas
- **System** (portal issuer/`commerce-worker`; `bio-exam` consumer/`exam-worker`).
- Indirectly the **student** (gains/loses exam access).

## 3. User Stories
- As the platform, when a registration is confirmed+paid, the student becomes entitled to attempt that slot (an `ExamRegistration` appears in runtime).
- As exam-runtime, I verify entitlement **locally** at attempt start / check-in (no portal round-trip at the bell).
- As the platform, cancelling/refunding **revokes** the entitlement downstream.
- As ops, I can detect and reconcile drift between portal registrations and the runtime store.

## 4. Functional Requirements
- **FR-1 Issue on confirmation:** on registration confirmation (PORTAL-04/05) → emit durable **`RegistrationConfirmed`** with the canonical payload (see §7). Treat the confirmed paid registration as the **entitlement** (no separate entitlement object required; `Registration` is the source).
- **FR-2 Durable, at-least-once delivery (outbox):** issue via durable event/outbox so delivery survives consumer downtime (replay); **idempotent** on the consumer keyed by **registration id**.
- **FR-3 Runtime import (consumer contract, EXAM-00/PRD-14):** `bio-exam` consumes `RegistrationConfirmed` → creates/updates runtime **`ExamRegistration`** read model, **idempotent by registration id**, linked to exam slot/snapshot. EXAM-00/02 gate **launch/attempt** on: registration confirmed + snapshot imported + not cancelled/refunded + within check-in window + no completed attempt. **This PRD does not implement the gate** — it guarantees the data + revocation the gate relies on.
- **FR-4 Revocation:** on `RegistrationCancelled` / refund (PORTAL-06) → emit **`RegistrationCancelled`** (and/or revoke signal) synced to `bio-exam` → runtime marks the `ExamRegistration` cancelled/refunded so it no longer launches.
- **FR-5 Reconciliation job:** periodic portal-registrations ↔ runtime `ExamRegistration` reconciliation to detect/repair drift.
- **FR-6 Idempotency + ordering safety:** out-of-order events handled (revoke arriving before confirm → tombstone/late-confirm-then-revoke); duplicate confirm → upsert; exactly-once **effect** via idempotent upsert.

## 5. Non-Functional
- **Durable, at-least-once delivery; exactly-once effect** via idempotent upsert keyed by registration id.
- **Sync lag < a few seconds**; survives consumer downtime (backlog replay).
- **Cross-repo identity:** student id carried as a **signed/federated claim** so `bio-exam` can map it without a portal call; contract-tested.
- **India residency.** Audited. **No payment secrets** in the payload.

## 6. Flows, States & Edge Cases
- **Confirm → issue (`RegistrationConfirmed`) → sync → runtime `ExamRegistration` → gate (EXAM-00/02).**
- **Cancel/refund → `RegistrationCancelled` → revoke → runtime no-launch.**
- **Edge:** out-of-order (revoke before confirm arrives → tombstone, reconcile); consumer down → outbox backlog replay; duplicate issue → idempotent upsert; entitlement for a closed slot still honored if within window; commerce/runtime **identity mismatch** → signed student-id claims + contract tests; missing snapshot at runtime → launch blocked by EXAM-00 (not this PRD), registration still valid.

## 7. Data Model & Contracts
- **`Registration`** (owned by PORTAL-05) is the entitlement source. Runtime read model: **`ExamRegistration { registrationId, studentId, examSlotId, examSeriesId, classBand, status, snapshotRef? }`** (idempotent by `registrationId`).
- **Emits (bio-portal → bio-exam (with bio-admin audit/read-model copy)):**
  - **`RegistrationConfirmed`** payload: `{ registrationId, studentId, examSlotId, examSeriesId, classBand, profileSnapshot (runtime-needed fields only), paymentConfirmedAt }` — **no payment secrets**.
  - **`RegistrationCancelled`** (+ `RefundProcessed` from PORTAL-06) → revoke.
- **Consumed by:** EXAM-00 (`PRD-14` runtime dashboard/handoff) — **consume contract only** here; EXAM-02 attempt gate reads local `ExamRegistration`.
- **Transport:** outbox→consumer (durable, idempotent). Contracts in `domain-contracts`.

## 8. Out of Scope
- Booking/payment (PORTAL-03/04); confirmation page/admit card/notifications (PORTAL-05); refund mechanics (PORTAL-06); **runtime dashboard UI + launch-gating logic** (EXAM-00/EXAM-02); transport infra provisioning (PLAT-03).

## 9. Acceptance Criteria
- [ ] Confirmed registration yields a runtime `ExamRegistration` synced to `bio-exam` within seconds (idempotent by registration id).
- [ ] EXAM-00/02 can authorize launch/attempt purely from local runtime state (no portal call at the bell).
- [ ] Cancellation/refund revokes the `ExamRegistration` downstream (cancelled/refunded does not launch).
- [ ] Sync is idempotent + replay-safe; out-of-order (revoke-before-confirm) handled; reconciliation detects/repairs drift.
- [ ] `RegistrationConfirmed` payload carries no payment secrets; student id is a signed/federated claim; contract tests pass.
- [ ] Duplicate `RegistrationConfirmed` does not duplicate the runtime dashboard item.

## 10. Dependencies & Open Decisions
- Depends on PORTAL-04/05 confirmation; PORTAL-06 revoke; PLAT-02 contracts; `bio-exam` EXAM-00 consumer.
- **Open (README §11 #3/#4/#5):**
  - **Event transport** for the registration/entitlement seam — outbox→consumer vs signed webhook vs shared bus.
  - **Cross-repo identity mechanism** — `auth-kit` shared kernel vs token introspection / federated signed student-id claims.
  - **Reconciliation cadence.**
  - **Source-of-truth confirmation (for codex):** the **runtime `ExamRegistration` (imported entitlement) is the authorization to sit**, gated by EXAM-00/02 — **not** the admit-card PDF (PORTAL-05), which is human-facing proof/check-in only. Terminology: confirmed **paid registration = entitlement**; no separate entitlement object is introduced (single `Registration` source synced as `ExamRegistration`).

## 11. Success Metrics
- Registration→runtime import latency (sync lag); **0 "paid but can't start"** incidents; **0 "cancelled/refunded but still attempted"** incidents; reconciliation drift count → 0.

## 12. Risks & Mitigations
- **Commerce/runtime identity mismatch** → signed student-id claims + contract tests.
- **Out-of-order revoke/confirm** → tombstone + idempotent upsert + reconciliation.
- **Consumer downtime loses events** → durable outbox + replay.
- **Two competing "sources of truth" (admit card vs runtime import)** → §10 decision: runtime entitlement gates; admit card is proof only.
- **Duplicate import** → idempotent upsert keyed by registration id.

---

## 13. Final Codex Augmentation — Registration Sync Contract

- `RegistrationConfirmed` is the canonical portal→core entitlement event; runtime imports it as `ExamRegistration`.
- Payload must include `registrationId`, `studentId`, `examSlotId`, `examSnapshotId`, `paymentOrderId`, `priceVersion`, `consentVersion`, `confirmedAt`, and `idempotencyKey`.
- Consumer must tolerate replay, out-of-order cancellation/refund, snapshot-not-yet-imported, and version mismatch.
- Admit card QR is human-facing proof/check-in, not the runtime authorization object.
