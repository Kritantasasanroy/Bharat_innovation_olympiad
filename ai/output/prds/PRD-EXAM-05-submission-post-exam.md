# PRD-EXAM-05: Submission & Post-Exam Flow

- **Final primary project:** bio-exam | **Impacted projects:** bio-admin, bio-portal | **Phase:** P4 Exam Runtime | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-EXAM-05-submission-post-exam.md + docs/prds/phase-3-exam-runtime/PRD-16-attempt-timer-autosubmit.md (submit portion) + docs/prds/phase-3-exam-runtime/PRD-17-exam-player-answer-autosave.md (submit portion)

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-exam
- **Impacted projects:** bio-admin, bio-portal
- **Deploy cadence:** exam-window runtime; spin up before check-in, scale down after submission/export gates
- **Final boundary note:** Exam owns submit/finalize; admin scoring consumes submission; portal shows post-exam state.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Finalize an attempt (manual, auto, or force), **lock it**, **enqueue scoring exactly once**, and guide the student out cleanly. Goal: a deterministic, **idempotent** submission that **never loses answers** and **never double-processes** — coordinated with the durable timer (EXAM-04) so that manual-vs-auto (and job-vs-sweeper) races resolve to a single terminal state.

## 2. Users & Personas
- **Student** — reviews and submits, or is auto-submitted at expiry.
- **Scoring (SCORE-01)** — consumes the finalized attempt exactly once.
- **Proctor (PROCTOR-03)** — may force-submit on a critical violation via the same idempotent path.
- **System** — timer/sweeper auto-submit (EXAM-04).

## 3. User Stories
- As a student, I review answered/unanswered/marked questions and submit, then see a confirmation.
- As a student whose time runs out, I'm **auto-submitted with whatever I've saved**.
- As the platform, submission **flushes any buffered answers**, locks the attempt, and **queues scoring exactly once**.
- As a proctor, a critical violation can force a terminal submission with a reason.

## 4. Functional Requirements (FR-1…)
1. **FR-1 Pre-submit review.** Show answered / unanswered / marked-for-review with an **accurate count** (EXAM-03) before manual submit.
2. **FR-2 Manual submit.** Flush pending offline buffer (EXAM-03) → transition `IN_PROGRESS → SUBMITTING → SUBMITTED` → set `submittedAt` → **enqueue scoring once** (`attempt.submitted` → SCORE-01) → **cancel the durable timer job** (EXAM-04; idempotency covers the race). Owner-checked (EXAM-02).
3. **FR-3 Auto-submit.** On timer expiry / sweeper (EXAM-04) → `AUTO_SUBMITTED` via the **same finalize path**, idempotent. Submit attempted **after** expiry routes here if not already terminal.
4. **FR-4 Force-submit.** Proctor critical violation (PROCTOR-03) → terminal state **with reason**, same idempotent finalize path; overrides in-progress.
5. **FR-5 Idempotency / immutability.** A **terminal attempt cannot be re-submitted or reopened**; **single scoring enqueue** per attempt. Concurrent manual+auto (and job+sweeper) → **first wins, others no-op**; resolves to exactly one terminal state.
6. **FR-6 Confirmation + exit.** Confirmation screen + redirect (slot `quitUrl` / portal); **SEB quit handling** (EXAM-06) for SEB sessions. Optionally surface "submitted" status (no provisional score by default — see §10).
7. **FR-7 Retry-safe.** Network failure during submit is **retry-safe** (idempotent) — a retried submit on a terminal attempt is a no-op returning the terminal state.

## 5. Non-Functional (perf, security, scale, DPDP)
- **Exactly-once finalize + scoring enqueue**; **no answer loss at submit** (buffer flushed first).
- **Ownership enforced** (EXAM-02); resilient to concurrent manual+auto and job+sweeper races (idempotent).
- Mass-submit at slot boundary handled with staggered scoring (EXAM-04/SCORE-01) to bound load.
- India residency; submission events audited (OPS-01).

## 6. Flows, States & Edge Cases
- **Flow:** review → submit → `SUBMITTING` → locked (`SUBMITTED`/`AUTO_SUBMITTED`/forced) → scoring queued → confirm → redirect/SEB-quit.
- **Edge cases:**
  - **Manual + auto race at expiry** → first wins, second no-ops (one submission).
  - **Job + sweeper both fire** (EXAM-04) → idempotent finalize → one terminal state, one scoring enqueue.
  - **Submit with pending offline buffer** → **flush first**, then lock.
  - **Network failure during submit** → retry-safe (idempotent).
  - **Force-submit** overrides an in-progress attempt with a reason.
  - **Submit after already terminal** → no-op, returns terminal state.

## 7. Data Model & Contracts (entities, named events, APIs)
- **Updates:** `Attempt.status` (`SUBMITTING → SUBMITTED|AUTO_SUBMITTED|VOIDED`), `submittedAt`, `forceSubmitReason?`.
- **Emits (bio-exam internal, §5 catalog verbatim):** `attempt.submitted` → SCORE-01 (exactly one enqueue per attempt).
- **APIs (exam-api, owner-checked + expiry-aware):** `POST /student/attempts/:attemptId/submit` (idempotent manual submit). Auto/force submit run server-side via `exam-worker` / proctor integration along the same finalize.
- **Consumes:** flushed answers (EXAM-03), timer cancel (EXAM-04), force-submit trigger (PROCTOR-03).

## 8. Out of Scope
- Score computation (SCORE-01); result display (SCORE-02).
- Timer scheduling internals (EXAM-04); answer-save mechanics (EXAM-03).
- SEB config/verification internals (EXAM-06) — only `quitUrl`/quit handling referenced.

## 9. Acceptance Criteria (checkboxes)
- [ ] Manual / auto / force submit all finalize **idempotently**; terminal attempts are **immutable** (no re-submit/reopen).
- [ ] **Buffered answers flushed before lock**; no loss.
- [ ] **Exactly one scoring enqueue** per attempt (no duplicate under manual+auto or job+sweeper race).
- [ ] **Manual submit vs auto-submit race produces one submission** / one terminal state.
- [ ] Submit **after expiry** routes to the auto-submit path (not a fresh independent finalize).
- [ ] Confirmation shown + **correct redirect / SEB-quit**.
- [ ] Submit is **retry-safe** under network failure.

## 10. Dependencies & Open Decisions
- **Depends on:** EXAM-03, EXAM-04, EXAM-06, PROCTOR-03.
- **Open — post-exam redirect targets** (portal vs slot `quitUrl`).
- **Open — immediate "submitted" vs any provisional info** shown to the student (default: submitted-only, no provisional score).
- **Open — force-submit reason taxonomy** (shared with PROCTOR-03).
- **Open — `SUBMITTING` timeout/recovery** if a finalize stalls (sweeper recovers to terminal — EXAM-04).

## 11. Success Metrics
- **0 stuck `IN_PROGRESS`** post-window; **0 duplicate scoring**; submit success rate.
- Submit latency; retry rate; **unsaved-answer count at submit → 0**.

## 12. Risks & Mitigations
- **Double finalize / double scoring** (manual+auto, job+sweeper, retries). *Mitigation:* idempotent finalize keyed by attempt; single scoring enqueue; terminal-state guard.
- **Answer loss at submit** (unflushed buffer). *Mitigation:* flush-then-lock; pre-submit review; retry-safe submit.
- **Stuck `SUBMITTING`** if finalize crashes. *Mitigation:* sweeper recovery (EXAM-04) to terminal; `EXPIRED_WITH_ERROR` fallback (EXAM-02).
- **Mass submit at slot close** overloads scoring. *Mitigation:* staggered scoring enqueue (SCORE-01), batched finalize (EXAM-04).
- **Force-submit ambiguity** (reason/audit). *Mitigation:* defined reason taxonomy, audited terminal transition.
