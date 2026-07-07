# PRD-SCORE-02: Results, Ranking & Certificates

- **Final primary project:** bio-admin | **Impacted projects:** bio-portal, bio-exam, bio-proctor | **Phase:** P5 Scoring/Results | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-SCORE-02-results-ranking-certificates.md + docs/prds/phase-3-exam-runtime/PRD-18-scoring-result-release.md (result-release half)

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-admin
- **Impacted projects:** bio-portal, bio-exam, bio-proctor
- **Deploy cadence:** admin/curation/results/ops; low baseline outside exams, scale for authoring/results/ops
- **Final boundary note:** Admin owns release/rank/certificates; portal displays released results; proctor holds can block release.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Turn scored attempts into **published** results: student score views, rankings/percentiles, and verifiable certificates — released only on an **admin-controlled** schedule, never auto-leaked. Goal: accurate, fair, contest-grade results with controlled publication, configurable disclosure, deterministic ranking, and tamper-evident certificates with public verification.

## 2. Users & Personas
- **Student / parent** — view score and result after release; download certificate.
- **Admin / Result Manager** — review aggregate results, control release per slot/series, manage ranking and disclosure, handle re-grade propagation.
- **Verifier** (employer/school/third party) — validate a certificate's authenticity via code/QR.

## 3. User Stories
- As a student, before release I see "result pending"; after release I see my score, max marks, `submittedAt`, section breakdown (if enabled), correct/incorrect breakdown (per disclosure policy), rank/percentile, and a certificate.
- As an admin, I review aggregate results and **publish them at a chosen time** per slot/series — results are never visible until I do, and the action requires permission and is audited.
- As an admin, I control whether explanations / correct answers are revealed after release (default: score only).
- As a verifier, I validate a certificate's authenticity via a public code / QR.
- As an admin, when a re-grade lands I recompute results, ranks, and reissue affected certificates, with students notified.

## 4. Functional Requirements
- **FR-1 (Results read-model).** Consume the Results read-model from SCORE-01: per-attempt `totalScore`, `maxScore`, `percentage`, and per-item correctness — with **disclosure gated by policy** (may hide keys/explanations).
- **FR-2 (Result release / publication control).** Admin releases results **per slot / series / exam**; results are **hidden until released**. Release **requires permission (RBAC) and is audited**; supports embargo / scheduled publication. Before release a student sees "result pending"; the API must **refuse** result reads pre-release.
- **FR-3 (Student result view).** After release, `exam-web`/portal shows score, max marks, percentage, `submittedAt`, section breakdown if enabled, and correctness breakdown per disclosure policy. Display **must match stored score** exactly.
- **FR-4 (Explanation / answer-key visibility).** Admin controls whether explanations / correct answers are shown after release. **Default: show score only, not the full answer key**, unless a pedagogical-review phase enables it. Pre-release the key is never exposed.
- **FR-5 (Ranking / percentile).** Compute **rank and percentile within exam + class band** (optionally school / region), on read-models, **after all scoring for the cohort is complete**. (Raw score + percentage are available immediately post-score but stay hidden until release.) **Tie-break policy is explicit and deterministic before any rank is displayed.**
- **FR-6 (Certificates).** Generate a **PDF certificate with a unique, publicly verifiable code + QR**; support **participation and merit tiers**. Provide a **public verification endpoint** that confirms authenticity and is **tamper-evident**.
- **FR-7 (Admin results management).** `admin-web` provides aggregate review, publish controls, disclosure/tier configuration, ranking management, and certificate issuance/reissue.
- **FR-8 (Re-grade propagation).** On a SCORE-01 re-grade (new result version / `attempt.scored`), recompute affected results + ranks, **reissue affected certificates**, and **notify** affected students; the propagation is audited.
- **FR-9 (Disputes / grievance).** Provide a disputes / grievance entry point linked to the audit trail (PLAT-04) for result challenges.

## 5. Non-Functional (perf, security, scale, DPDP)
- **No pre-publication leakage (audit fix).** Results, ranks, certificates, and correctness are access-controlled and **invisible until admin release**; enforced at the API, not just the UI.
- **Scale.** Ranking/percentile computed over read-models so it scales to full-cohort sizes; recompute is incremental on re-grade.
- **Security.** Certificate verification is public yet tamper-evident (signed code/QR, server-side validation); admin actions RBAC-gated and audited.
- **DPDP / residency.** Results are personal data stored and served from **India**; minors' results gated to consented guardians per AUTH-03.
- **Fairness.** Deterministic tie-breaks; disqualified attempts handled consistently in ranking.

## 6. Flows, States & Edge Cases
- **Happy path:** `attempt.scored` → results staged (hidden) → cohort fully scored → ranks/percentiles computed → admin publishes → student-visible → certificates issued.
- **Edge cases:**
  - **Re-grade after publish** → recompute results + ranks → reissue certs → notify → audit.
  - **Tie at a cutoff / merit boundary** → apply deterministic tie-break rule.
  - **Disqualified attempt** (proctor outcome) → excluded or flagged in ranking per policy; not silently ranked normally.
  - **Partial cohort scored** → publication gated until scoring complete (no partial-rank leak).
  - **Pre-release access attempt** → API returns "pending", never the score.
  - **Certificate re-verification after reissue** → old code invalidated/superseded; verification reflects current version.

## 7. Data Model & Contracts (entities, named events, APIs)
- **Entities:** `Result` (from SCORE-01); `Ranking { examId, band, userId, rank, percentile, tieBreakKey }`; `Certificate { id, userId, examId, code, tier, pdfRef, version, verifiedHash }`; `ResultRelease { examId|slotId, releasedBy, releasedAt, disclosurePolicy }`.
- **APIs:** student result read (post-release only); admin release / disclosure / ranking management; **public certificate verification** (`GET /verify/:code` or QR target).
- **Consumes:** `attempt.scored` (bio-admin internal, from SCORE-01).
- **Emits / notifies:** result-release and re-grade notifications to students (via notification channel).

## 8. Out of Scope
- Score computation and scoring strategies (**SCORE-01**).
- Proctor adjudication / disqualification decisions (PROCTOR-04) — consumed here, not decided here.
- Marketing / promotion of results.
- Manual subjective grading (future).

## 9. Acceptance Criteria (checkboxes)
- [ ] Results are invisible until admin release; **no pre-publication leakage** — API refuses pre-release reads (tested).
- [ ] Result release requires permission and is audited.
- [ ] Student result display **matches stored score** exactly (score, max, section breakdown).
- [ ] Rank/percentile correct within exam + class band; **tie-breaks deterministic** and defined before display; computed only after cohort scoring complete.
- [ ] Explanations/correct answers shown only per admin disclosure policy (default off).
- [ ] Certificates generated with **working public verification** (code + QR); tamper-evident.
- [ ] Re-grade updates results + ranks + reissues certs + notifies, fully audited.
- [ ] Disqualified attempts handled per policy in ranking.

## 10. Dependencies & Open Decisions
- **Depends on:** SCORE-01 (scored results + `attempt.scored`), ADMIN-04 (publish/permission model), AUTH-04 (admin RBAC), PLAT-04 (audit), PROCTOR-04 (disqualification input).
- **Conflict — ranking phasing (for codex):** other set split ranking into "Phase 3 basic (score + %)" then "Phase 5 rank/percentile." This pass keeps score+percentage available at scoring time (hidden) and full **rank/percentile in this PRD (Phase 5)**. Confirm whether an interim score-only release is wanted before full ranking exists.
- **Conflict — phase (for codex):** other set placed result-release in Phase 3 (P0) runtime; README places it in Phase 5. Kept Phase 5, P0.
- **Open:** answer/explanation disclosure policy specifics; tie-break rule definition; merit-tier thresholds; certificate template/branding; certificate reissue/revocation semantics (supersede vs invalidate prior code).

## 11. Success Metrics
- Result-view engagement (released results viewed).
- Certificate generations and public verifications.
- **0 pre-publication leaks.**
- Result-release time (scoring-complete → released).
- Dispute/grievance rate + resolution time.

## 12. Risks & Mitigations
- **Pre-publication leak of scores/ranks.** → Enforce access control at API; publication gate; tested negative paths.
- **Content correction after release.** → Re-grade propagation: recompute results/ranks, reissue certs, notify, audit (couples to SCORE-01 rescore).
- **Unfair/non-deterministic ranking at cutoffs.** → Explicit deterministic tie-break defined before display.
- **Certificate forgery.** → Signed verifiable code + QR, server-side tamper-evident verification, versioning on reissue.
- **Partial-cohort rank leak.** → Gate ranking/publication until cohort scoring complete.
