# PRD-EXAM-03: Exam Player & Answer Autosave

- **Final primary project:** bio-exam | **Impacted projects:** bio-admin | **Phase:** P4 Exam Runtime | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-EXAM-03-player-autosave.md + docs/prds/phase-3-exam-runtime/PRD-17-exam-player-answer-autosave.md

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-exam
- **Impacted projects:** bio-admin
- **Deploy cadence:** exam-window runtime; spin up before check-in, scale down after submission/export gates
- **Final boundary note:** Exam owns student player and raw-answer durability; admin/scoring later consumes submissions.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
The student-facing test experience: render only **safe** question data from the pinned snapshot, navigate sections/questions, answer multiple question types, and **reliably save answers despite flaky Indian connectivity** — with autosave + offline buffering + reconnect reconciliation so **no answers are lost**, and never trusting client state for scoring or timing. Goal: a resilient, accessible, low-bandwidth player.

## 2. Users & Personas
- **Student** taking the exam (mid-tier device / intermittent network).

## 3. User Stories
- As a student, I navigate sections/questions via a palette, mark for review, and answer various question types.
- As a student on a flaky connection, my answers autosave and aren't lost if I drop offline briefly.
- As a student who reconnects or refreshes, my saved answers and remaining time are intact.
- As a student, I see clear save state (saved / saving / offline / error) and an accurate answered/unanswered count before submit.

## 4. Functional Requirements (FR-1…)
1. **FR-1 Load exam session.** `GET /student/attempts/:attemptId/session` (owner-checked, EXAM-02) returns: attempt metadata; **server time + `endsAt`** (EXAM-04); sections; **question public projections** (sanitized); saved answers; policy flags. **Excludes** answer keys, correctness flags, and explanations (no keys ever reach the client).
2. **FR-2 Render question types** from the pinned key-stripped snapshot: **MCQ, multi-select, true/false, numeric, short-answer**.
3. **FR-3 Navigation.** Question palette with answered/marked indicators; previous/next; section navigation; **flag-for-review** (client, optionally server-stored); submit confirmation showing **accurate answered/unanswered count**.
4. **FR-4 Answer save.** `PUT /student/attempts/:attemptId/answers/:questionId` with `(answer, clientTs, idempotencyKey/version)`. Server: **validate attempt owner** (EXAM-02); **validate attempt active & not expired** (`< endsAt + gracePeriod`, EXAM-02/04); **validate question belongs to the snapshot**; **validate answer shape by question type**; store with answer **version/idempotency key**; return `savedAt` + server version. Idempotent **upsert** (unique per `(attemptId, questionId)`).
5. **FR-5 Client autosave.** Save **immediately on answer selection** plus **debounced retry**; show **saved / saving / offline / error** indicators.
6. **FR-6 Offline buffer + reconnect reconciliation.** Queue answers locally (e.g., IndexedDB) when offline; flush on reconnect; **server is authoritative** — reconcile via answer **versions / monotonic ordering** (last-write per question by `clientTs`, **capped by server receipt**). Duplicate save → idempotent upsert.
7. **FR-7 Countdown from server.** Display countdown derived from server `endsAt` (EXAM-04); periodic time-sync/drift correction; never trust local clock.
8. **FR-8 Optional randomization.** Optional randomized question/option order per attempt, **deterministic per attempt seed**.
9. **FR-9 Accessibility / localization.** Keyboard navigation; screen-reader labels for choices; Hindi/English UI copy hooks; **IST** time display; low-bandwidth assets; visible autosave status.

## 5. Non-Functional (perf, security, scale, DPDP)
- **No answer loss across brief disconnects** (explicitly tested). Saves **idempotent**. Works on mid-tier devices/networks.
- **Answers stored RAW** (scored later by SCORE-01); the player/exam-api never holds or evaluates keys.
- Ownership enforced on every save/read (EXAM-02); India residency.
- Answer-save latency and error rate kept low under load.

## 6. Flows, States & Edge Cases
- **Flow:** load session → answer → autosave → (offline? buffer → reconnect → flush + reconcile).
- **Edge cases:**
  - **Conflicting buffered vs server answer** → server reconciliation rule (latest `clientTs` wins, capped by server receipt; server version authoritative).
  - **Duplicate save** → idempotent upsert (no double-write).
  - **Submit while buffer pending** → **flush-then-submit** (EXAM-05).
  - **Tab close / refresh** → on reload, resume with saved state (answers + remaining time restored).
  - **Save after expiry** → rejected/ignored per policy (EXAM-02/04).
  - **Wrong owner / wrong question / wrong answer shape** → rejected.
  - **Client local state diverges** → server version reconciliation + clear save-state UI.

## 7. Data Model & Contracts (entities, named events, APIs)
- **Entity:** `AttemptItem / AttemptAnswer { attemptId, questionId, answer (json, raw), answeredAt, serverVersion, idempotencyKey }` — **unique per `(attemptId, questionId)`**.
- **APIs (exam-api, owner-checked + expiry-aware):**
  - `GET /student/attempts/:attemptId/session` — sanitized session payload (no keys).
  - `PUT /student/attempts/:attemptId/answers/:questionId` — idempotent upsert; returns `savedAt` + version.
- **Consumes:** pinned `ExamSnapshot` projection (ADMIN-04, key-stripped), server `endsAt` (EXAM-04).
- **No domain events emitted here** (submission/scoring events live in EXAM-05/SCORE-01).

## 8. Out of Scope
- Scoring (SCORE-01); result display (SCORE-02).
- Timer mechanics / auto-submit (EXAM-04).
- Submission finalization (EXAM-05).
- Proctoring frame capture (PROCTOR-02).
- Attempt creation / entitlement gate (EXAM-02).

## 9. Acceptance Criteria (checkboxes)
- [ ] All question types (MCQ, multi-select, true/false, numeric, short-answer) are answerable + saved; palette reflects answered/marked state.
- [ ] **Session response contains no private answer fields** (no keys/correctness/explanations).
- [ ] A brief offline period buffers answers; reconnect flushes with **correct reconciliation**; **no loss** (test).
- [ ] **Refresh/restart restores saved answers** and remaining time.
- [ ] Saves are **idempotent**; **ownership enforced**; answer save **rejects wrong owner / wrong question / expired attempt**.
- [ ] Countdown derived from **server `endsAt`** (not local clock).
- [ ] Submit confirmation accurately counts answered/unanswered.

## 10. Dependencies & Open Decisions
- **Depends on:** EXAM-02 (attempt + ownership + expiry), EXAM-04 (`endsAt`).
- **Open — offline buffer tech** (IndexedDB) + **max offline duration** before forcing reconnect/blocking.
- **Open — reconciliation rule finalization** (latest `clientTs` vs server-receipt-order; tie-breaking).
- **Open — randomization scope** (questions only vs questions+options) and seed storage.
- **Open — flag-for-review** persistence (client-only vs server-stored).

## 11. Success Metrics
- **Answer-loss incidents = 0**; autosave success rate; reconnect-resume success rate.
- Answer-save latency p95; save error rate; **unsaved-answer count at submit → 0**; reconnect count per attempt.

## 12. Risks & Mitigations
- **Client local state diverges from server** → wrong/lost answers. *Mitigation:* server-authoritative versions, idempotent upsert, explicit reconciliation rule, clear save-state UI.
- **Offline buffer exceeds capacity / very long outage** → buffered answers at risk. *Mitigation:* bounded max offline duration, durable IndexedDB queue, surface a hard "offline too long" state.
- **Answer-key leakage via session payload** → exam integrity broken. *Mitigation:* server projects only sanitized question data; contract test asserting no key fields present.
- **Save storm under reconnect (50k students)** → API overload. *Mitigation:* debounce + batch flush + idempotent upsert + infra scaling (PLAT-03).
- **Stale countdown from local clock** → unfair time. *Mitigation:* derive from server `endsAt`, periodic drift sync (EXAM-04).
