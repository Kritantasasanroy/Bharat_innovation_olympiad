# PRD-PLAT-02: Shared Contracts, Events & Cross-Repo Interfaces
- **Final primary project:** all four repos / foundation track | **Impacted projects:** bio-portal, bio-admin, bio-exam, bio-proctor | **Phase:** P0 Foundation | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-PLAT-02-shared-packages.md + docs/prds/phase-0-foundation/PRD-01-shared-contracts-events.md

## 0. Final Ownership & Service Boundary

- **Final primary project:** all four repos / foundation track
- **Impacted projects:** bio-portal, bio-admin, bio-exam, bio-proctor
- **Deploy cadence:** foundation; applies to all deployment cadences
- **Final boundary note:** Define shared contract packages and event families consumed by all four services.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Commerce, exam-runtime, admin, and proctor services must exchange registrations, exam snapshots, attempt state, proctor events, and payment states across **four repos**. Without explicit, versioned, security-classified contracts, cross-service integration is fragile and security-sensitive fields (answer keys, raw proctor model output, payment secrets) leak into student-facing payloads.

**Goal:** one shared kernel that keeps all repos type-safe and DRY — API envelope, canonical domain contracts (exam package, slot catalog, entitlement) and the **canonical cross-repo event catalog** (§7), framework-agnostic auth (`auth-kit`), and shared UI (`ui-kit`). One source of truth for every cross-service shape; zero duplicated DTOs; no untyped cross-service JSON.

## 2. Users & Personas
- **All app/service teams** (bio-admin, bio-exam, bio-portal, bio-proctor) import these packages.
- **QA / integration workbench** — runs producer/consumer contract fixtures.
- **Security** — relies on the public/private field classification to prevent leaks.

## 3. User Stories
- As an exam-api dev, I import the published `ExamPackage`/`ExamSnapshot` contract so I consume exactly what admin publishes (key-stripped).
- As a portal dev, I import `auth-kit` to verify a session and extract role + consent claims without re-implementing token logic or coupling to a DB.
- As a frontend dev, I use `ui-kit` so exam-web and student-portal share design tokens/components/theme.
- As an integration engineer, I rely on an event with a versioned envelope and reject any payload whose **major** version I don't understand.
- As a security reviewer, I can prove the student exam-session contract cannot carry `isCorrect`/`correctAnswer`/`explanation` before result release.

## 4. Functional Requirements

### FR-1 — `shared-types` package
- API **response envelope**, canonical **error codes**, pagination shape, common DTOs, standard log/trace envelope (consumed by PLAT-04).
- Zero runtime deps beyond Zod; tree-shakeable.

### FR-2 — `domain-contracts` package
- Versioned schemas + Zod validators (OpenAPI/JSON-Schema-compatible) for: `ExamPackage` / `ExamSnapshot` (**key-stripped**), `SlotCatalog`, `Entitlement` (≙ confirmed paid `ExamRegistration`), plus all domain **events** (§7).
- Contract groups (folder layout):
  ```text
  contracts/http/student-auth
  contracts/http/slot-booking
  contracts/http/payment
  contracts/http/admin-content
  contracts/http/exam-runtime
  contracts/http/proctor
  contracts/events/commerce
  contracts/events/admin
  contracts/events/runtime
  contracts/events/proctor
  contracts/shared/value-objects
  ```
- Every schema carries: description, examples, explicit **public/private classification** (FR-5), and a **version**.
- Zero runtime deps beyond Zod; tree-shakeable.

### FR-3 — `auth-kit` package
- Framework-agnostic **core** + Elysia and Next adapters.
- Provides: token issue/verify, session model, RBAC guard helpers, OTP challenge interface, consent-claim helpers, and the **deny-by-default authorization policy interfaces** (full spec in PLAT-05; this package is their home): `canBookSlot`, `canPayForReservation`, `canStartAttempt`, `canEditQuestion`, `canPublishExam`, `canViewProctorReport`.
- **No DB driver dependency** — persistence (refresh-token store, user lookup) injected by the consuming service.

### FR-4 — `ui-kit` package
- Design tokens, primitives, theme (light/dark), shared form components. React-only (portal is Next/React, exam-web is Vite/React — aligned).

### FR-5 — Security field classification
Every field/schema is tagged with one of: `public`, `authenticated-student`, `admin-only`, `service-internal`, `biometric/sensitive`, `payment-sensitive`.
Student-facing contracts MUST NEVER include: answer keys, correct-option flags, `explanation` (pre-release), raw proctor model details, admin/audit internals, payment secrets.

### FR-6 — Key value-object identities
Branded ID types (no raw strings across the wire):
`StudentId`, `GuardianId`, `MobileNumberE164`, `ExamSeriesId`, `ExamSlotId`, `SeatReservationId`, `RegistrationId`, `PaymentOrderId`, `RazorpayOrderId`, `ExamSnapshotId`, `AttemptId`, `ProctorEventId`.

### FR-7 — Event envelope (all events)
```text
eventId · eventType · eventVersion · occurredAt · producer ·
correlationId · causationId · idempotencyKey · payload
```

### FR-8 — Versioning & compatibility
- SemVer per contract + a single `CONTRACT_VERSION` constant checked across repos.
- Additive **optional** fields = minor; removing/renaming = **major**. Consumers reject unknown **major** versions.
- Contract tests run **producer and consumer fixtures**; an event **fixture exists for every event type**.
- Version event **families**, not every tiny endpoint, to avoid over-versioning.

### FR-9 — Generated clients
- Generate type-safe HTTP clients from contracts where useful (cross-repo seams: slot-catalog, registration/entitlement, proctor).

## 5. Non-Functional (perf, security, scale, DPDP)
- **Security:** classification enforced by schema; `ExamPackage`/`ExamSnapshot` validator rejects any payload containing `correctAnswer`/key/`isCorrect`/`explanation` (pre-release). Payment-sensitive and biometric fields never serialize into student/admin-readable contracts.
- **Perf/footprint:** tree-shakeable; zero runtime deps beyond Zod in `shared-types`/`domain-contracts`; `auth-kit` carries no DB driver.
- **DPDP:** consent-claim shape standardized in `auth-kit`; biometric fields classified `biometric/sensitive` and excluded from non-proctor contracts.
- **Scale:** contract layer is stateless/compile-time; no runtime hot path.

## 6. Flows, States & Edge Cases
- **Contract change flow:** bump version → consumers update → CI `CONTRACT_VERSION` gate. Edge: portal/proctor lags a contract bump → gate blocks deploy with a clear diff.
- **Unknown major version received:** consumer rejects (fail-closed) rather than best-effort parse.
- **Additive evolution:** new optional field → minor bump → old consumers unaffected (forward-compatible).
- **Distribution edge:** during Phase 0 a workspace package is acceptable; once published privately, a stale local copy is prevented by the version gate.

## 7. Data Model & Contracts (entities, named events, APIs)

### Entities (key-stripped where student-facing)
`ExamPackage`/`ExamSnapshot` (immutable, no keys), `SlotCatalog`, `Entitlement`/`ExamRegistration`, plus the value-object IDs (FR-6).

### Canonical cross-repo event catalog (use verbatim — single source of truth)
**bio-portal → bio-exam:**
`RegistrationConfirmed`, `RegistrationCancelled`.

**bio-portal → bio-admin:**
`StudentProfileCompleted`, `GuardianConsentCaptured`, `SeatReservationHeld`, `SeatReservationExpired`, `PaymentCaptured`, `RefundProcessed`, plus reporting copies of `RegistrationConfirmed` / `RegistrationCancelled`.

**bio-admin → bio-portal:**
`ExamSlotPublished`, `ExamSlotCapacityChanged`, `ExamSlotClosed`, public `ExamSnapshotPublished` metadata for catalog/admit-card display.

**bio-admin → bio-exam:**
`ExamSnapshotPublished` (key-stripped immutable snapshot), `ExamSlotRuntimeWindowChanged`, `ResultReleasePaused` / `ResultReleaseResumed` operational signals where needed.

**bio-exam → bio-admin:**
`attempt.started`, `answer.saved` (aggregate/telemetry only where needed), `attempt.submitted`, `attempt.auto_submitted`, `runtime.integrity_signal_raised`.

**bio-exam → bio-proctor:**
`ProctorSessionRequested`, `FrameAnalysisRequested`, attempt/session validation context.

**bio-proctor → bio-exam:**
`FaceEnrollmentCompleted`, `ProctorFrameAccepted`, `ProctorFrameRejected`, `ProctorEventRaised`, `RiskScoreChanged` where runtime needs live integrity status.

**bio-proctor → bio-admin:**
`RiskScoreChanged`, `ProctorReportFinalized`, biometric deletion/proof events.

**bio-admin internal:**
`attempt.scored`, `result.release_scheduled`, `result.released`, `certificate.issued`.

> Terminology: the confirmed **paid registration IS the entitlement**. `RegistrationConfirmed` (portal) is imported by `bio-exam` as `ExamRegistration` and gates attempt start. `bio-admin` receives a reporting/audit copy but does not sit in the exam-start hot path.
>
> **Reconciliation with theirs (superset note):** the other set listed additional fine-grained events — `PaymentOrderCreated`, `PaymentFailed`, `RefundInitiated` (commerce); `QuestionCreated`, `QuestionVersionApproved`, `PaperApproved`, `ResultReleaseScheduled` (admin); `AttemptStarted`, `AnswerSaved`, `AttemptSubmitted`, `AttemptAutoSubmitted`, `AttemptScored`, `ResultReleased`, `RuntimeIntegritySignalRaised` (runtime). These remain valid **internal** event names within their owning repo unless promoted here as canonical cross-repo contracts.

### Producer/consumer map
- This PRD **defines** the contracts; ADMIN-04 **produces** `ExamSnapshotPublished`/`ExamSlot*`; PORTAL-04/05/07 produce the commerce events; EXAM-00/02 **consume** `RegistrationConfirmed`→`ExamRegistration`; PROCTOR-* produce proctor events consumed by `bio-exam` for live runtime status and by `bio-admin` for review/results/ops.

### APIs
- No service endpoints here; this is the schema/contract substrate other PRDs build on. Generated clients (FR-9) wrap those endpoints.

## 8. Out of Scope
- Business logic (lives in services).
- Concrete per-service DB schema (PLAT-03 lists DBs; each service owns its tables).
- Concrete security policy *implementation/threat model* (PLAT-05) — only the policy **interfaces** live in `auth-kit` here.

## 9. Acceptance Criteria
- [ ] All four packages (`shared-types`, `domain-contracts`, `auth-kit`, `ui-kit`) published/consumable by `bio-portal`, `bio-admin`, `bio-exam`, and `bio-proctor`.
- [ ] `ExamPackage`/`ExamSnapshot` validator rejects any payload containing a `correctAnswer`/key field (test).
- [ ] Student exam-session contract excludes `isCorrect`, `correctAnswer`, and `explanation` before result release (test).
- [ ] `auth-kit` verifies a token + extracts role + consent claims with **no DB coupling**.
- [ ] Contract-version mismatch fails CI (`CONTRACT_VERSION` gate).
- [ ] Contract package contains schemas for the Phase-1 commerce flow.
- [ ] CI runs schema validation + producer/consumer contract tests.
- [ ] An event **fixture exists for every event type** in the canonical catalog (§7).
- [ ] Every schema carries description, examples, explicit public/private classification, and version.

## 10. Dependencies & Open Decisions
- **Depends on:** PLAT-01.
- **Open — distribution:** published private package vs git submodule/subtree (PLAT-01 §10). Recommendation: private package by Phase 1 end.
- **Open — validator lib:** Zod v4 vs valibot.
- **Open — cross-repo auth mechanism:** `auth-kit` shared library (this pass) vs token introspection across a contract boundary / signed student-id claims (theirs). Decides the concrete identity seam (README §11.3) — coordinate with PLAT-05 and AUTH-04/05.
- **Open — sub-event graduation:** which intra-repo sub-events (e.g. `PaymentFailed`, `ResultReleased`, `RuntimeIntegritySignalRaised`) become cross-repo contract events vs stay internal.

## 11. Success Metrics
- 0 duplicated DTO definitions across repos.
- 100% of cross-repo payloads validated by a shared schema (target by Phase 3).
- 0 untyped cross-service JSON payloads.
- 100% of event types have a contract fixture.

## 12. Risks & Mitigations
- **Over-versioning too early** → version event families, not every endpoint.
- **Security-sensitive field leak into student contracts** → mandatory field classification + a CI test asserting forbidden keys are absent from student-facing schemas.
- **Contract drift across 3 repos** → single `CONTRACT_VERSION` + producer/consumer fixtures + deploy gate.
- **Distribution friction (private registry setup)** → workspace package bridge in Phase 0; migrate before Phase 1 ends.
- **Auth-mechanism ambiguity blocking portal/proctor** → resolve §10 cross-repo auth decision before AUTH PRDs land.

---

## 13. Final Codex Augmentation — O4 Event Transport Locked

- Cross-repo event transport v1 = **transactional outbox + idempotent consumers**.
- Each repo writes business state and outbox row in the same DB transaction; worker publishes envelope to shared stream/queue; consumers checkpoint by `eventId` + `idempotencyKey`.
- Signed webhooks remain external/vendor seams (`Razorpay`, future vendors) or adapter fallback, not the primary internal contract.
- Graduated cross-repo v1 events:
  - Admin/core → portal: `ExamSlotPublished`, `ExamSlotCapacityChanged`, `ExamSlotClosed`, `ExamSnapshotPublished`.
  - Portal → core: `RegistrationConfirmed`, `RegistrationCancelled`, `RefundProcessed`.
  - Proctor → core: `FaceEnrollmentCompleted`, `ProctorEventRaised`, `RiskScoreChanged`.
  - Ops: `OpsIncidentDeclared`, `OpsBannerChanged`, `OpsControlExecuted`.
- Internal-for-now events: `PaymentFailed`, `ResultReleased`, `RuntimeIntegritySignalRaised`; expose read models or projections before graduating them.
- `AttemptSubmitted` is one event with `submitReason = USER | AUTO_TIMER | ADMIN_FORCE | SYSTEM_RECOVERY`.
- Contract fixtures must include outbox envelope examples, duplicate-delivery examples, unknown-major rejection examples, and replay examples.
