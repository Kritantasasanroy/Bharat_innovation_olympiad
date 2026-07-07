# PRD-PROCTOR-03: Proctor Events, Risk Scoring & Integrity
- **Final primary project:** bio-proctor | **Impacted projects:** bio-exam, bio-admin | **Phase:** P6 Proctoring | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-PROCTOR-03-events-risk-integrity.md + docs/prds/phase-4-proctoring/PRD-20-frame-analysis-risk-events.md (events & risk-scoring portion; frame analysis/match portion → PROCTOR-02)

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-proctor
- **Impacted projects:** bio-exam, bio-admin
- **Deploy cadence:** exam-window + post-exam review/retention workers; scheduled deletion/DSR jobs may run outside windows
- **Final boundary note:** Proctor owns proctor events/risk; exam attaches attempts, admin consumes integrity signals.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Convert proctor signals — from PROCTOR-02 model analysis and from client-side detectors (tab-switch, blur/focus-loss, screen-capture, disconnect) and SEB violations (EXAM-06) — into **typed per-attempt events** and a **rolling, severity-weighted aggregate risk score**, **securely**. The prior build's event endpoint was **unauthenticated, ownership-less, and accepted arbitrary types**, so any client could spoof events onto another student's attempt (open injection). Goal: a trustworthy integrity signal — events validated against an enum and **bound to the rightful attempt owner / trusted proctor service**, deduped and rate-limited, persisted with timestamps and audited — that drives reviewer triage (PROCTOR-04), optional policy-driven force-submit (EXAM-05), and analytics (ADMIN-06).

## 2. Users & Personas
- **System** — ingests events (PROCTOR-02 server-side results; client detectors; SEB).
- **Proctor Reviewer / Admin** — consumes the risk score + event timeline for triage (PROCTOR-04).
- **Student** — monitored; protected from spoofed events being attributed to them.

## 3. User Stories
- As the platform, proctor events attach **only** to the rightful student's attempt — no spoofing onto another student.
- As the platform, only **known event types** (enum-validated) are accepted; unknown/malformed types are rejected.
- As the platform, a rolling **severity-weighted** risk score aggregates events per attempt for reviewer triage and thresholding.
- As the platform, an above-threshold/critical violation can **flag for review and/or force-submit** the attempt per exam policy.
- As the platform, event floods are rate-limited and deduped, and every event is persisted with timestamps and audited.

## 4. Functional Requirements
- **FR-1 (Secure event ingest — critical fix):** Every event is (a) **validated against the `ProctorEventType` enum** (reject unknown/malformed) and (b) **attempt-ownership-enforced** — the event's `attemptId` must belong to the **authenticated student** (for client-originated events) or to a **trusted proctor service** (for server-side PROCTOR-02 results, via service-to-service auth). This closes the prior open-injection hole. Cross-student injection is rejected and audited as a security event.
- **FR-2 (Sources):** Ingest from — server-side **PROCTOR-02** results (no-face / multiple-faces / mismatch / low-confidence, via trusted service auth); **client detectors** (tab-switch, window-blur/focus-loss, screen-capture attempt, network disconnect/reconnect); **SEB violations** (EXAM-06). Each source maps to typed events with `severity`, `confidence`, `frameTimestamp`/`occurredAt`, and `modelVersion` where applicable.
- **FR-3 (Risk aggregation):** Maintain a **rolling, severity-weighted** risk score per attempt, updated incrementally as events arrive. Define configurable thresholds for **review** and **critical**. Aggregation is deterministic and reproducible from the persisted event log.
- **FR-4 (Critical action / force-submit):** An above-critical-threshold or designated-critical event **flags the attempt for review** and, **per exam policy**, may trigger a **force-submit** (EXAM-05). Force-submit is policy-bound (not automatic for all exams) and audited.
- **FR-5 (Rate-limit + dedupe + persist):** Rate-limit events per attempt; dedupe repeats (e.g. sustained no-face) into bounded events; persist all accepted events with timestamps; everything audited.
- **FR-6 (Degraded-mode handling):** Record degraded-mode / analysis-delayed signals from PROCTOR-02 without inflating risk as if they were violations (weight appropriately — see §6 edge cases).
- **FR-7 (Downstream feeds):** Feed the **review console** (PROCTOR-04) with events + risk timeline, and **analytics** (ADMIN-06) with event/risk aggregates.
- **FR-8 (Event emission):** Emit **`ProctorEventRaised`** (per accepted typed event) and **`RiskScoreChanged`** (on each risk update) (proctor/core boundary, as defined in shared contracts) for downstream consumers (PROCTOR-04, ADMIN-06).

## 5. Non-Functional (perf, security, scale, DPDP)
- **Security:** **No cross-student event spoofing** — ownership + enum enforced on every ingest; client events authenticated as the owning student, server events via service-to-service auth (mTLS/signed key); CORS not `*`. A regression test specifically reproduces and blocks the prior open-injection hole.
- **Integrity / correctness:** Ingest is **idempotent / deduped**; risk score is reproducible from the event log; force-submit is policy-gated and audited.
- **Scale:** Handles many events per attempt and many concurrent attempts (burst at slot start); rate-limiting protects the store.
- **DPDP / residency:** Events store **derived signals only** (no raw frames, no biometric images); **India residency**; subject to retention (events under exam-data retention; biometric embeddings under PROCTOR-05).

## 6. Flows, States & Edge Cases
- **Happy path:** signal arrives → validate (enum + ownership/auth) → rate-limit/dedupe → persist (timestamped, audited) → update rolling risk → emit `ProctorEventRaised` + `RiskScoreChanged` → (threshold crossed? → flag for review and/or force-submit per policy).
- **Edge cases:**
  - **Cross-student spoof attempt** → rejected + audited (security event); never attributed.
  - **Unknown/malformed type** → rejected (enum guard).
  - **Client floods events** → rate-limit + dedupe; bounded event count.
  - **Event for a terminal/submitted attempt** → record for audit but **no force-submit** (invalid action guarded).
  - **Network-disconnect / reconnect** vs genuine cheating → weighted lower than mismatch/multiple-faces (avoid penalizing connectivity); degraded-mode signals likewise.
  - **False positives** → reviewer can dismiss in PROCTOR-04 (no irreversible auto-penalty here).
  - **Late-arriving server event** (worker lag) → still ownership/auth-validated; timestamped by `occurredAt`.

## 7. Data Model & Contracts (entities, named events, APIs)
- **Entities:**
  - `ProctorEvent { eventId, attemptId, userId, type (ProctorEventType enum), severity, confidence?, source(SERVER|CLIENT|SEB), details, modelVersion?, occurredAt, recordedAt }`.
  - `Attempt.riskScore` (rolling aggregate) + `Attempt.reviewFlag` (REVIEW | CRITICAL).
  - `ProctorEventType` enum (shared contract): e.g. `NO_FACE`, `MULTIPLE_FACES`, `FACE_MISMATCH`, `LOW_CONFIDENCE`, `TAB_SWITCH`, `WINDOW_BLUR`, `SCREEN_CAPTURE`, `NETWORK_DISCONNECT`, `SEB_VIOLATION`, `DEGRADED_MODE`.
- **APIs:**
  - `POST /attempts/{attemptId}/proctor-events` (bio-exam/bio-admin exam-api) — **authenticated as the owning student**; enum + ownership enforced; rate-limited.
  - Trusted ingest path for server-side PROCTOR-02 results (service-to-service auth).
- **Consumes:** PROCTOR-02 analysis output (`{num_faces, match_score, risk_score, flags[]}`); EXAM-06 SEB violations; core→proctor active-attempt validation.
- **Emits:** `ProctorEventRaised`, `RiskScoreChanged`; may emit a **force-submit** command to EXAM-05 (policy-gated).

## 8. Out of Scope
- ML inference / frame analysis (PROCTOR-02).
- Review adjudication UI & decisions (PROCTOR-04).
- Enrollment (PROCTOR-01).
- Biometric retention/deletion (PROCTOR-05).
- Result computation/ranking (SCORE-01/02) — only the force-submit signal is emitted here.

## 9. Acceptance Criteria (checkboxes)
- [ ] Events are validated by the `ProctorEventType` enum **and** attempt ownership; **cross-student injection is blocked** (explicit regression test reproducing the prior open-injection hole).
- [ ] Client events are authenticated as the owning student; server-side (PROCTOR-02) events use service-to-service auth.
- [ ] Risk score aggregates **by severity** (rolling/incremental) and is reproducible from the event log; review/critical thresholds configurable.
- [ ] Above-threshold/critical events flag for review and/or trigger **force-submit per exam policy** (audited).
- [ ] Events are rate-limited, deduped, persisted with timestamps, and audited.
- [ ] Events for a **terminal/submitted attempt** are recorded without an invalid force-submit.
- [ ] Disconnect/degraded-mode signals are weighted so connectivity issues don't falsely inflate risk.
- [ ] `ProctorEventRaised` and `RiskScoreChanged` are emitted for downstream (PROCTOR-04, ADMIN-06).
- [ ] No raw frames / biometric images stored in the event store; India residency.

## 10. Dependencies & Open Decisions
- **Dependencies:** EXAM-02 (attempt ownership), PROCTOR-02 (analysis results), EXAM-05 (force-submit), EXAM-06 (SEB), ADMIN-06 (analytics), shared `ProctorEventType` enum (PLAT-02).
- **Open decisions (for codex):**
  - **Severity weights + review/critical thresholds** (per exam type/policy).
  - **Force-submit policy** per exam (which events/score force-submit vs flag-only; always-human vs auto).
  - **Which client detectors to trust and how to weight them** (client signals are spoofable — weight below server-side analysis; possibly corroborate).
  - Dedupe windows + rate limits per event type.
  - **Boundary note:** "theirs" (PRD-20) emitted `ProctorEventRaised`/`RiskScoreChanged` from the proctor service alongside frame analysis. Here, secure ingest + aggregation + these emissions are owned by this PRD (bio-exam/bio-admin exam-api as the ownership authority + bio-proctor for server-side analysis events); PROCTOR-02 only emits `ProctorFrameAccepted/Rejected`.

## 11. Success Metrics
- **0 spoofed/cross-student events** accepted (hard gate).
- Review precision (flagged → confirmed by reviewer); force-submit false-positive rate.
- Event counts by type; risk-band distribution; dedupe/rate-limit effectiveness.
- 0 invalid force-submits on terminal attempts.

## 12. Risks & Mitigations
- **Risk:** Recurrence of cross-student event injection. **Mitigation:** enum + ownership/auth on every ingest; dedicated regression test; audit security rejections.
- **Risk:** False positives harm students (esp. from spoofable client detectors / connectivity). **Mitigation:** severity weighting (server > client), human review (PROCTOR-04), no irreversible auto-penalty; degraded/disconnect down-weighted.
- **Risk:** Improper force-submit on a finished attempt. **Mitigation:** terminal-state guard; policy-gated + audited.
- **Risk:** Event flood degrades the store. **Mitigation:** per-attempt rate-limit + dedupe; idempotent ingest.
- **Risk:** Inconsistent/non-reproducible risk score. **Mitigation:** deterministic aggregation reproducible from the persisted event log.

---

## 13. Final Codex Augmentation — Risk Event Contract Graduation

- Cross-repo v1 proctor events are `ProctorEventRaised` and `RiskScoreChanged`.
- `RuntimeIntegritySignalRaised` remains internal to bio-exam/bio-admin unless a second repo consumes it.
- Proctor API cannot trust browser-supplied attempt ownership; every event must validate service auth or runtime-issued attempt capability plus current attempt state.
- Duplicate, late, or replayed risk events must be idempotent and keep audit trail correlation ids.
