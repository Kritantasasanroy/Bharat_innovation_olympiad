# PRD-ADMIN-04: Exam & Slot-Catalog Publishing (Immutable Key-Stripped Snapshots)
- **Final primary project:** bio-admin | **Impacted projects:** bio-exam, bio-portal | **Phase:** P2 Admin/Curator | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-ADMIN-04-publishing.md + docs/prds/phase-2-admin-ops/PRD-13-publish-exam-snapshots.md

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-admin
- **Impacted projects:** bio-exam, bio-portal
- **Deploy cadence:** admin/curation/results/ops; low baseline outside exams, scale for authoring/results/ops
- **Final boundary note:** Admin publishes immutable key-stripped exam snapshots to exam and public slot/catalog projections to portal.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Decouple authoring from consumption via an **immutable, versioned, key-stripped publish-snapshot**, so live exam runtime never reads mutable admin drafts. Publishing an approved paper + published slot produces (a) an **ExamPackage / ExamSnapshot** (questions, options, marks, marking config, timing, slot metadata — **answer keys stripped**) for exam-runtime, and (b) a **SlotCatalog** projection for the portal. Answer keys stay in Authoring and reach scoring **only** via an internal audited port. This **structurally prevents answer-key exposure** and guarantees that later authoring edits never mutate a live exam. Delivery to runtime is reliable, idempotent, and traceable from a runtime question back to its source question version.

## 2. Users & Personas
- **Super Admin / Publisher** — triggers publish; re-auth required (dangerous action, AUTH-04).
- **Reviewer** — confirms approval before publish.
- Downstream consumers: **exam-runtime** (`exam-api`/`exam-worker`), **bio-portal** (catalog), **scoring-worker** (keys via `AnswerKeyPort` only).

## 3. User Stories
- As a publisher, I publish an approved exam + slot; exam-runtime imports the immutable snapshot (no keys) and the portal lists its open slots.
- As the platform, the exam students see is an **immutable snapshot** pinned per version — later authoring edits never mutate a live/in-progress exam.
- As scoring, I retrieve answer keys + scoring policy from Authoring via an internal, audited interface — never from the student-facing store or the package.
- As an admin, I can see publish + runtime-import status on the slot page, and a slot cannot open for attempts until runtime import succeeds.
- As a publisher, corrections require a **new snapshot version** with an explicit migration policy (no silent mutation).

## 4. Functional Requirements
- **FR-1 (Publish exam → ExamPackage/ExamSnapshot):** from an APPROVED paper version + published slot + admin actor, produce a versioned, signed snapshot containing `QuestionSnapshotPublic` (question id within snapshot, text, options **without correctness flags**, marks, negative marks, section/order), `ExamRuntimePolicy` (duration, SEB/proctor required, timing), and slot metadata — **keys stripped**. Written to the exam-runtime read store; cached (Redis).
- **FR-2 (Publish slots → SlotCatalog):** open slots + capacity + price tiers → portal-consumable projection; updated on slot open/close/capacity-change (interlocks with ADMIN-03 events).
- **FR-3 (Immutability):** snapshot records cannot be modified after publish; a published version is frozen; **live attempts are pinned** to their version; corrections require a new snapshot version + explicit migration policy. Runtime attempts reference `snapshotId`.
- **FR-4 (Key custody — private scoring projection):** produce `AnswerKeySnapshotPrivate` (answer keys + scoring/marking policy) retained **only in Authoring**; access restricted to the scoring worker/service via the internal audited **`AnswerKeyPort`**; **never** included in `ExamPackage` or any portal payload.
- **FR-5 (Delivery — transactional outbox + idempotent import):** admin **outbox writes `ExamSnapshotPublished` in the same transaction** as the snapshot; runtime consumer imports the snapshot **idempotently** (replayable); import status visible on the admin slot page; **slot cannot be opened for attempts until runtime import succeeds**. Also emit/maintain `slot.opened/closed` + `pricing.updated` linkages for the catalog (canonical slot events `ExamSlotPublished/CapacityChanged/Closed` owned by ADMIN-03).
- **FR-6 (Unpublish/withdraw):** unpublish/withdraw with guards — **no withdraw of an exam with in-progress attempts**; controlled snapshot replacement only before attempts start.
- **FR-7 (Traceability):** runtime question ↔ source `questionVersionId` mapping retained for audit; signature/version recorded.

## 5. Non-Functional (perf, security, scale, DPDP)
- Publish is **atomic + audited**. `ExamPackage` is validated against `domain-contracts` and **rejects any key field** (`isCorrect`/`correctAnswer`/`answerKeyPrivate`). Catalog/snapshot propagation within a few seconds. Signature verified on consume; mismatch → reject + alert. India residency for snapshot + key stores.
- **Security (hard gate):** answer keys never serialized into any runtime/portal payload; key access only via `AnswerKeyPort`, every access audited; publish/withdraw are dangerous actions requiring re-auth.

## 6. Flows, States & Edge Cases
- **Flow:** approve (ADMIN-02) → publish (ADMIN-03 slot + ADMIN-04 package) → outbox `ExamSnapshotPublished` → runtime idempotent import → import success → slot openable.
- **Edges:** republish while attempts in progress → new version applies to **new attempts only**, in-progress pinned; slot closes → catalog entry removed but existing entitlements/attempts honored; signature mismatch on consume → reject + alert; runtime import failure → slot stays non-openable, retried idempotently, surfaced in admin UI; late content correction → controlled new-version replacement before attempts start (no silent mutation).

## 7. Data Model & Contracts (entities, named events, APIs)
- **Entities/projections (defined in `domain-contracts`, PLAT-02):** `ExamPackage`/`ExamSnapshot { snapshotId, examId, paperVersionId, slotId, version, signature, questions[], runtimePolicy, slotMeta }`, `QuestionSnapshotPublic`, `AnswerKeySnapshotPrivate` (Authoring-only), `SlotCatalog`, `ExamRuntimePolicy`.
- **Named events:** **`ExamSnapshotPublished`** (bio-admin admin → consumers, emitted via transactional outbox; key-strip enforced). Catalog slot events (`ExamSlotPublished/CapacityChanged/Closed`) owned by ADMIN-03; internal `exam.published`/`pricing.updated` linkages as needed.
- **Ports/APIs:** internal audited **`AnswerKeyPort`** (admin-api → scoring-worker, SCORE-01). `POST /publish` (exam+slot), `POST /unpublish` (guarded), `GET /slots/:id/publish-status`. Consumed by EXAM-02 (attempt serving) + PORTAL-02 (catalog).

## 8. Out of Scope
- Booking (PORTAL). Attempt serving/gate (EXAM-02). Scoring math (SCORE-01). Slot lifecycle/capacity rules (ADMIN-03).

## 9. Acceptance Criteria
- [ ] Published `ExamPackage`/student snapshot contains **no** answer keys (contract validator + fixture test) — hard gate.
- [ ] Publishing creates an **immutable** snapshot; runtime import is **idempotent/replayable**; `ExamSnapshotPublished` written via outbox in the same transaction.
- [ ] exam-runtime serves the published exam and portal lists open slots within seconds.
- [ ] **Attempt can only start against a successfully imported snapshot**; admin UI shows publish/import status.
- [ ] Republish creates a new version; live/in-progress attempts stay pinned; withdraw blocked while attempts in progress.
- [ ] Answer keys + scoring policy retrievable **only** via the audited `AnswerKeyPort` by scoring; every access audited.

## 10. Dependencies & Open Decisions
- Depends on ADMIN-02/03, `domain-contracts` (PLAT-02), runtime consumer (EXAM-02), portal catalog (PORTAL-02).
- **Open:** delivery mechanism specifics (outbox→consumer vs published read view) and cross-repo transport (queue vs signed webhook — README §11.4); signing scheme/key management; snapshot migration policy for corrections; whether catalog and snapshot publish are one transaction or two coordinated steps.
- **Note (theirs adds):** explicit named projections (`ExamSnapshot`/`QuestionSnapshotPublic`/`AnswerKeySnapshotPrivate`/`ExamRuntimePolicy`), transactional outbox + idempotent runtime import, **gate: slot not openable until import succeeds**, import-status UI, source-version traceability. **Mine adds:** Redis caching, contract validator rejecting key fields, signature-verify-on-consume + alert, withdraw guard for in-progress attempts, `AnswerKeyPort` naming.

## 11. Success Metrics
- **0 key-exposure incidents** (hard gate); publish→serve latency; snapshot import latency; runtime import failure rate; publish success rate; 0 mutations of live exams.

## 12. Risks & Mitigations
- **Answer-key exposure** → key-strip + `domain-contracts` validator + fixtures + `AnswerKeyPort`-only key access (hard gate).
- **Runtime reads a mutable/partial draft** → immutable signed snapshot, import-success gate before slot open, signature verify on consume.
- **Late content corrections** → controlled new-version snapshot replacement before attempts start; no silent mutation; explicit migration policy.
- **Lost/duplicated delivery** → transactional outbox + idempotent replayable import + reconciliation.

---

## 13. Final Codex Augmentation — Snapshot Import Gate

- `ExamSnapshotPublished` is emitted only after immutable snapshot creation and student-facing key stripping pass validation.
- Portal slot visibility may show a published slot, but exam start readiness requires runtime import success for the matching `examSnapshotId`.
- Runtime never reads mutable admin drafts; it consumes only immutable imported snapshots with contract-version compatibility.
- Snapshot publish must include replayable outbox fixture and import retry semantics.
