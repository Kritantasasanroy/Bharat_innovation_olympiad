# PRD-SCORE-01: Async Scoring Engine

- **Final primary project:** bio-admin | **Impacted projects:** bio-exam | **Phase:** P5 Scoring/Results | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-SCORE-01-async-scoring.md + docs/prds/phase-3-exam-runtime/PRD-18-scoring-result-release.md (scoring-engine half)

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-admin
- **Impacted projects:** bio-exam
- **Deploy cadence:** admin/curation/results/ops; low baseline outside exams, scale for authoring/results/ops
- **Final boundary note:** Scoring is trusted/admin-side so answer keys never enter the student-facing exam runtime.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Score submitted and auto-submitted attempts **server-side, off the student-facing path**, joining raw answers with private answer keys held in Authoring — so the exam-runtime process never holds keys and the submit bell never triggers a serial write storm. Goal: a queue-driven, **idempotent, data-driven** scoring engine that computes per-item and total scores per the exam's configured marking rules, is safely re-gradable with audit, and emits `attempt.scored`.

## 2. Users & Personas
- **System** — the `scoring-worker` (only component permitted to read answer keys).
- **Admin / Result Manager / Analyst** — relies on consistent, correct, auditable scores; can trigger governed re-grades.
- **Student / parent** — receives results downstream (SCORE-02); never interacts with this engine directly.

## 3. User Stories
- As the platform, when an attempt is submitted or auto-submitted, it is scored asynchronously by a trusted worker that can read keys — students wait on nothing.
- As an admin, scoring follows the exam's configured marking rules (per-type marks, negative marking, partial credit) consistently across all attempts.
- As the platform, re-running scoring (duplicate job, retry, or post-correction re-grade) is safe, never double-counts, and produces an audited versioned result.
- As an admin, after a content/key correction I can rescore affected attempts and the change is traceable end-to-end.

## 4. Functional Requirements
- **FR-1 (Consume trigger).** Consume `attempt.submitted` (covering both normal submit and durable-timer auto-submit from EXAM-04/EXAM-05) from a durable queue (**BullMQ**). Each job carries `{ attemptId, examId, snapshotId, submittedAt, submitReason }`.
- **FR-2 (Load inputs, key-isolated).** Fetch the attempt's raw answers (`AttemptItem`, Examination) and the **private answer-key snapshot** via the audited internal `AnswerKeyPort` (ADMIN-04). Keys are read only inside the trusted `scoring-worker` and **never leave the trusted zone**; the key version used is the one bound to the attempt's published `snapshotId`.
- **FR-3 (Data-driven marking).** Marking is fully driven by the exam's `markingConfig` (ADMIN-02) — **no hardcoded rules**: per-question-type scoring, negative marking, partial credit for multi-select, numeric tolerance, and rounding policy all come from config.
- **FR-4 (Scoring strategies, per type).** Apply the strategy selected by question type and policy:
  - **MCQ** — exact option match.
  - **Multi-select** — exact-set match by default; **partial credit when `markingConfig` enables it** (config decides exact-set vs partial — see §10).
  - **True/False** — exact match.
  - **Numeric** — exact or tolerance-based per question policy.
  - **Short answer** — normalized string match (trim/case/whitespace per config) initially; flag for **manual review** when configured or ambiguous (manual subjective grading UI is future / out of scope here).
- **FR-5 (Compute & persist).** Compute per-item `{ isCorrect, score }` and attempt `{ totalScore, maxScore, percentage }`; mark the attempt `SCORED` internally; write the Results read-model consumed by SCORE-02. **Disclosure-safe:** correctness/keys are stored but gated — never exposed to students until SCORE-02 publication.
- **FR-6 (Idempotent + re-gradable).** Scoring the same attempt twice yields exactly **one** result (idempotency keyed on `attemptId` + scoring `version`); a duplicate queue job does **not** double-score. An explicit re-grade (e.g., after key correction) creates a new **audited version** rather than mutating in place.
- **FR-7 (Batch writes, burst-safe).** Persist via **batch writes** (no per-answer serial round-trips); the engine is sized to absorb the end-of-window submission burst without back-pressuring the student path.
- **FR-8 (Re-grade / rescore job).** Provide a governed rescore job over a selected attempt set (by exam/slot/snapshot) triggered by a key/content correction; it versions, audits, and signals SCORE-02 to recompute downstream results/ranks (notification handled in SCORE-02).
- **FR-9 (Emit).** On completion emit `attempt.scored` `{ attemptId, examId, version, totalScore, maxScore, scoredAt }`.

## 5. Non-Functional (perf, security, scale, DPDP)
- **Security / key isolation (audit fix).** Answer keys are confined to the trusted `scoring-worker`; exam-runtime (`exam-api`/`exam-web`/`exam-ws`) **never loads keys**. Scoring **cannot** run from any student-supplied key — keys come only via `AnswerKeyPort` bound to the published snapshot.
- **Idempotency.** Every job is idempotent; retries and duplicates are safe.
- **Scale.** Throughput sized for end-of-window burst (all attempts in a slot submit near-simultaneously); horizontal worker scaling on the BullMQ queue; batch persistence.
- **Auditability.** All scoring runs — especially re-grades — are fully audited (who/when/why, input snapshot version, prior→new result version) per PLAT-04.
- **DPDP / residency.** Answers, keys, and scores are personal exam data processed and stored in **India**; access is least-privilege and logged.
- **Reliability.** Failed jobs retry with backoff and land in a dead-letter queue with alerting; no silent score loss.

## 6. Flows, States & Edge Cases
- **Happy path:** `attempt.submitted` → enqueue → load answers + key snapshot → mark per `markingConfig` → batch-write Results (`SCORED`) → emit `attempt.scored`.
- **Edge cases:**
  - Missing / blank answers → skip per policy (no negative mark unless config says so).
  - Ambiguous short-answer → normalize per config; if still ambiguous and review enabled, flag for manual review (does not block total of the rest).
  - Partial-credit boundaries on multi-select (per `markingConfig`).
  - **Duplicate / replayed submit event** → idempotent, single result.
  - **Re-grade after key/content correction** → new versioned, audited result; SCORE-02 recomputes + notifies.
  - Numeric tolerance edge (value on tolerance boundary) → inclusive/exclusive per question policy.
  - Partial cohort scored (some attempts pending) → does not block per-attempt scoring; SCORE-02 gates publication until complete.
  - Scoring failure → retry/backoff → DLQ + alert; attempt stays unscored, never falsely `SCORED`.

## 7. Data Model & Contracts (entities, named events, APIs)
- **Reads:** `AttemptItem { attemptId, questionId, response }` (Examination); `AnswerKey { questionId, expected, type, marking }` **via `AnswerKeyPort`** (Authoring, snapshot-bound, trusted-only). `markingConfig` (exam/snapshot).
- **Writes (Results read-model):** `Result { attemptId, examId, snapshotId, totalScore, maxScore, percentage, version, scoredAt, status: SCORED, items: [{ questionId, isCorrect, score, flaggedForReview? }] }`.
- **Consumes:** `attempt.submitted` (bio-admin internal; encompasses normal + auto-submit; see §10 on the `AttemptSubmitted`/`AttemptAutoSubmitted` reconciliation).
- **Emits:** `attempt.scored` (bio-admin internal).
- **Internal port:** `AnswerKeyPort` — audited, trusted-zone-only key access.

## 8. Out of Scope
- Ranking, percentile, certificates, result display, publication control (**SCORE-02**).
- Manual subjective / essay grading UI (future).
- Proctoring risk scoring and adjudication (PROCTOR-03/04).
- Authoring of keys / `markingConfig` (ADMIN-02/04).

## 9. Acceptance Criteria (checkboxes)
- [ ] Scoring runs only in the `scoring-worker`; exam-runtime never loads answer keys (verified by code path + test).
- [ ] Scoring cannot run from a student-provided answer key; keys come solely via `AnswerKeyPort`, snapshot-bound.
- [ ] Marking is fully data-driven from `markingConfig`; negative marking, partial credit, numeric tolerance, and rounding applied per config.
- [ ] All declared scoring strategies (MCQ, multi-select, true/false, numeric, short-answer-normalized) implemented.
- [ ] Idempotent: a duplicate scoring job does **not** double-score; one result per attempt+version.
- [ ] Explicit re-grade produces a new versioned, audited result; rescore job covers a selected attempt set.
- [ ] Batch writes used; end-of-window burst handled within latency SLA.
- [ ] `attempt.scored` emitted on completion; failures retry → DLQ + alert.

## 10. Dependencies & Open Decisions
- **Depends on:** EXAM-05 (submission events), ADMIN-02 (`markingConfig`), ADMIN-04 (publish snapshot + `AnswerKeyPort`), PLAT-02 (event/contract package), PLAT-04 (audit).
- **Conflict — event naming (for codex):** the other set fires distinct `AttemptSubmitted` and `AttemptAutoSubmitted`; the canonical catalog has a single `attempt.submitted`. This pass consumes one `attempt.submitted` carrying a `submitReason` discriminator (`USER` | `AUTO_TIMER`). Confirm whether to keep one event + discriminator or two events.
- **Conflict — worker naming (for codex):** other set names the scorer `exam-worker`; canonical is the dedicated **`scoring-worker`** (trusted zone). This pass uses `scoring-worker`; confirm.
- **Conflict — phase/priority (for codex):** other set placed scoring in **Phase 3 (P0)** runtime; this README places it in **Phase 5**. Kept Phase 5, priority P0. Confirm sequencing.
- **Conflict — multi-select credit (for codex):** mine specified partial credit; other set said "exact-set match initially." Reconciled as **config-driven** (`markingConfig` chooses). Confirm the v1 default (exact-set vs partial).
- **Open:** short-answer normalization rule set; manual-review queue design for ambiguous items; re-grade governance (who may trigger, approval gate); numeric-tolerance boundary inclusivity convention.

## 11. Success Metrics
- Scoring latency post-submit (p50/p95); time-to-fully-scored for a slot after window close.
- 0 key-exposure incidents in exam-runtime.
- 0 duplicate/double-counted or incorrect scores.
- Scoring job failure rate; attempts pending score over time.
- Re-grade auditability = 100% (every rescore traceable, prior→new version).

## 12. Risks & Mitigations
- **Content/key error discovered after the exam.** → Snapshot-correction workflow with audit + governed **rescore job**; versioned results; SCORE-02 recompute + notify.
- **Submit-bell burst overwhelms scoring / DB.** → Durable BullMQ queue decouples from submit; horizontal workers; batch writes.
- **Key leakage into runtime.** → Hard architectural boundary: keys only via `AnswerKeyPort` inside `scoring-worker`; enforced and tested.
- **Double scoring from retries/duplicates.** → Idempotency key on `attemptId`+`version`; single-result guarantee.
- **Silent scoring failure leaving attempts unscored.** → Retry/backoff + DLQ + alerting + "pending score" metric dashboards.

---

## 13. Final Codex Augmentation — Submission + Multi-Select Defaults

- Scoring consumes one `AttemptSubmitted` shape with `submitReason` rather than separate submit/autosubmit events.
- Multi-select v1 default is exact-set match; `markingConfig` can enable partial-credit strategy later without changing historical score records.
- Attempts marked `ENTITLEMENT_REVOKED_DURING_ATTEMPT` may be scored but must hold result for review before release/ranking.
