# PRD-ADMIN-01: Question Bank & Imports
- **Final primary project:** bio-admin | **Impacted projects:** — | **Phase:** P2 Admin/Curator | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-ADMIN-01-question-bank.md + docs/prds/phase-2-admin-ops/PRD-10-question-bank-imports.md

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-admin
- **Impacted projects:** —
- **Deploy cadence:** admin/curation/results/ops; low baseline outside exams, scale for authoring/results/ops
- **Final boundary note:** Question authoring, answer keys, imports, and versioning are admin-only.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Admins need a single source of truth for olympiad questions — created, versioned, tagged, reviewed, and reusable across many papers and class bands — with **answer keys that never leave the Authoring context**. Bulk imports are required so large banks can be built efficiently. Goal: a searchable, auditable question repository that produces **immutable question versions** consumed by the Paper Builder (ADMIN-02) and, after publish (ADMIN-04), by exam-runtime **without keys**. The private answer-key model is structurally separated from the student-facing/runtime projection.

## 2. Users & Personas
- **Content Curator / Content Admin** — creates/edits draft questions, sets keys, marks, tags, difficulty (cannot approve own — see review separation in ADMIN-02/AUTH-04).
- **Reviewer** — approves question versions, requests changes, manages taxonomy.
- **Super Admin** — bulk operations, taxonomy governance, archive.
- (Indirect) **Paper Builder** and **Publish pipeline** consume key-stripped question projections; **scoring-worker** consumes keys only via the audited AnswerKeyPort (ADMIN-04 / SCORE-01).

## 3. User Stories
- As a Content Curator, I can create a question of any supported type (MCQ, multi-select, true/false, short-answer, numeric) with rich text + math + media so varied olympiad items are captured.
- As a Content Curator, I can set the correct answer/key, marks, and negative marks so scoring is deterministic.
- As a Reviewer, I can search/filter by class band, subject/topic, difficulty, tag, type, language, and status so I can curate.
- As a Reviewer, I can move a question through `DRAFT → READY_FOR_REVIEW → APPROVED → ARCHIVED` (with `CHANGES_REQUESTED → DRAFT`) so only vetted items reach papers.
- As an Admin, I can edit an APPROVED question and have it create a **new immutable version** (old versions unchanged) so published papers are never silently mutated.
- As a Super Admin, I can bulk-import questions (CSV/XLSX/JSON) with a validation report and bulk-tag/status/archive so large banks are manageable.
- As an Admin, I can see a question's **usage count in papers** and its full change history (who changed what, when).

## 4. Functional Requirements
- **FR-1 (Create/edit):** CRUD for questions; types `MCQ`, `MULTI_SELECT`, `TRUE_FALSE`, `SHORT_ANSWER`, `NUMERIC`. Per-question fields: class band(s) (multi), subject/topic, tags, type, difficulty, stem/text (rich text + LaTeX/math + image), options with **per-option correctness** (objective types), correct answer/key, marks, negativeMarks, explanation, private review note, language, optional per-question time limit.
- **FR-2 (Versioning):** every edit creates a new version or updates the working draft; **APPROVED versions are immutable**; editing an APPROVED question forks a new `DRAFT` version linked to lineage. Papers reference a specific `questionVersionId`, never the mutable `questionId`. History/audit view shows who changed what and when.
- **FR-3 (Status workflow):** `DRAFT → READY_FOR_REVIEW → APPROVED → ARCHIVED`; `READY_FOR_REVIEW/APPROVED → CHANGES_REQUESTED → DRAFT`. Transitions are role-gated (deny-by-default) and audited.
- **FR-4 (Answer-key privacy):** keys/`optionsPrivate`/`answerKeyPrivate` visible only to authorized Authoring roles; **every answer-key view is audited**; student/runtime public contracts never include `isCorrect` or `correctAnswer` (enforced by the publish key-strip, ADMIN-04). SUPPORT role cannot view keys.
- **FR-5 (Media):** media upload to object storage via signed URLs; store reference, not blob; serve via CDN.
- **FR-6 (Search/filter):** filter by class band, subject/topic, difficulty, type, status, language, tags; full-text search on stem/text + tags; show **usage count in papers**; sort + pagination.
- **FR-7 (Bulk import):** admin uploads file (CSV/XLSX/JSON) → `admin-worker` validates rows asynchronously → **row-level validation report**. Default is all-or-nothing (no partial commit) unless the admin explicitly chooses a **valid-rows-only** mode. Sample import templates + preflight validation provided.
- **FR-8 (Duplicate detection):** warn on near-identical items by normalized text + class band + topic.
- **FR-9 (Integrity):** a question version referenced by any paper or published exam cannot be hard-deleted — archive only.

## 5. Non-Functional (perf, security, scale, DPDP)
- **Security:** answer keys readable only by Authoring roles; never serialized into any exam-runtime- or portal-bound payload (structurally guaranteed by ADMIN-04 key-strip + `domain-contracts` validator). RBAC + permission check on every mutation and every key read; deny-by-default.
- **Auditability:** every create/edit/status-change/key-view recorded (who, when, before/after diff where safe) — feeds PLAT-04 audit trail; mandatory audit events: question created/edited/deleted, answer key viewed/edited, status transition.
- **Performance:** search < 300 ms p95 over 100k questions; media via CDN; import processed off the request path by `admin-worker`.
- **Integrity/scale:** versions immutable once APPROVED; a version used in a published exam is archive-only.
- **DPDP/residency:** content stored in India region; no student PII in question content.

## 6. Flows, States & Edge Cases
- **States:** `DRAFT → READY_FOR_REVIEW → APPROVED → ARCHIVED`; `CHANGES_REQUESTED → DRAFT`; edit-of-APPROVED → new linked `DRAFT` version.
- **Edges:** editing a question already in a published exam → blocked with guidance to create a new version + republish; bulk-import partial failure → row-level error report, nothing committed unless valid-rows-only mode chosen; media upload failure → question saved without media, flagged incomplete; duplicate stem on create/import → warn (non-blocking); attempt to delete a referenced version → blocked, offer archive.

## 7. Data Model & Contracts (entities, named events, APIs)
- **Entities:**
  - `Question { id, status, currentVersionId, createdBy, createdAt }`
  - `QuestionVersion { id, questionId, versionNumber, classBands[], type, difficulty, text, optionsPrivate, answerKeyPrivate, marks, negativeMarks, tags[], language, status, createdBy, approvedBy }`
  - `QuestionOption`, `Tag`, `Subject` (or `Topic`). Keys + `optionsPrivate`/`answerKeyPrivate` are **Authoring-only columns** on `QuestionVersion`.
- **Contracts:** exposes a **key-stripped `QuestionVersion` projection** to the Paper Builder (ADMIN-02); full version with key only within `admin-api`. **No outbound cross-repo events here** — publish (ADMIN-04) handles propagation; keys reach scoring only via the internal audited `AnswerKeyPort`.
- **APIs (`admin-api`, in/http):** `POST/PATCH/GET /questions`, `POST /questions/:id/transition`, `POST /questions/import`, `GET /questions/import/:jobId` (validation report), `GET /questions?filters`.

## 8. Out of Scope
- Auto item-generation / AI authoring (future). Psychometrics / item-difficulty calibration from response data (future, post-Results). Paper assembly (ADMIN-02). Scheduling/pricing (ADMIN-03). Publishing (ADMIN-04).

## 9. Acceptance Criteria
- [ ] All five question types creatable, editable, scorable with keys + negative marks.
- [ ] Curator can create a draft question; reviewer can approve a question version.
- [ ] Editing/approving an APPROVED question yields a new immutable version; prior versions and in-place approved versions cannot be mutated.
- [ ] Search/filter by band/subject/difficulty/type/status/language/tags returns correct, paginated results < 300 ms p95; usage-count shown.
- [ ] Status transitions are role-gated (deny-by-default) and audited.
- [ ] A question version used in a paper/published exam cannot be deleted, only archived.
- [ ] Bulk import validates per-row with useful errors; rejects invalid rows; no partial commit unless valid-rows-only chosen; sample templates exist.
- [ ] Answer key is **absent from student/runtime contract fixtures** (verified by test); every answer-key access creates an audit log; SUPPORT role gets 403 on key endpoints.

## 10. Dependencies & Open Decisions
- Depends on object storage (PLAT-03), admin RBAC (AUTH-04), shared contracts (PLAT-02).
- **Open:** math rendering (KaTeX vs MathML); canonical CSV/XLSX import schema + template; subjects/topics as a fixed taxonomy vs free tags; duplicate-detection normalization algorithm + threshold; multi-language content model (per-version `language` vs linked translation set).
- **Note (theirs adds):** worker-based async import + validation report, XLSX support, usage-count, explicit `CHANGES_REQUESTED` state, mandatory key-view auditing — all merged in. **Mine adds:** numeric/short-answer scoring keys, per-question time limit, archive-only integrity for referenced versions, key-strip linkage to ADMIN-04.

## 11. Success Metrics
- Time to author a vetted question (target < 3 min median); time from draft → approved.
- Questions by status; import success/error rate; duplicate-detection count.
- % questions reused across ≥2 papers.
- **Zero answer-key leakage incidents** (keys in any non-admin payload) — hard gate.

## 12. Risks & Mitigations
- **Key leakage into runtime/portal payloads** → structural key-strip at publish + contract validator that rejects any key field + fixture tests (hard gate).
- **Poor import template causes content-ops delays** → sample templates, preflight validation, row-level error report, valid-rows-only fallback.
- **Silent mutation of live content** → APPROVED immutability + new-version-on-edit + block edits to published-referenced versions.
- **Over-broad key visibility** → deny-by-default RBAC, audited key reads, SUPPORT excluded.
