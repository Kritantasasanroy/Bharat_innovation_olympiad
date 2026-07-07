# PRD-PROCTOR-04: Proctor Review Console & Incident Workflow
- **Final primary project:** bio-proctor | **Impacted projects:** bio-admin, bio-exam, bio-portal | **Phase:** P6 Proctoring | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-PROCTOR-04-review-console.md + docs/prds/phase-4-proctoring/PRD-21-proctor-review-console.md

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-proctor
- **Impacted projects:** bio-admin, bio-exam, bio-portal
- **Deploy cadence:** exam-window + post-exam review/retention workers; scheduled deletion/DSR jobs may run outside windows
- **Final boundary note:** Proctor owns review workflow; admin shell may deep-link/embed; result holds flow to admin/portal.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Give proctor reviewers a console to triage flagged attempts, review **evidence** (per-attempt risk score, event timeline, match-score history, SEB/runtime-integrity signals — **not raw video**), and make **defensible, audited decisions** (clear, warn, hold result, recommend disqualification, escalate). Decisions integrate with the **result hold/release** workflow (SCORE-02). Goal: fair, auditable, privacy-preserving human review of integrity flags that feeds results/ranking and is defensible against student disputes/appeals.

## 2. Users & Personas
- **Proctor Reviewer** — triages the queue, opens attempt reports, decides + comments.
- **Support** — limited metadata view (not biometric images) and follow-up handling.
- **Super Admin** — oversight, escalation target, bulk triage, policy.
- **Student** (indirect) — subject to adjudication; protected by privacy + appeal/support workflow.

## 3. User Stories
- As a reviewer, I see attempts ranked/filterable by risk band with their event timeline and evidence.
- As a reviewer, I adjudicate — **clear / warning-only / hold result / recommend disqualification / escalate** — with a **mandatory reason/comment**.
- As a reviewer/support, I can request support follow-up, hold a result, clear a hold, or escalate to super admin.
- As an admin, **every report view and every decision is audited** and propagates to results/ranking (SCORE-02) appropriately, including post-publication re-grade/re-rank.
- As the platform, unauthorized admins cannot view proctor details or biometric evidence.

## 4. Functional Requirements
- **FR-1 (Reports queue):** List of flagged attempts (by risk/threshold from PROCTOR-03), **filterable** by slot/exam series, **risk band**, event type, attempt status, **review status**, and student/registration code. Risk-ranked ordering for triage.
- **FR-2 (Attempt report / evidence):** Per-attempt detail showing student identity summary, registration/attempt metadata, **risk-score trend**, **event timeline**, **match-score history**, SEB/tab/runtime-integrity signals, model version/confidence. **No raw video.** Frame thumbnails appear **only if flagged-frame retention is enabled and the viewer is authorized** (default off — see PROCTOR-02 §4 / §10). Evidence is fetched live from the bio-proctor report API.
- **FR-3 (Review decision / statuses):** Review status machine — `NOT_REVIEWED → CLEARED | WARNING_ONLY | RESULT_HOLD | DISQUALIFICATION_RECOMMENDED | ESCALATED`. Adjudication **actions** require a **mandatory reason**: add comment, request support follow-up, hold result, clear result hold, recommend disqualification, escalate to super admin.
- **FR-4 (Outcome propagation):** `RESULT_HOLD` blocks result release (SCORE-02 respects the hold); disqualification (on final decision) **excludes/flags the attempt in ranking** (SCORE-02) and notifies per policy. Clearing a hold releases the result.
- **FR-5 (Bulk triage / assignment / SLA):** Reviewer assignment, **bulk triage** (e.g. bulk-dismiss a systemic false-positive from a model bug), and SLA/queue tracking.
- **FR-6 (Audit & permissions):** **Every report view and decision is audited** (who, what, when, why). RBAC: `PROCTOR_REVIEWER` (and super admin) per AUTH-04; **support sees limited metadata, not biometric images** unless explicitly permitted. Unauthorized admins cannot open proctor details.
- **FR-7 (Event emission):** On a finalized decision, emit **`ProctorReportFinalized`** (proctor→core) carrying the attempt, decision/status, reviewer, and reason for SCORE-02 + audit.

## 5. Non-Functional (perf, security, scale, DPDP)
- **Security / RBAC:** Deny-by-default; `PROCTOR_REVIEWER`/super-admin gated (AUTH-04); support restricted from biometric evidence. bio-proctor report API reachable only via service-to-service auth.
- **Privacy / DPDP:** **Privacy-preserving evidence** — derived signals + metadata only; **no raw video**; thumbnails only when retention-enabled + authorized; **India residency**. Biometric-evidence access is audited (sensitive-access audit, AUTH-03/PRD-23 lineage).
- **Auditability / defensibility:** Every view + decision logged immutably; reports defensible for disputes/appeals.
- **Scale:** Queue handles high-volume slots; filtering/pagination performant.

## 6. Flows, States & Edge Cases
- **Happy path:** flagged attempt → reviewer opens report (evidence fetched from proctor API; view audited) → adjudicate with reason → status set → propagate to SCORE-02 → emit `ProctorReportFinalized`.
- **Edge cases:**
  - **Adjudication after results published** → re-grade/re-rank path (SCORE-02) + notify.
  - **Conflicting reviewers** → second-review / escalation policy; super-admin resolves.
  - **Reinstating a wrongly disqualified attempt** → reversal path, audited, re-rank + notify.
  - **Systemic false-positive** (model bug) → bulk-dismiss/clear with a single audited reason.
  - **Result release attempted while `RESULT_HOLD`** → blocked until hold cleared.
  - **Unauthorized admin** opening a report → denied + audited.
  - **No retained frames** (default) → report shows signals/timeline only; reviewer decides on derived evidence.

## 7. Data Model & Contracts (entities, named events, APIs)
- **Entities:**
  - `Adjudication { adjudicationId, attemptId, reviewerId, action, reviewStatus, reason, decidedAt }`.
  - `ReviewStatus` enum: `NOT_REVIEWED | CLEARED | WARNING_ONLY | RESULT_HOLD | DISQUALIFICATION_RECOMMENDED | ESCALATED`.
  - `ReportViewAudit { attemptId, viewerId, viewedAt, scope(METADATA|EVIDENCE|BIOMETRIC) }`.
- **APIs:**
  - bio-exam/bio-admin admin-api: list/filter flagged attempts; get attempt report (proxies bio-proctor); submit adjudication; hold/clear/escalate.
  - bio-proctor `proctor-api`: report/evidence endpoint (events, risk timeline, match history, model version) — service-to-service auth; no raw video.
- **Consumes:** PROCTOR-03 events/risk (`ProctorEventRaised`, `RiskScoreChanged`).
- **Emits:** `ProctorReportFinalized` (proctor→core) → SCORE-02 (hold/release, ranking) + notifications.

## 8. Out of Scope
- Event ingest / risk aggregation (PROCTOR-03).
- ML inference (PROCTOR-02) and enrollment (PROCTOR-01).
- Result computation (SCORE-01) — this PRD signals hold/disqualify; SCORE applies it.
- Biometric retention/deletion (PROCTOR-05).
- Student-facing appeal UX (support workflow; this PRD provides the audited decision substrate).

## 9. Acceptance Criteria (checkboxes)
- [ ] Reviewers see a **risk-ranked, filterable** queue (slot/series, risk band, event type, attempt status, review status, student code).
- [ ] Opening a report fetches proctor **events + risk timeline + match-score history** from the proctor service; **no raw video**; thumbnails only if retention-enabled + authorized.
- [ ] Adjudication **requires a reason**; actions set review status and are **audited**; decision updates the review status + audit log.
- [ ] **Result release respects `RESULT_HOLD`**; disqualification propagates to ranking + notifications (SCORE-02).
- [ ] **Post-publication adjudication** triggers re-grade/re-rank + notify.
- [ ] **Unauthorized admin cannot view proctor details / biometric evidence**; support limited to permitted metadata.
- [ ] Finalized decisions emit `ProctorReportFinalized`.

## 10. Dependencies & Open Decisions
- **Dependencies:** PROCTOR-03 (events/risk), AUTH-04 (RBAC/audit), SCORE-02 (hold/release, ranking, notifications), bio-proctor report API.
- **Open decisions (for codex):**
  - **Evidence detail level** — privacy (no/limited thumbnails) vs defensibility for disputes; when (if ever) biometric thumbnails are shown and to whom.
  - **Second-review / escalation policy** (single vs dual reviewer; super-admin override).
  - **Auto-disqualify thresholds vs always-human** review (resolution leans **always-human** for disqualification; risk only *recommends*).
  - **Reconciling decision vocabularies:** "mine" = dismiss/warn/disqualify; "theirs" = CLEARED/WARNING_ONLY/RESULT_HOLD/DISQUALIFICATION_RECOMMENDED/ESCALATED. Merged status machine adopts the richer "theirs" set (adds RESULT_HOLD + DISQUALIFICATION_RECOMMENDED + ESCALATED, mapping mine's dismiss→CLEARED, warn→WARNING_ONLY, disqualify→DISQUALIFICATION_RECOMMENDED→final disqualify via SCORE-02).

## 11. Success Metrics
- Review throughput + time-to-review; queue size by risk band; decisions by status.
- Adjudication consistency (inter-reviewer agreement); overturned-on-appeal rate; dispute defensibility.
- 100% of report views + decisions audited; 0 unauthorized evidence views.

## 12. Risks & Mitigations
- **Risk:** False positives harm students. **Mitigation:** human review, transparent policy, appeals/support workflow, always-human disqualification, bulk-correct for systemic model bugs.
- **Risk:** Privacy breach via evidence (raw video / biometric thumbnails). **Mitigation:** no raw video; thumbnails default-off + authorized-only + audited; support restricted; India residency.
- **Risk:** Indefensible/unauditable decisions in disputes. **Mitigation:** mandatory reasons, immutable audit of views + decisions, escalation path.
- **Risk:** Result released despite a hold. **Mitigation:** SCORE-02 hard-respects `RESULT_HOLD`; post-publication re-rank path.
- **Risk:** Reviewer conflict / inconsistency. **Mitigation:** second-review/escalation policy, super-admin resolution, consistency metrics.
