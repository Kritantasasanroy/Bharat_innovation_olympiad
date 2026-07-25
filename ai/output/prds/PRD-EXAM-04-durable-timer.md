# PRD-EXAM-04: Durable Server Timer & Auto-Submit

- **Final primary project:** bio-exam | **Impacted projects:** bio-admin | **Phase:** P4 Exam Runtime | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-EXAM-04-durable-timer.md + docs/prds/phase-3-exam-runtime/PRD-16-attempt-timer-autosubmit.md (timer/auto-submit portion)

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-exam
- **Impacted projects:** bio-admin
- **Deploy cadence:** exam-window runtime; spin up before check-in, scale down after submission/export gates
- **Final boundary note:** Exam owns server-authoritative timer and auto-submit; admin/ops monitors it.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Each attempt has a fixed duration. The exam must end **exactly on time** and auto-submit **even if** the student's browser closes, the network drops, or a backend pod restarts. The prior design (in-memory `setInterval` per attempt) **loses all timers on restart and cannot run on >1 pod** — the critical prior bug. Goal: a **server-authoritative, durable, pod-independent** timer where the client only **displays** a countdown derived from a server-provided end-time, and auto-submit is **guaranteed-once**. The durable job is **authoritative**; a periodic worker sweeper is the **backstop guarantee**; any WebSocket channel is **optional** for UX (drift/heartbeat/final-seconds nudge) and correctness must **never** depend on it.

## 2. Users & Personas
- **Student** — sees an accurate remaining-time countdown computed from the server; is auto-submitted at expiry even if disconnected.
- **System / Scoring** — receives a clean `SUBMITTED`/`AUTO_SUBMITTED` attempt for scoring.
- **Runtime Ops / Admin** — trusts that no attempt runs past its window regardless of client behavior, pod restarts, or socket state.

## 3. User Stories
- As a student, my remaining time is computed from the server so I **cannot gain time by changing my clock**.
- As a student, if my laptop dies at minute 20 of 60, the attempt still **auto-submits at minute 60** and my saved answers are scored.
- As Ops, if I deploy/restart `exam-api`/`exam-worker` mid-exam, **every in-flight timer survives** and still auto-submits on time.
- As a student rejoining after a disconnect, my countdown **resumes from the correct server-side remaining time**, never reset.
- As Ops, even if a delayed job is somehow lost/misfired, a **sweeper** still finalizes every expired attempt.

## 4. Functional Requirements (FR-1…)
1. **FR-1 Authoritative end-time.** On attempt start (EXAM-02), persist `startedAt` and compute authoritative `endsAt = startedAt + min(snapshot.duration, slotWindowRemaining)`. `endsAt` **never exceeds** the slot/instance window end (hard close).
2. **FR-2 Durable delayed job (primary).** Enqueue a **durable delayed job (BullMQ on Redis)** with a **deterministic jobId = `attempt:{attemptId}`**, scheduled at `endsAt`, to run `autoSubmit(attemptId)` on `exam-worker`. Deterministic jobId provides enqueue **dedup** (no duplicate jobs on retry/resume).
3. **FR-3 Periodic sweeper (backstop guarantee).** `exam-worker` runs a **periodic sweeper** that finalizes any attempt past `endsAt + gracePeriod` still in a non-terminal state — the **source of guarantee** if a delayed job is lost, delayed, or Redis hiccups. Batched, partitioned/staggered by slot to bound DB load. Delayed job **and** sweeper converge on the same idempotent finalize.
4. **FR-4 Idempotent auto-submit.** `autoSubmit` is **idempotent**: if already `SUBMITTED`/`AUTO_SUBMITTED`/terminal → **no-op**; else transition via `SUBMITTING` → `AUTO_SUBMITTED`, set `submittedAt`, run the EXAM-05 finalize, **enqueue scoring once** (`attempt.submitted` → SCORE-01). Manual-vs-auto race resolves to **one** terminal state.
5. **FR-5 Client display only.** Client computes the countdown **locally from server-provided `endsAt`** (returned on start/resume) + `serverNow`; **no per-second server push required**. Reconnect re-fetches the attempt and recomputes from `endsAt`.
6. **FR-6 Optional WS/poll channel.** An **optional** `exam-ws` (or poll) channel may provide drift correction and a final-seconds nudge; the timer's **correctness does not depend on it**. If `exam-ws` is enabled: socket is authenticated, **join requires the attempt-owner check** (EXAM-02), leaving the room **does not stop the timer**, multi-pod via **Redis adapter**.
7. **FR-7 Expiry-aware writes.** Save-answer/submit reject or route appropriately after `endsAt + gracePeriod` (enforced with EXAM-02/03/05): a late submit triggers the auto-submit path if not already terminal.
8. **FR-8 Manual submit cancels job.** On manual submit (EXAM-05), cancel/no-op the delayed job; **idempotency covers the race** (a fired job on an already-terminal attempt is a no-op).
9. **FR-9 Fail-closed at start.** If Redis/BullMQ is unavailable at start, **fail attempt start closed** (do **not** start an untimed exam); surface retry.

## 5. Non-Functional (perf, security, scale, DPDP)
- **Durability:** timers survive process restart and redeploy (Redis-backed, **not in-memory**).
- **Scale:** correct across **N pods**; **50k concurrent attempts → 50k delayed jobs**, no per-second fan-out; sweeper batched/partitioned/staggered to avoid a mass-auto-submit DB spike.
- **Exactly-once effect:** auto-submit runs **at most once** per attempt (idempotent finalize + deterministic jobId dedup + sweeper convergence).
- **Clock integrity:** server is the **only** time authority; client clock never trusted for enforcement; UTC epoch math (DST/timezone irrelevant; display in IST).
- **Latency:** auto-submit fires within **≤2s** of `endsAt` under load.
- India residency.

## 6. Flows, States & Edge Cases
- **Happy path:** start → job scheduled at `endsAt` → student submits early → manual submit cancels/no-ops job.
- **Expiry path:** start → student idle/closed → job fires at `endsAt` → `AUTO_SUBMITTED` → scoring enqueued.
- **Restart:** pod dies → Redis retains the delayed job → another pod's `exam-worker` executes at `endsAt`; if the job were lost, the **sweeper** finalizes.
- **Reconnect:** client returns → fetches attempt → recomputes countdown from `endsAt`; WS (if any) only nudges.
- **Edge cases:**
  - **Duplicate enqueue** → deterministic jobId `attempt:{id}` dedups.
  - **Job fires but attempt already submitted** → idempotent no-op.
  - **Redis unavailable at start** → fail start closed (no untimed exam).
  - **Mass auto-submit at a slot boundary** → batched/staggered sweeper; stagger scoring (SCORE-01).
  - **Client clock change** → enforced `endsAt` unaffected.

## 7. Data Model & Contracts (entities, named events, APIs)
- **Entity:** `Attempt { startedAt, endsAt, status, submittedAt, gracePeriod? }` (shared with EXAM-02).
- **Out port:** `TimerScheduler { schedule(attemptId, endsAt), cancel(attemptId) }` — **adapter = BullMQ** (jobId `attempt:{id}`).
- **Out port:** `EventBus`/queue → `attempt.submitted` (bio-exam internal, §5 catalog) triggers SCORE-01.
- **Worker:** `exam-worker` hosts both the BullMQ delayed-job processor and the periodic sweeper.
- **API:** start/resume responses include `endsAt` (ISO) + `serverNow` for client drift calc.

## 8. Out of Scope
- Per-question timers (EXAM-03 if needed).
- Proctor-triggered early termination policy (PROCTOR-03 — force-submits via the **same idempotent path**).
- Scoring logic (SCORE-01); submission UX/redirect (EXAM-05).

## 9. Acceptance Criteria (checkboxes)
- [ ] **Killing the `exam-api`/`exam-worker` process mid-attempt** still results in auto-submit at `endsAt` (integration test with restart).
- [ ] **Two pods running**; attempts auto-submit **exactly once** regardless of which pod scheduled them.
- [ ] **Worker auto-submits an expired attempt with no client connected** (no WS dependency).
- [ ] **Timer continues after WebSocket reconnect** (when WS enabled) and after API restart.
- [ ] **Client clock change does not alter** the enforced end time.
- [ ] **Manual submit before expiry → later job is a no-op**; attempt stays `SUBMITTED` (not overwritten to `AUTO_SUBMITTED`).
- [ ] `endsAt` **never exceeds** the slot/instance window end.
- [ ] **Auto-submit fires within 2s of `endsAt`** at 50k-attempt load test.
- [ ] **Sweeper finalizes** an expired attempt even when its delayed job is deleted/lost (fault-injection test).

## 10. Dependencies & Open Decisions
- Requires **Redis + BullMQ** (PLAT-03); `exam-worker` deployment.
- **WebSocket-vs-durable-job stance (RESOLVED for codex):** the **durable BullMQ delayed job is authoritative**, the **periodic sweeper is the backstop guarantee**, and **`exam-ws` is OPTIONAL** (drift/heartbeat/nudge only). This **reconciles** the other set's PRD-16, which framed the *sweeper* as the source of guarantee with the delayed job "supplementing" and a WS-driven live timer: we keep **both** safety nets (job primary + sweeper backstop) and **downgrade WS to optional UX**, because correctness must not depend on a socket. Codex to ratify v1: recommend **poll-only + `endsAt`** for v1 (drop `exam-ws` initially) and keep the sweeper.
- **Open — BullMQ on Bun runtime** validation (fallback: a small Node worker process, or a DB-polled scheduler) — spike in Phase 0/4.
- **Open — `gracePeriod`** value for `endsAt + gracePeriod` write rejection and sweeper trigger.
- **Open — sweeper cadence + partition strategy** (per-slot batch size, stagger window) to bound DB load.

## 11. Success Metrics
- **0 attempts stuck `IN_PROGRESS`** after window close (hard gate; sweeper guarantees → 0).
- Auto-submit timing error **p99 < 2s**.
- **0 duplicate scoring runs** from double auto-submit (manual+auto, job+sweeper).
- Timer drift reports trend low; expired-in-progress count → 0.

## 12. Risks & Mitigations
- **In-memory timer regression** (the prior bug) → all timers lost on restart, single-pod only. *Mitigation:* hard ban on `setInterval`-per-attempt; durable Redis-backed jobs + sweeper; restart integration test in CI.
- **Lost/misfired delayed job** → attempt never auto-submits. *Mitigation:* periodic **sweeper** backstop finalizes any past-`endsAt` non-terminal attempt; fault-injection test.
- **DB load during mass auto-submit** at a slot boundary. *Mitigation:* batched worker, partition by slot, staggered finalize + staggered scoring.
- **Double finalize / double scoring** (job + sweeper + manual). *Mitigation:* idempotent finalize keyed by attempt; deterministic jobId dedup; single scoring enqueue.
- **Redis outage at start** → untimed exam. *Mitigation:* fail start **closed**, surface retry; never start without a scheduled `endsAt`.
- **Bun + BullMQ incompatibility.** *Mitigation:* Phase 0/4 spike; Node-worker or DB-polled-scheduler fallback.

---

## 13. Final Codex Augmentation — Timer v1 Simplification

- v1 correctness path: poll-only + `endsAt` + durable BullMQ delayed auto-submit + `exam-worker` sweeper.
- WebSocket timer/heartbeat is optional UX telemetry only; no correctness requirement depends on socket uptime.
- Acceptance tests must restart API and worker during an active attempt and prove auto-submit still occurs once.
- `AttemptSubmitted` uses `submitReason=AUTO_TIMER` for timer submissions.
