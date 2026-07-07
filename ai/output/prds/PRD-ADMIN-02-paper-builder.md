# PRD-ADMIN-02: Paper & Exam Blueprint Builder, Review & Approval
- **Final primary project:** bio-admin | **Impacted projects:** bio-exam | **Phase:** P2 Admin/Curator | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-ADMIN-02-paper-builder.md + docs/prds/phase-2-admin-ops/PRD-11-paper-builder-review.md

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-admin
- **Impacted projects:** bio-exam
- **Deploy cadence:** admin/curation/results/ops; low baseline outside exams, scale for authoring/results/ops
- **Final boundary note:** Paper assembly and marking policy are admin-owned; exam consumes key-stripped published snapshots.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Assemble vetted, **approved question versions** into exam papers — sections, ordering, marks, timing, **data-driven marking rules** — per class band, with a review/approval workflow and **immutable approved paper versions** before scheduling (ADMIN-03) and publication (ADMIN-04). Goal: a deterministic, scorable exam definition (blueprint) that reconciles totals, exposes no keys to students, and is locked to specific question versions at approval time.

## 2. Users & Personas
- **Content Curator / Content Admin** — builds papers, submits for review.
- **Reviewer** — previews (incl. answer-key view), approves or requests changes with comments.
- **Super Admin** — may approve in pilot with audit trail (production keeps reviewer/author separation).

## 3. User Stories
- As an admin, I create an exam/paper with sections and add questions by direct pick or **blueprint rule** (N from tag/difficulty/subject), referencing specific `questionVersionId`s at lock time.
- As an admin, I set per-exam **marking config** (per-type marks, negative marking per type, partial-credit policy, rounding).
- As an admin, I set total marks, duration, eligible class bands, language policy, and SEB/proctor-required flags.
- As an admin, I see the difficulty/topic distribution and live marks-total validation as I build.
- As a reviewer, I preview the paper (admin view with keys; student view without) and the exact runtime snapshot preview, then approve or request changes with comments.
- As a reviewer, my approval creates an **immutable paper version** that becomes schedulable.

## 4. Functional Requirements
- **FR-1 (Paper creation):** Paper/Exam CRUD with fields: title, exam series, class band(s), duration (minutes), total marks, instructions, language, sections (ordered), scoring/marking policy, SEB-required + proctor-required flags.
- **FR-2 (Question selection):** add **only APPROVED question versions**, by direct pick or **blueprint rules** (count by tag/difficulty/subject); prevent duplicate question version unless explicitly allowed; drag/drop ordering; show difficulty/topic distribution and marks-total validation. Randomization policy: **fixed order initially**, per-attempt randomization later (coordinate with EXAM-03).
- **FR-3 (Marking config — data-driven):** per-type marks/negative-marks, partial-credit policy for multi-select, rounding rule — **no hardcoded marking** (fixes prior inconsistency). Marking config travels into the published snapshot (ADMIN-04) and is the sole source for scoring (SCORE-01).
- **FR-4 (Validation rules):** total marks = sum of question marks (incl. `marksOverride`); duration > 0 and within configured range; ≥1 section and ≥1 question; all questions match class-band + language policy; **all used question versions are APPROVED**; no missing keys; min/max question counts respected.
- **FR-5 (Review workflow):** curator submits for review; reviewer sees paper preview + answer-key view; reviewer approves or requests changes with comments; **approval creates an immutable paper version**.
- **FR-6 (Preview modes):** admin private preview (with keys); student preview (no keys); **runtime snapshot preview** showing the exact student contract.
- **FR-7 (Status workflow):** `DRAFT → READY_FOR_REVIEW → APPROVED → SCHEDULED → PUBLISHED → ARCHIVED`; `READY_FOR_REVIEW/APPROVED → CHANGES_REQUESTED → DRAFT`. **Only APPROVED is schedulable** (ADMIN-03); SCHEDULED/PUBLISHED paper versions cannot be changed. Every change audited.

## 5. Non-Functional (perf, security, scale, DPDP)
- **Deterministic assembly:** locked question versions at approval; the approved version is reproducible.
- **Security:** student preview and runtime snapshot preview never expose keys (test-enforced); RBAC deny-by-default; reviewer ≠ author in production.
- **Performance:** large papers (100+ questions) build, validate, and preview performantly.
- **Auditability:** every create/edit/transition/approval audited (PLAT-04); approval records `approvedBy`.

## 6. Flows, States & Edge Cases
- **Flow:** build → validate → submit for review → approve → (schedulable). 
- **Edges:** a referenced question version gets archived → block approval with a diff/guidance; blueprint rule can't satisfy requested count → warn; band/language mismatch between exam and questions → error; marks mismatch → block submit; attempt to edit a SCHEDULED/PUBLISHED paper → blocked, must fork a new version + reschedule/republish.

## 7. Data Model & Contracts (entities, named events, APIs)
- **Entities:**
  - `Paper`/`Exam { id, status, currentVersionId, bands[], examSeries }`
  - `PaperVersion`/`ExamVersion { id, paperId, versionNumber, title, durationMinutes, totalMarks, sections, markingConfig, requireSeb, requireProctor, language, status, approvedBy }`
  - `ExamSection { id, paperVersionId, title, order }`
  - `PaperQuestion`/`ExamQuestion { paperVersionId, questionVersionId, sectionId, displayOrder, marksOverride? }`
- **Contracts:** consumes the key-stripped `QuestionVersion` projection (ADMIN-01); produces the approved `PaperVersion` consumed by ADMIN-03 (scheduling) and ADMIN-04 (publish). **No cross-repo events emitted here.**
- **APIs (`admin-api`):** `POST/PATCH/GET /papers`, `POST /papers/:id/questions`, `POST /papers/:id/validate`, `POST /papers/:id/transition` (submit/approve/request-changes), `GET /papers/:id/preview?mode=admin|student|runtime`.

## 8. Out of Scope
- Scheduling/slots/pricing (ADMIN-03). Publishing/snapshot (ADMIN-04). Question authoring (ADMIN-01). Per-attempt randomization mechanics (EXAM-03).

## 9. Acceptance Criteria
- [ ] Draft paper assembled from **APPROVED** question versions; total marks reconcile (sum incl. overrides).
- [ ] Validation blocks submit on marks mismatch, missing key, non-approved question, band/language mismatch, or out-of-range duration.
- [ ] Marking rules are fully **data-driven** and applied consistently across all types.
- [ ] Only APPROVED exams are schedulable; archived-question references block approval with a diff.
- [ ] Reviewer approval creates an **immutable** paper version; SCHEDULED/PUBLISHED versions cannot be changed.
- [ ] Student preview and runtime snapshot preview never expose answer keys (test).

## 10. Dependencies & Open Decisions
- Depends on ADMIN-01 (approved questions), AUTH-04 (RBAC).
- **Open:** blueprint-rule expressiveness for v1; partial-credit policy defaults; randomized question order per attempt (here vs EXAM-03); whether super-admin self-approve is allowed in pilot only (production enforces reviewer≠author).
- **Note (theirs adds):** explicit `SCHEDULED/PUBLISHED/ARCHIVED` lifecycle states, exam-series field, instructions/language policy, runtime snapshot preview mode, duplicate-version guard, difficulty/topic distribution view, SEB/proctor flags on the paper. **Mine adds:** blueprint rules, data-driven marking config detail (partial credit/rounding), min/max question constraints.

## 11. Success Metrics
- Time to build an approved paper; review cycle time; reuse of blueprint rules.
- Validation failure categories (to improve UX); papers by status.
- 0 reconciliation errors at publish; 0 key exposures in previews.

## 12. Risks & Mitigations
- **Review process slows launch** → role presets, super-admin pilot approval with full audit trail; production keeps reviewer/author separation.
- **Marking inconsistency across types** → single data-driven marking config carried verbatim into the snapshot and consumed by scoring.
- **Silent edits to live papers** → immutable approved/published versions; edits require a new version + reschedule/republish.
