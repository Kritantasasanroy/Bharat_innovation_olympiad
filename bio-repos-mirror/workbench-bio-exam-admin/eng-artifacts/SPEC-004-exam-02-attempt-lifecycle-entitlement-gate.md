---
id: SPEC-004
title: "Attempt Lifecycle & Entitlement Gate (Ownership on HTTP + WS)"
status: draft
created: 2026-07-03
owner: deepak
epic: EPIC-EXAM-02
prd: PRD-030
target_repos: [bio-exam, bio-admin, bio-contracts]
precision_mode: on
---

# SPEC-004: Attempt Lifecycle & Entitlement Gate (Ownership on HTTP + WS)

## 1. Scope

Tied to PRD-030. Implement the authoritative attempt gate and state machine in `bio-exam`:
idempotent create-or-resume start keyed by `registrationId`, a deny-by-default entitlement gate
(confirmed paid registration, slot window, SEB when required, readiness), ownership enforced on every
attempt HTTP endpoint and on the `exam-ws` timer-room join (closes the prior IDOR), a durable
server-authoritative `endsAt`, and a snapshot pinned key-stripped onto the attempt. Start fails closed
when the timer cannot be scheduled.

Out of scope (owned elsewhere): autosave mechanics (EXAM-03), timer scheduling internals (EXAM-04),
finalize sequence detail (EXAM-05), scoring (SCORE-01), SEB hashing/config (EXAM-06), advisory
dashboard and snapshot import trigger (EXAM-00).

## 2. Target repositories

| Repo | Role | Change summary |
|------|------|---------------|
| bio-exam | service | Attempt aggregate + state machine, start-attempt use case (create/resume, idempotent by `registrationId`), entitlement/window/SEB/readiness gate, ownership guard on HTTP routes and the WS join, key-stripped snapshot pin, timer-scheduler port call, `attempt.started`/`attempt.submitted` emission. |
| bio-admin | consumed | Publishes the key-stripped `ExamSnapshotPublished` (ADMIN-04) and owns answer keys. No key material may enter the runtime. No change authored here. |
| bio-contracts | shared-lib | `RegistrationConfirmed`/`RegistrationCancelled`, `ExamSnapshotPublished`, runtime `attempt.started`/`attempt.submitted`, error codes, `auth-kit`. Consumed only; DTOs never hand-duplicated. |

## 3. Architecture impact

- **Services touched:** `exam-api` (start-attempt, get-attempt, ownership guard), `exam-ws` or polling
  gateway (owner-checked timer-room join), `entitlement-consumer` (`RegistrationConfirmed` becomes the
  local `ExamRegistration` read-model), `snapshot-import-consumer` (key-stripped snapshot read-model).
  Timer scheduling is delegated to EXAM-04.
- **Ports (hexagonal, core imports none of these implementations):**
  - Inbound: `StartAttempt` (`POST /student/registrations/:registrationId/start-attempt`), `GetAttempt`
    (`GET /student/attempts/:attemptId`), `JoinTimerRoom` (WS handshake), the two event-consumer
    entrypoints.
  - Outbound: `AttemptRepository`, `ExamRegistrationReadModel` (ACTIVE/CONFIRMED lookup),
    `ExamSnapshotReadModel` (key-stripped), `TimerScheduler.schedule(attemptId, endsAt)` (EXAM-04),
    `EventBus` (`attempt.started`/`attempt.submitted`), `Clock`, `SebValidator` (EXAM-06),
    `ReadinessGate` (EXAM-01).
- **Cross-service contracts:** consumes `RegistrationConfirmed` (PORTAL-07), `ExamSnapshotPublished`
  (ADMIN-04, key-stripped), readiness result (EXAM-01); emits `attempt.started` on create and
  `attempt.submitted` on terminal transition (finalized by EXAM-05, triggers SCORE-01). All shapes from
  `domain-contracts`.
- **Ownership guard:** one centralized guard resolves `attempt.userId === caller` for HTTP and reuses
  the same predicate in the socket-join handshake, so both paths share one authorization decision.

## 4. API and contracts

### Inbound

| Surface | Method / trigger | Auth | Input | Output / errors |
|---------|------------------|------|-------|-----------------|
| Start attempt | `POST /student/registrations/:registrationId/start-attempt` | `auth-kit` session, entitlement-gated, deny-by-default | path `registrationId` | `{ attemptId, status, endsAt, serverNow }`. `403` not entitled / not owner; `409` terminal exists (returns terminal); `423` SEB/readiness fail; `503` timer unschedulable (fail closed). |
| Get attempt | `GET /student/attempts/:attemptId` | session, owner-only | path `attemptId` | attempt metadata (owner). `403` non-owner (IDOR path). |
| Timer-room join | `exam-ws` connect / join | session, owner-only | `attemptId` | admitted only if owner; non-owner rejected. WS is optional; timer correctness lives in EXAM-04. |
| `entitlement-consumer` | event consume | service-internal | `RegistrationConfirmed` / `RegistrationCancelled` | Upserts/withdraws `ExamRegistration`. Missing/incompatible contract fails `test:contract`. |
| `snapshot-import-consumer` | event consume | service-internal | `ExamSnapshotPublished` | Stores key-stripped snapshot. Forbidden-field test blocks any key material. |

### Outbound

| Target | Protocol | Retry | Failure policy |
|--------|----------|-------|----------------|
| `TimerScheduler.schedule` (EXAM-04) | port / BullMQ adapter | idempotent by `attemptId` | Unavailable at start, fail start **closed** (no untimed exam). |
| `EventBus` `attempt.started`/`attempt.submitted` | transactional outbox | at-least-once, idempotent consumer | Outbox row committed in the same tx as the state change. |
| `ExamRegistrationReadModel` / `ExamSnapshotReadModel` | injected persistence | n/a | Local read-model, no portal/admin round-trip on the hot path. |

### Required gates (PRD-030 section 12; scaffold SPEC-003)

`typecheck`, `lint`, `format:check`, `test`, `test:contract`, `boundaries`, `security:audit`, secret
scan, production env validation. Plus a forbidden-field test asserting no answer key reaches any runtime
contract or fixture, and an IDOR regression suite covering HTTP and WS.

## 5. Data model

### Schema changes (bio-exam, owned here)

New `Attempt` table. Forward migration adds the table and a **unique constraint on `registrationId`**
(the idempotency key). Rollback drops the table. No data backfill (new capability).

```
Attempt {
  id            uuid pk
  registrationId uuid unique      -- exactly one attempt per registration (FR-7)
  userId        uuid             -- ownership subject (FR-5)
  slotId        uuid
  examSnapshotId uuid            -- pinned key-stripped published version (FR-3)
  status        AttemptStatus    -- FR-6 state machine
  startedAt     timestamptz
  endsAt        timestamptz      -- min(startedAt + snapshot.duration, slotEndsAt) (FR-3)
  submittedAt   timestamptz null
  gracePeriodSecs int null
  createdAt     timestamptz
}
AttemptStatus = NOT_STARTED | IN_PROGRESS | SUBMITTING | SUBMITTED
              | AUTO_SUBMITTED | EXPIRED_WITH_ERROR | VOIDED
```

Note vs the legacy monolith: the gate key moves from `(userId, examInstanceId)` + slot booking to a
confirmed **`registrationId`** entitlement, and the state machine adds `SUBMITTING`,
`EXPIRED_WITH_ERROR`, `VOIDED`. Migration in a shared database must add the new columns/constraint
additively so the legacy engine keeps running during cutover.

### Cross-service contracts

Imported from `domain-contracts`. Snapshots are key-stripped: no `correctAnswer`, correct-option flag,
or pre-release `explanation` in any runtime contract or fixture. Answer keys stay in `bio-admin`.

### ERD

See ERD-004.

## 6. Rollout plan

- **Feature flag:** `exam02_attempt_gate`, default off until QA signs off.
- **Deploy order:** SPEC-001 (contracts) and SPEC-003 (bio-exam scaffold) first, then this gate, then
  EXAM-03/04/05.
- **Ramp:** 0 percent before approval, 10 percent pilot, 50 percent after 48 hours with no P1, 100
  percent after release-owner approval.
- **Migration:** additive forward migration shipped before the flag flips; the legacy monolith path is
  untouched until parity.
- **Rollback:** flag off; the additive migration is reversible with no data loss.

## 7. Observability

- **Metrics:** `unauthorized_start_total` (target 0), `idor_denied_total` (HTTP + WS), `duplicate_attempt_total`
  (target 0), `attempts_stuck_in_progress_after_close` (target 0, with EXAM-04 sweeper),
  `start_attempt_latency_p95`, `resume_success_rate`, `start_burst_success_rate`.
- **Logs:** structured audit for start, resume, deny (reason), terminal transition, using the
  `shared-types` log envelope. India data residency (PLAT-03).
- **Traces:** span on start-attempt and the gate decision; propagated via the `shared-types` trace envelope.
- **Dashboards:** authorization and attempt-lifecycle view; PLAT-04 owns the surface, this feature emits.

## 8. Failure modes

| Failure | Blast radius | Detection | Mitigation |
|---------|--------------|-----------|------------|
| IDOR on a new HTTP endpoint or the WS join | Cross-attempt data exposure/tampering | IDOR regression suite (HTTP + WS) in CI | One centralized ownership guard on all attempt routes and the socket handshake; deny-by-default. |
| Timer scheduling fails at start | Untimed exam, no enforced end | `503` on start; alert on `TimerScheduler` errors | Fail start **closed**; never persist an `IN_PROGRESS` without a scheduled `endsAt`. |
| Start-burst race creates two attempts | Two attempts per registration | Unique-constraint violation counter | Idempotent create keyed by `registrationId` (unique + upsert); double-start returns existing. |
| Answer key leaks into a runtime contract/fixture | Exam integrity for every student | Forbidden-field test | Hard CI block; key-stripped snapshot only. |
| Entitlement revoked mid-attempt | Inconsistent UX/state | Consume `RegistrationCancelled` | Policy (section 10): default allow finish-and-submit, mark for review, block any new attempt. |
| Client clock tampering | Unfair extra time | Server recompute on resume | Server-authoritative `endsAt`; client clock never trusted. |

## 9. Rollback plan

Disable `exam02_attempt_gate`. The forward migration is additive and reversible (drop the `Attempt`
table/constraint) with no backfill, so rollback is clean. Emitted events are idempotent, so a replay
after rollback does not double-apply.

## 10. Risks and open questions

- **Open (from PRD-030):** mid-attempt entitlement revocation policy (block new writes vs allow finish);
  grace period for late start and the `endsAt + gracePeriod` write-rejection threshold; WS stance
  (optional for drift/heartbeat, ownership mandatory when enabled). Resolve before `wb.approve` of this
  spec, or pin defaults and record an ADR.
- Migration against the shared Neon database must stay additive so the legacy monolith keeps serving
  during cutover.

## 11. Dependencies

- **ADRs:** ADR-003 (bio-event envelope shape) for the emitted events. New ADR only if the open
  policies above need a durable decision.
- **Other SPECs:** SPEC-001 (contracts), SPEC-003 (bio-exam scaffold) land first.
- **Upstream PRDs:** PRD-030 (this), plus EXAM-00 (read-model import), EXAM-01 (readiness), EXAM-04
  (durable timer), EXAM-06 (SEB), PORTAL-07 (`RegistrationConfirmed`), ADMIN-04 (published snapshot).
- **External teams:** security review for the ownership guard, key-stripping, and audit defaults.
