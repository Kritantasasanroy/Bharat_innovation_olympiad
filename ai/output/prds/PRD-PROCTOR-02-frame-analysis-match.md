# PRD-PROCTOR-02: Live Frame Analysis & Identity Match
- **Final primary project:** bio-proctor | **Impacted projects:** bio-exam, bio-admin | **Phase:** P6 Proctoring | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-PROCTOR-02-frame-analysis-match.md + docs/prds/phase-4-proctoring/PRD-20-frame-analysis-risk-events.md (frame ingestion / model analysis portion; events & risk-scoring portion → PROCTOR-03)

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-proctor
- **Impacted projects:** bio-exam, bio-admin
- **Deploy cadence:** exam-window + post-exam review/retention workers; scheduled deletion/DSR jobs may run outside windows
- **Final boundary note:** Proctor owns ML inference/risk signals; exam sends frames/events, admin reviews aggregate state.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
During a proctored exam, webcam frames must be analyzed for **no face, multiple faces, identity mismatch vs the enrolled embedding, and low-confidence/poor-quality** signals — accurately, at scale, and **without storing raw video**. The prior build had malformed output parsing (e.g. formatting `:.2f` on a `None`/missing score), crashed on model/edge errors, and relied on dev fallbacks. Goal: an accurate, scalable, privacy-preserving inference service that ingests sampled frames from active attempts (with ownership checks), runs **asynchronous** model analysis on a worker pool, returns structured flags + scores, and **degrades safely** during model/vendor downtime — never blocking answer saves or failing an exam, and never persisting frames. Output flags/scores are consumed by PROCTOR-03 for event/risk persistence.

## 2. Users & Personas
- **System / exam-runtime** — captures and forwards sampled frames from active attempts.
- **Proctor Reviewer / Admin** — consumes the resulting flags downstream (via PROCTOR-03/04); never sees raw frames here.
- **Student** — monitored with consent (AUTH-03); experiences adaptive frame cadence under load/poor bandwidth.

## 3. User Stories
- As the platform, periodic frames from an active attempt are analyzed for no-face / multiple-faces / identity-mismatch / low-confidence.
- As the platform, identity is matched against the student's **persisted enrolled embedding** (PROCTOR-01) via cosine similarity.
- As the platform, analysis scales to many concurrent exams via an async worker pool and **never stores video**.
- As the platform, frame ingest **never blocks answer saving**, and temporary model downtime emits a degraded-mode signal instead of failing the exam.
- As the platform, oversized / non-image / wrong-owner / expired-attempt uploads are rejected.

## 4. Functional Requirements
- **FR-1 (Frame ingest + ownership):** `POST /analyze-frame` (service-to-service authenticated) requires an **active attempt** and a **proctoring policy** in effect. Validate (a) the **student owns the attempt**, (b) the attempt is **not submitted/expired beyond grace**, and (c) a valid enrollment exists. Reject otherwise.
- **FR-2 (Upload safety limits):** Enforce max frame **size and dimensions**; **sniff/verify image content-type** (don't trust the declared MIME); **rate-limit per attempt** (default sample target ~1 frame / 5–10s, configurable). Reject oversized/non-image payloads.
- **FR-3 (Async inference + backpressure):** API validates and **enqueues** the frame; `proctor-worker` (GPU-capable pool) performs analysis. On queue overload, apply a **sampling/downshift policy** (raise the interval); **never block answer saving** on proctor queue depth; emit a **degraded-mode** signal if analysis is delayed beyond threshold.
- **FR-4 (Model analysis):** Detect faces (SCRFD) → embed the primary face (ArcFace) → **cosine-match vs the persisted enrolled embedding** (PROCTOR-01). Produce signals: `NO_FACE`, `MULTIPLE_FACES`, `FACE_MISMATCH` (threshold-based), `LOW_CONFIDENCE` / poor-quality. (Liveness suspicion is a later signal.)
- **FR-5 (Structured result):** Return `{ num_faces, match_score, risk_score, confidence, modelVersion, frameTimestamp, flags[] }` to exam-runtime, which **forwards it to PROCTOR-03** for typed-event + risk persistence. This PRD computes per-frame signals; it does **not** persist events or aggregate the durable risk score (PROCTOR-03 owns that).
- **FR-6 (No raw-frame storage):** Default: **discard the raw frame after analysis** (transient in memory only). Optional **flagged-frame** retention requires an **encrypted object store + retention policy** and is **off by default / disabled in prod** unless explicitly enabled; **never log raw image bytes**. Only flags/scores leave the service.
- **FR-7 (Robust parsing + real models):** Fix prior malformed output handling — **never format/serialize a `None` score** (no `:.2f` on missing values); guard all model outputs; **real models required in prod** (no dev/random fallback). On any model/vendor error, return a **safe default + alert**, do not crash.

## 5. Non-Functional (perf, security, scale, DPDP)
- **Scale:** Sized for **start-burst concurrency** (many simultaneous attempts at slot start) — an async worker pool, **not a single synchronous box**. Autoscale by queue depth; adaptive frame interval bounds load.
- **Performance:** Per-frame latency budget with sampled cadence; expose p50/p95/p99 analysis latency and queue depth.
- **Security / auth:** Service network-restricted; `/analyze-frame` reachable only via service-to-service auth (mTLS/signed key) from bio-exam/bio-admin; CORS not `*`. Ownership + attempt-state checks on every frame.
- **Privacy / DPDP:** Frames **transient** (never persisted in prod); **India residency**; consent-gated (AUTH-03); no raw image bytes in logs.
- **Resilience:** Model/vendor downtime degrades gracefully (degraded-mode signal), never fails the exam or blocks autosave (EXAM-03).

## 6. Flows, States & Edge Cases
- **Happy path:** active attempt → frame uploaded (size/type/rate ok, ownership ok) → enqueued → worker detect → embed → cosine-match → flags + scores → returned to exam-runtime → forwarded to PROCTOR-03.
- **Edge cases:**
  - **No enrollment** (should not happen post-EXAM-01 readiness) → degrade to presence-only signals; flag for review.
  - **Wrong attempt owner / expired/submitted attempt / oversized / non-image** → reject (no enqueue).
  - **Queue overload** → sample/downshift; emit degraded-mode; exam runtime + autosave unaffected.
  - **Model error / `None` score** → safe default + alert; **no crash** (fixes prior `:.2f`-on-`None` bug).
  - **Poor lighting** → lower confidence; avoid false `FACE_MISMATCH` (confidence-weighted).
  - **Bandwidth-limited client** → reduce frame rate adaptively.
  - **Model/vendor outage** → degraded mode; attempts continue; reviewer informed via flag.

## 7. Data Model & Contracts (entities, named events, APIs)
- **Input:** frame (image bytes) + `attemptId` + `userId` + frame timestamp (service-authenticated, ownership-validated).
- **Output (to exam-runtime → PROCTOR-03):** `{ num_faces, match_score, risk_score, confidence, modelVersion, frameTimestamp, flags: [NO_FACE | MULTIPLE_FACES | FACE_MISMATCH | LOW_CONFIDENCE] }`.
- **Reads:** the persisted enrolled embedding via PROCTOR-01 port (model-version aware).
- **Emits:** `ProctorFrameAccepted` (frame passed ingest validation + enqueued) and `ProctorFrameRejected` (size/type/ownership/state rejection) (proctor→core). Typed proctor events & risk-score changes are emitted by **PROCTOR-03**, not here.
- **Consumes:** core→proctor active-attempt validation + proctor-policy claims (proctoring-required, grace window, cadence).

## 8. Out of Scope
- Typed-event persistence & durable risk aggregation (PROCTOR-03 — `ProctorEventRaised` / `RiskScoreChanged`).
- Enrollment capture & embedding persistence (PROCTOR-01).
- Review/adjudication UI (PROCTOR-04).
- Biometric retention/deletion (PROCTOR-05).
- Client-side detectors (tab-switch, screen-capture, SEB) — ingested by PROCTOR-03 (EXAM-06).
- Liveness / anti-spoof (future).

## 9. Acceptance Criteria (checkboxes)
- [ ] Correctly flags no-face / multiple-faces / mismatch / low-confidence on test fixtures with **real models**.
- [ ] Identity match uses the **persisted enrolled embedding** from PROCTOR-01 (works end-to-end; non-zero accurate scores).
- [ ] Wrong-owner, expired/submitted-attempt, oversized, and non-image (content-sniffed) uploads are rejected.
- [ ] A valid frame creates a queue job (`ProctorFrameAccepted`); rejections emit `ProctorFrameRejected`.
- [ ] Worker produces correct signals for no-face / multiple-face / mismatch fixtures, forwarded to PROCTOR-03.
- [ ] Queue overload does **not** break exam runtime or block answer saving; degraded-mode signal emitted when delayed.
- [ ] **No raw frames persisted** by default (prod); no raw image bytes logged; service authenticated + network-restricted.
- [ ] Async pipeline sustains the target concurrency; **no crash** on model/edge errors (no `:.2f` on `None`); safe default + alert on model failure.

## 10. Dependencies & Open Decisions
- **Dependencies:** GPU/inference infra + queue (PLAT-03); persisted enrollment (PROCTOR-01); active-attempt validation + cadence policy from bio-exam/bio-admin (EXAM-03/EXAM-02); PROCTOR-03 to persist events/risk.
- **Open decisions (for codex):**
  - `FACE_MISMATCH` threshold tuning (cosine cutoff) vs false-positive rate; confidence weighting for poor lighting.
  - Frame cadence default + adaptive policy (overload downshift curve; degraded-mode threshold).
  - Autoscaling policy for the worker pool (queue-depth triggers).
  - Liveness / anti-spoof feasibility and timing (future).
  - **Conflict resolved:** "theirs" allowed optional flagged-frame storage; "mine" stores no frames. Resolution → **no raw-frame storage in prod**; flagged-frame retention only behind an explicit, encrypted, retention-bound, prod-disabled flag.
  - **Boundary note:** "theirs" combined frame analysis + risk events + event emission in one PRD (PRD-20). Here, analysis/match + `ProctorFrameAccepted/Rejected` live in PROCTOR-02; typed events + `RiskScoreChanged` move to PROCTOR-03.

## 11. Success Metrics
- Match accuracy (FAR / FRR) on fixtures; false-flag rate (esp. false mismatch under poor lighting).
- Inference throughput; analysis latency p50/p95/p99; queue depth; sampling/downshift count; model error rate.
- Frame ingest rate; reject rate by reason (size/type/owner/state).
- 0 raw-frame retention (prod); 0 exam runtime stalls / autosave blocks attributable to proctor queue.

## 12. Risks & Mitigations
- **Risk:** High concurrency overwhelms proctor workers. **Mitigation:** autoscale by queue depth + adaptive frame interval + sampling/downshift.
- **Risk:** False mismatch harms innocent students. **Mitigation:** confidence-weighted thresholds, human review (PROCTOR-04), conservative defaults; no auto-action here.
- **Risk:** Crash on malformed model output recurs. **Mitigation:** guard all outputs, never format `None`; safe default + alert; regression test on the prior `:.2f` bug.
- **Risk:** Raw-frame leakage / residency breach. **Mitigation:** transient frames, no-log of bytes, India residency, service-to-service-only access.
- **Risk:** Proctor pipeline degrades the exam (blocks autosave/timer). **Mitigation:** hard decoupling — proctor queue independent of answer-save path; degraded mode never fails the attempt.

---

## 13. Final Codex Augmentation — Privacy + Backpressure

- Production path stores no raw frames. Optional flagged-frame storage stays disabled unless explicitly enabled with encryption, strict retention, and access audit.
- Frame ingest must shed load gracefully: validate frame size/type/rate, enqueue accepted frames, return backpressure hints, and never block answer autosave/submission correctness.
- Model failures produce typed degraded-state events, not crashes or fake random embeddings.
- Contract fixture must prove `ProctorFrameAccepted`/`ProctorFrameRejected` cannot leak raw image bytes or storage URLs in normal prod mode.
