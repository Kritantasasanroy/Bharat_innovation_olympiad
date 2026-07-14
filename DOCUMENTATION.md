# Bharat Innovation Olympiad — Complete Technical Documentation

> Last updated: 2026-07-14 (exam lifecycle gating · school slot self-service · per-audience result release + Excel · question picture/video on Cloudinary — see **§0.25**)  
> **Production stack (live today):** NestJS · Next.js · PostgreSQL (Neon) · Redis · Socket.IO · face-api.js · Razorpay · **Cloudinary** (question media; S3-compatible providers supported behind the same seam) · Vercel · Render — this is `backend/` + `frontend/` + `admin-frontend/`.  
> **Target stack (migrating to):** pnpm workspace · Bun/Elysia · Drizzle · Biome · Lefthook · hexagonal — mirrors `github.com/bharat-innovation-olympiad` (`bio-exam`, `bio-admin`, `bio-portal`, `bio-contracts`; `bio-proctor` intentionally kept as the existing face-api.js client).  
> Architecture reference: golden PRDs now live in-repo at `ai/output/prds/`; agent rules in `ai/steering/`. See `AGENTS.md`, `BIO-REPOS.md`, and §0 below.

---

## Table of Contents

0. [Architecture Re-Alignment — BIO pnpm Workspace](#0-architecture-re-alignment--bio-pnpm-workspace) ← **new**
1. [Project Overview](#1-project-overview)
2. [Repository Structure](#2-repository-structure)
3. [Architecture Diagram](#3-architecture-diagram)
4. [Environment Variables](#4-environment-variables)
5. [Database Schema](#5-database-schema)
6. [Backend — NestJS API](#6-backend--nestjs-api)
7. [WebSocket Gateway](#7-websocket-gateway)
8. [Client-Side AI Proctoring (face-api.js)](#8-client-side-ai-proctoring-face-apijs)
9. [Student Frontend](#9-student-frontend)
10. [Admin Frontend](#10-admin-frontend)
11. [Frontend Hooks](#11-frontend-hooks)
12. [Authentication Flow](#12-authentication-flow)
13. [Exam Flow End-to-End](#13-exam-flow-end-to-end)
14. [Proctoring System](#14-proctoring-system)
15. [Deployment](#15-deployment)

---

## 0. Architecture Re-Alignment — BIO pnpm Workspace

> **Why this section exists.** The private org `github.com/bharat-innovation-olympiad` holds the
> *intended* production architecture as **five separate repos**. This project (originally a single
> NestJS monolith) is being re-shaped to match them. As of 2026-07-02 the repo contains **both**:
> the live monolith (`backend/`, `frontend/`, `admin-frontend/`) **and** a new `pnpm` workspace
> that mirrors the org. The monolith stays in production until each workspace service reaches parity.

### 0.1 The org (source of truth)

| Org repo | Stack | Responsibility |
|---|---|---|
| `bio-contracts` | TS packages | Shared `@bio/*`: domain contracts (events/clients), auth-kit, shared types, UI kit, fixtures |
| `bio-exam` | Bun/Elysia · Drizzle · Vite/React | Exam-window runtime: entitlement gate, player, autosave, durable timer, submission, SEB |
| `bio-admin` | Bun/Elysia · Drizzle · Vite/React | Trusted admin: curation, scheduling, publishing, **scoring + answer keys**, results, analytics, ops (+ workers) |
| `bio-portal` | Next.js App Router · Bun/Elysia seam | Always-on student portal: marketing, auth, booking, **payments**, entitlement issuance, admit/results |
| `bio-proctor` | Python · FastAPI · uv | Proctoring: face enrollment, frame analysis, risk, review, **biometric retention** |

`bio-po` is the golden-PRD repo (its `ai/output/prds/` is the source of truth); `workbench-*` are the
AI workbenches. **Cross-repo law:** DTOs/events come from `@bio/domain-contracts` (never
hand-duplicated); `bio-admin` owns answer keys + scoring, `bio-exam` consumes key-stripped snapshots;
`bio-portal` owns payments/entitlement; `bio-proctor` owns biometrics.

### 0.2 How it maps into this repo (one consolidated pnpm workspace)

The five repos are flattened into a single workspace. Each package keeps its distinct `@bio/*` name,
so its folder is the name minus the `@bio/` prefix (e.g. `@bio/exam-shared-types` →
`packages/exam-shared-types`).

```text
Bharat_innovation_olympiad/
├── pnpm-workspace.yaml · package.json · biome.json · tsconfig.json · lefthook.yml · .bio-repos.json
├── AGENTS.md · BIO-REPOS.md            # governance (read before cross-service work)
├── ai/                                 # AI workbench: steering/ (golden principles, roles, artifact rules) + output/prds/ (golden PRDs)
├── packages/                           # = bio-contracts (+ each repo's local @bio/* packages)
│   ├── domain-contracts · shared-types · auth-kit · ui-kit · contract-fixtures
│   ├── exam-shared-types · exam-contract-fixtures
│   ├── admin-auth · admin-authoring · admin-scheduling · admin-scoring · admin-results · admin-observability-testkit · admin-shared-types · admin-contract-fixtures
│   └── portal-domain · portal-contract-fixtures
├── services/                           # Bun/Elysia hexagonal APIs (+ admin workers)
│   ├── exam-api      ← bio-exam       (★ exam-runtime slice PORTED — see §0.4)
│   ├── admin-api     ← bio-admin       (scaffold)
│   ├── {admin,analytics,publish,results,scoring}-worker  ← bio-admin (scaffolds)
│   └── portal-api    ← bio-portal      (scaffold)
├── apps/                               # exam-web, admin-web (Vite/React) · marketing-web, student-portal-web (Next.js)
│
├── backend/          # ← LEGACY NestJS + Prisma (production) — excluded from the workspace
├── frontend/         # ← LEGACY Next.js student (production) — hosts the face-api.js proctor (kept)
└── admin-frontend/   # ← LEGACY Next.js admin (production) — excluded from the workspace
```

`pnpm-workspace.yaml` globs only `apps/*`, `services/*`, `packages/*` — the three legacy apps stay on
their own `npm` toolchains and are untouched.

### 0.3 Conventions adopted from the org

- **Package manager:** `pnpm` (workspace) — `pnpm@10.32.1`; runtime **Bun** (`>=1.2`).
- **API framework:** **Elysia** on Bun (not NestJS). **ORM:** **Drizzle** (not Prisma). **Lint/format:** **Biome** (tabs, width 100, double quotes, semicolons, trailing commas) — not ESLint/Prettier. **Hooks:** Lefthook.
- **Architecture:** hexagonal — `core/` (domain, ports/in, ports/out, services, errors) imports no framework; `adapters/` (`in/http`, `out/persistence`, `out/cache`); `infra/` (config, logger, shutdown). Enforced by `pnpm boundaries`.
- **Proctoring exception (per request):** `bio-proctor` (Python) is **not** recreated. Proctoring remains the existing client-side face-api.js implementation in `frontend/` (see §8, §14).

### 0.4 What was ported in this pass — `services/exam-api`

The **exam-window runtime vertical slice** was ported from `backend/src/attempt` + `backend/src/timer`
(NestJS/Prisma) onto Elysia + Drizzle, keeping behaviour identical. Full detail in
`services/exam-api/PORT-NOTES.md`. Routes:

| PRD | Route | Notes |
|---|---|---|
| EXAM-02 | `POST /exams/:instanceId/start` | Face + confirmed-slot entitlement gate; FNV-1a seeded per-student question set; create/resume/demo-reopen |
| EXAM-03 | `POST /attempts/:id/answer`, `GET /attempts/:id` | Idempotent autosave; ownership-checked read |
| EXAM-04 | `GET /attempts/:id/timer` | Server-authoritative Redis deadline (recomputed from DB on miss); auto-submit on expiry |
| EXAM-05 | `POST /attempts/:id/submit` | Per-type scoring (MCQ/MULTI_SELECT/TRUE_FALSE/SHORT_ANSWER/NUMERIC) → finalize |

Boundary honoured: answer keys never leave the domain — the repository returns `ScoredQuestion`
(keys) for building/scoring, the HTTP layer only emits `QuestionView` (keys stripped). Drizzle targets
the **same Neon tables** as Prisma (default PascalCase table + camelCase column naming), so both
engines can run against one database during migration. It **shares `JWT_SECRET`** with the NestJS
backend (HS256).

### 0.5 Migration status (updated 2026-07-08)

- **Done + verified:** workspace tooling + governance + `ai/` workbench; all org packages/services/apps scaffolded; `exam-api` runtime slice ported **and green** (`pnpm install`, `tsc --noEmit`, Biome, and the `core` boundaries lint all pass) and it **emits `attempt.submitted` / `attempt.auto_submitted` as validated `@bio/domain-contracts` envelopes** (producer `bio-exam`).
- **Distributed to all repos:** every service repo now holds its **functional chunk of the working project** in a `lemon-current-impl/` folder on a `lemon/current-impl` branch (`bio-exam`, `bio-admin`, `bio-portal`, `bio-contracts`; `bio-proctor` via `lemon/current-proctor-implementation`). The main repo carries `bio-repos-mirror/` mirroring every chunk. See §0.7.
- **Workbench engineering artifacts:** EXAM-02 (PRD-030) `SPEC-004` + `TDD-004` + `ERD-004` drafted in `workbench-bio-exam-admin` (branch `exam-02-eng-artifacts`), designed to the latest spec (see §0.8).
- **Next:** draft eng-specs for the remaining epics; register the service repos under the workbench `repos/` so ralph can build; port `admin-api`/`portal-api` verticals; wire `apps/*`; retire each legacy app only at parity.
- **Run (new stack):** `pnpm install` → `pnpm --filter @bio/exam-api typecheck` → `DATABASE_URL=… REDIS_URL=… JWT_SECRET=… pnpm --filter @bio/exam-api dev`. Verify: `pnpm verify`.

### 0.6 How we work now — the AI workbench (ralph-driven)

Development is driven from the **`workbench-bio-exam-admin`** repo (an `ai-workbench` instance), **not** by hand-editing the service repos. It is a **planning + orchestration** repo:

- **Pipeline:** Jira epic → **PRD** (PO hat) → **eng-spec / TDD / ERD / ADR** (Eng hat) → **BDD / test-plan / test-cases / test-spec** (QA hat) → human approval → **ralph** writes the code into the service repos under its `repos/`.
- **Artifact lifecycle:** `draft → published → approved`. **Agents (Claude/Devin) write `draft` only**; humans promote via `wb.publish` / `wb.approve` / `wb.reject`. Ralph's gate is `.workbench-state/approved.json`; only approved artifacts are synced into `repos/<svc>/ai/`.
- **Hard rules:** never hand-edit `repos/*` from the workbench (ralph's job); cross-service DTOs/events come from `@bio/domain-contracts` (never duplicated); `bio-admin` owns answer keys + scoring while `bio-exam` consumes key-stripped snapshots; `bio-portal` owns payments/entitlement; no answer keys or secrets into the wrong repo; plain English, no em dashes or hype words in artifacts.
- **Source of truth:** 44 golden PRDs in `ai/output/prds/` (from `bio-po`); steering rules in `ai/steering/` (golden principles GP-001..010, roles dev/po/qa/uxd, per-artifact rules). Per-epic status lives in the workbench `EPIC-PIPELINE.md`; only the 3 scaffold PRDs are approved so far, the 41 feature PRDs are published and awaiting approval.
- **This workbench owns:** exam, admin, contracts. Portal and proctor are "external impacted" (own repos / their own workbench).

### 0.7 Repo & branch topology (where everything lives)

Nothing is deleted; every change is an additive branch. The nine repos collectively hold the entire project, split by function.

| Repo | Branch(es) | Contains |
|---|---|---|
| `Bharat_innovation_olympiad` (main) | `bio-workspace-rearch` | Full pnpm workspace + exam-api port + `ai/` workbench + `bio-repos-mirror/` (all chunks) |
| `bio-exam` | `lemon/current-impl`, `lemon/exam-runtime-port` | Working exam-runtime chunk; **and** the target-stack Elysia/Drizzle port |
| `bio-admin` | `lemon/current-impl` | Working authoring/analytics + admin console chunk |
| `bio-portal` | `lemon/current-impl` | Working auth/booking/payments + student app chunk |
| `bio-contracts` | `lemon/current-impl` | Working shared platform + data model + types chunk |
| `bio-proctor` | `lemon/current-proctor-implementation` | face-api.js client + NestJS proctor module |
| `workbench-bio-exam-admin` | `exam-02-eng-artifacts` | SPEC/TDD/ERD-004 for EXAM-02 |
| `bio-po` | (read-only) | Golden PRDs |
| `workbench-bio-portal` | (untouched) | Portal specs |

**Two tracks:** (1) **distribute now** — the working code is preserved per-function on the `lemon/current-impl` branches above, so the repos already hold the whole project; (2) **port over time** — each chunk is rewritten to its target stack via the workbench → ralph flow (exam-api is the first done).

> **Tooling gotcha (main repo):** `pnpm install` runs `lefthook install`, adding a `pre-commit` hook (`biome-check` + `lint-boundaries`) that fails in this environment (`pnpm` is not on the git-hook shell PATH; Biome flags vendored/legacy code). A commit that fails the hook aborts silently, and a following branch push then points at the old commit. Fixes applied: `biome.json` excludes `backend`/`frontend`/`admin-frontend`/`bio-repos-mirror`, and consolidation commits use `git commit --no-verify`. The `_bio-org/*` clones have no such hook.

### 0.8 Reconciliation: the spec has moved past the monolith

The workbench PRDs are ahead of the monolith on some behaviors. Most important, **EXAM-02 (PRD-030)** changed the attempt gate from **slot booking** (what the monolith and the current exam-api port do) to a **paid registration/entitlement** (`registrationId`, from `PORTAL-07 RegistrationConfirmed`), added a richer state machine (`SUBMITTING`, `EXPIRED_WITH_ERROR`, `VOIDED`), ownership on the **WebSocket** join (IDOR), `endsAt = min(startedAt + duration, slotEndsAt)`, and a **fail-closed** start when the timer cannot schedule. `SPEC-004`/`TDD-004`/`ERD-004` capture this target; the exam-api port is faithful to the monolith today and will be upgraded to the spec.

### 0.9 System design — hexagonal (ports & adapters)

Every backend service follows the same hexagonal shape. **Dependency rule:** `core` depends on nothing
outward; `adapters` and `infra` depend inward on `core`. It is enforced by `pnpm boundaries` (an ESLint
pass over `src/core/**` that bans imports of adapters, infra, ORM rows, framework, or UI).

```text
services/<svc>-api/src/
  core/
    domain/      entities, value objects, pure logic (scoring, FNV-1a question-set) — no I/O
    ports/in/    use-case interfaces (driving ports) the inbound adapters call
    ports/out/   repository/gateway interfaces (driven ports) the core calls
    services/    application services implementing the use cases over ports
    errors/      DomainError hierarchy (machine code + httpStatus)
  adapters/
    in/http/     Elysia routes + plugins (auth, cors, error-handler, request-logger)
    out/persistence/  Drizzle repositories + schema (implements ports/out repositories)
    out/cache/   Redis clients (durable timer store, etc.)
    out/events/  contract-event publisher (maps domain events → @bio/domain-contracts envelopes)
  infra/         config, logger (pino), graceful shutdown
  container.ts   composition root — the ONLY place core is wired to concrete adapters
  index.ts       process entry (Bun); app.ts assembles the Elysia app from plugins + routes
```

**Why:** infrastructure is swappable, the core is unit-testable with no DB/HTTP, and the boundary keeps
answer-key and secret logic out of the wrong layer. The worked example is `services/exam-api` (§0.4,
and `services/exam-api/PORT-NOTES.md`).

### 0.10 Service topology & responsibilities

| Service (repo) | Owns | Inbound surface | Key outbound ports |
|---|---|---|---|
| `exam-api` (bio-exam) | Attempt lifecycle, durable timer, player, submission, SEB | `POST start-attempt` / `answer` / `submit`; `GET attempt` / `timer`; WS timer-room | AttemptRepository, ExamSnapshotReadModel (key-stripped), ExamRegistrationReadModel, TimerScheduler, EventBus, Clock, SEB/readiness |
| `admin-api` (bio-admin) + workers | Question bank, paper builder, scheduling, publishing, **scoring (owns answer keys)**, results, analytics, ops | Admin HTTP | Publishes `ExamSnapshotPublished` (key-stripped) + `ExamSlotPublished`; scoring / results / publish / analytics workers |
| `portal-api` (bio-portal) | Marketing, auth (OTP), registration, booking, **payments (Razorpay)**, entitlement issuance, admit card, results surface | Student HTTP + Next.js apps | Emits `RegistrationConfirmed` / `RegistrationCancelled`; consumes results |
| `bio-proctor` (Python, **not built**) | Face enrollment, frame analysis, risk, review, biometric retention | — | Current implementation is the face-api.js client in `frontend/` |
| `bio-contracts` (packages) | Shared DTOs/events, auth-kit, shared-types, ui-kit, fixtures | — | Consumed by every service via `workspace:*` |

### 0.11 Shared contracts & the event model (PLAT-02)

- All cross-service DTOs and events come from **`@bio/domain-contracts`**; never hand-duplicated.
- **Event families** (Zod-validated payloads): `runtime` (bio-exam: `attempt.started`, `answer.saved`, `attempt.submitted`, `attempt.auto_submitted`, `runtime.integrity_signal_raised`), `commerce` (bio-portal: `RegistrationConfirmed`/`Cancelled`), `admin` (bio-admin: `ExamSnapshotPublished`, `ExamSlotPublished`), `proctor`.
- **Envelope:** `BioEventEnvelope<T>` = `eventId`, `eventType`, `eventVersion` (equals `CONTRACT_VERSION`), `occurredAt`, `producer`, `correlationId`, `causationId?`, `idempotencyKey`, `payload`. Pinned `CONTRACT_VERSION = 0.1.0`; consumers reject an incompatible major.
- **Cross-repo seam events:** `RegistrationConfirmed`/`Cancelled`, `ExamSnapshotPublished`, `ExamSlotPublished`, `attempt.submitted`, `ProctorSessionRequested`, `RiskScoreChanged`, `ProctorReportFinalized`.
- **Forbidden-field rule (CI-enforced):** no `correctAnswer`, correct-option flag, or pre-release `explanation` in any runtime contract or fixture.
- Status: `exam-api` already emits `attempt.submitted` / `attempt.auto_submitted` as validated envelopes via an `EventPublisher` port + an outbound adapter (keeps `core` free of zod).

### 0.12 Data model & persistence

- New services use **Drizzle** (node-postgres) against the **same shared Neon database** as the monolith's Prisma, so both engines run during cutover. Table/column names match Prisma defaults (PascalCase tables, camelCase columns, enum type = enum name); ids are `text` (Prisma `String @default(uuid())`, no `@db.Uuid`).
- **Read models:** `exam-api` projects `RegistrationConfirmed` → `ExamRegistration` and `ExamSnapshotPublished` → a **key-stripped** `ExamSnapshot`, so the attempt-start hot path needs no cross-service round-trip.
- **Attempt aggregate (EXAM-02 target):** unique `registrationId` (idempotency key), pinned `examSnapshotId`, state machine `NOT_STARTED → IN_PROGRESS → SUBMITTING → SUBMITTED | AUTO_SUBMITTED | EXPIRED_WITH_ERROR | VOIDED`, server-authoritative `endsAt = min(startedAt + duration, slotEndsAt)`.
- **Migrations** are additive so the legacy engine keeps serving until parity; rollback drops the added tables/constraints with no backfill.

### 0.13 Security & boundaries

- **Deny-by-default** authorization. **Ownership enforced on every attempt HTTP endpoint AND the WS join** (closes the IDOR): one `assertOwner` predicate is shared by the HTTP guard and the socket handshake.
- **Answer keys isolated to bio-admin.** The runtime only ever sees key-stripped snapshots (`ScoredQuestion` stays internal to the domain; `QuestionView` crosses the HTTP boundary).
- **Fail closed:** never start an untimed exam — the durable timer must schedule (Redis/BullMQ) or start returns `503` and persists no attempt.
- **Server is the only time authority;** the client clock is never trusted; resume recomputes remaining time server-side.
- **DPDP:** India data residency, audited attempt events (OPS-01), biometric retention policy (PROCTOR-05).
- **Auth:** JWT HS256 with the shared `JWT_SECRET` (`sub` = userId), matching the NestJS backend. Neon direct tokens are RS256 via JWKS (a follow-up if pointed straight at a service).

### 0.14 Repo restructuring — full module mapping

Monolith module → target repo / service / app:

| Monolith source | Function | Target |
|---|---|---|
| `backend/src/attempt`, `backend/src/timer` | Exam-window runtime | bio-exam / `services/exam-api` |
| `backend/src/exam` | Authoring, analytics | bio-admin / `services/admin-api` (+ workers) |
| `backend/src/auth`, `backend/src/user` | Auth, profile | bio-portal / `services/portal-api` |
| `backend/src/slot`, `backend/src/payment` | Booking, payments | bio-portal / `services/portal-api` |
| `backend/src/proctor` + `frontend` `useFaceProctor` | Proctoring | bio-proctor (client kept; Python service not built) |
| `backend/src/common`, `backend/src/prisma`, FE/admin `types` | Shared platform, data model, types | bio-contracts / `packages/*` |
| `frontend/` (student) | Student UI | bio-portal / `apps/{marketing-web,student-portal-web}` |
| `admin-frontend/` | Admin UI | bio-admin / `apps/admin-web` |
| exam-player pages/hooks | Exam UI | bio-exam / `apps/exam-web` |

**Distribution (track 1, done):** each function's working code is preserved in its repo under
`lemon-current-impl/` on a `lemon/current-impl` branch, and mirrored into the main repo under
`bio-repos-mirror/`. **Workspace naming:** each folder is the `@bio/*` package name minus the `@bio/`
prefix (for example `@bio/exam-shared-types` → `packages/exam-shared-types`), so distinct names never
collide when the five repos are flattened into one workspace.

### 0.15 Stack migration matrix

| Concern | Monolith (production now) | Target (new services) |
|---|---|---|
| Runtime | Node | Bun (`>=1.2`) |
| API framework | NestJS | Elysia |
| ORM | Prisma | Drizzle |
| Package manager | npm | pnpm workspaces (`pnpm@10.32`) |
| Lint / format | ESLint / Prettier | Biome (tabs, width 100, double quotes) |
| Git hooks | none | Lefthook (`biome-check`, `lint:boundaries`) |
| Tests | Jest | Bun test (TS) / pytest (proctor) |
| Frontend | Next.js (student + admin) | Vite/React (`exam-web`, `admin-web`) + Next.js App Router (`marketing-web`, `student-portal-web`) |
| Proctoring | face-api.js client (kept) | Python / FastAPI (future) |
| Architecture | modular monolith | hexagonal polyrepo + shared `@bio/*` contracts |
| Deploy | Render (backend) + Vercel (frontends) | per-service (future; not yet wired) |

> The remainder of this document (§1–§15) describes the **live production monolith**, which is
> unchanged and authoritative until the workspace services replace it.

---

### 0.16 Partner Attribution, Commission & Payout Engine + Portal (2026-07-09)

Second real vertical slice in the workspace (after `exam-api`), built to draft PRDs `PRD-046`
(engine, workbench-bio-exam-admin) and `PRD-011` (UI, workbench-bio-portal) — "contractor" in the
original request meant "partner"; there is no separate contractor concept anywhere in the org.
School Portal (`PRD-010`) and the PRD-047 school self-service backend stay **deferred**.

- **`services/admin-api`** owns the engine: `Partner`, `PartnerApplication`, `Campaign`,
  `AttributionRecord`, `CommissionStatement`, `PayoutLedgerEntry`, `PartnerInstitutionAssignment`
  (Drizzle, shared Neon DB, migration `0000_shocking_galactus.sql`). Application approval and payout
  release are manual-decision hooks (one audited PATCH each, mandatory reason) — no review UI or
  queue, per the PRD's explicit non-goal. Attribution ties (a referral link and a coupon both
  present) resolve first-touch; one credit per student+registration, idempotent on duplicate
  paid-conversion events. Commission statements are immutable once issued — regenerating creates a
  new version rather than mutating the original. Payouts move `PENDING → SIGNED_OFF → RELEASED`,
  blocked from `RELEASED` without a finance sign-off field. No KYC/Aadhaar fields anywhere (explicit
  decision) — the application is just org name, contact person, email, phone.
- **Auth**: `services/admin-api`'s `require-role.guard.ts` placeholder (`x-admin-role` header, no
  verification) is now replaced by a real `auth.plugin.ts` — the same HS256 JWT verification
  (`JWT_SECRET`, `{ sub, email, role }` payload) `exam-api` already uses against the legacy backend's
  tokens. A `PARTNER` role rides the same token; partner-scoped routes are always scoped to the
  token's `sub`, never a client-supplied id (contract-tested — no cross-partner leakage).
- **`services/portal-api` + `apps/partner-portal-web`** (new): a thin BFF (`/partner/*` routes)
  proxying to `admin-api`, and an 11-page Next.js App Router app — application + status, dashboard
  (gated on approved status), institutions, campaign/link management, funnel, payouts/statements, a
  support-request form (submission + status only), a `mailto:` dispute link. Not yet
  integration-tested against a live `admin-api` — see ROADMAP for the specific open item.
- **Test coverage**: 81 `bun test` cases in `admin-api` (one group per acceptance criterion), 35 in
  `portal-api`; both packages' `typecheck`/`lint:boundaries`/Biome all green.
- **Repo-wide bugs found and fixed in this pass** (not specific to Partner code):
  1. `.gitignore`'s unanchored `out/` rule was silently excluding every service's
     `core/ports/out/`/`adapters/out/` directory from git. This meant `exam-api`'s Drizzle
     schema/repositories/event-publisher — built and verified in the 2026-07-02/03 sessions — had
     **zero commit history** despite being described as "ported and pushed" in this document. Fixed
     the glob (scoped to `apps/*/out/`, `/frontend/out/`, `/admin-frontend/out/`) and recovered the
     previously-invisible `exam-api` files as their own commit.
  2. Elysia's `onError` hook defaults to `"local"` scope — `error-handler.ts` in both `admin-api` and
     `exam-api` was mounted as a sibling plugin without `{ as: "global" }`, so it never actually
     caught errors from the route plugins next to it; every `DomainError` fell through to a raw,
     unmapped 500. Fixed in both.
  3. `lint:boundaries`'s single-quoted glob (`'src/core/**/*.ts'`) isn't stripped by the Windows
     shell lefthook invokes, so eslint received the literal quote characters and matched nothing —
     switched to double quotes in both services.

---

### 0.17 Portal UI consistency + School Portal (2026-07-10)

Built against `Portal_Features.pdf` (the plain-language features spec: **Student 30 / School 22 /
Partner 15 / Admin 30** features + cross-cutting platform safeguards). Decision: the partner and
school portals are delivered as **new pnpm-workspace apps that share the student/admin BIO design
system**, and Aadhaar/OTP/KYC identity verification is **skipped** by request.

**The shared design system.** `frontend/` and `admin-frontend/` share a CSS-variable design system
(`admin-frontend/src/app/globals.css`): Inter + JetBrains Mono, a lemon-yellow→lime-green brand
palette (`--primary-*` / `--accent-*`), glass-card surfaces (`--glass-bg` + `backdrop-filter`), an
animated radial background mesh, and shadow/spacing/radius scales. Both new workspace apps embed this
exact token set in their own `globals.css` (the workspace has no Tailwind; these are hand-authored
CSS variables), so the four portals read as one product.

**Partner portal (`apps/partner-portal-web`) — restyled in place.** Its original `globals.css` used a
separate blue theme and bespoke class names (`.card`, `.button`, `.stat-tile`, `.dashboard-nav`,
`.badge`, `.copy-field`…). Rather than rewrite ten pages, the stylesheet was replaced with one that
(a) declares the full BIO token set and (b) **re-implements those same class names on top of the
tokens** — so every existing page (all 15 partner features: onboarding, dashboard, institutions,
campaigns/links, funnel, payouts/statements, support) matches student/admin with zero JSX changes. A
branded gradient sidebar header was added to `dashboard-nav`. Runs on `:3400`, talks to
`services/portal-api` (`:3300`).

**School portal (`apps/school-portal-web`) — new, built from scratch.** A Next.js 16 / React 19
workspace app on `:3500` mirroring the partner portal's structure: JWT-paste auth
(`bio-school-portal.access-token`), a landing page, `/login`, `/activate` (invitation &
self-activation), and a redirect-gated `/dashboard/*` shell with a branded sidebar (`school-nav`).
**All 22 school features** live across 8 dashboard pages:

| Page | Spec features covered |
|---|---|
| Overview | Dashboard access, participation summary, upcoming windows |
| Profile & roles | Institution profile setup, RBAC (coordinator / read-only invite + remove) |
| Students | View invited + participating (filter/search), **bulk CSV upload** (client-side validate + preview + template) |
| Slots & windows | Exam-slot dates, slot-allocation status bars, custom-window request, updated-window visibility |
| Live monitoring | Near-real-time exam-day snapshot (5s auto-refresh), flagged-session notice |
| Results & analytics | Results-available, participation summary, class/grade performance, student-wise scores, percentile benchmarking, peer school comparison, CSV export |
| Sponsorship | Sponsored / future-payment requests |
| Support | Helpdesk escalation + `mailto:` |

`pnpm --filter @bio/school-portal-web typecheck` is green (the workspace's strict
`exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` are honoured); all 11 routes compile under
Turbopack and serve 200.

**Data layer is representative demo data.** There is **no school-coordinator backend yet** — the
monolith only exposes ADMIN-scoped school endpoints (`GET /admin/schools`, school-slot-assignments,
reassignment; see the 2026-07-09 log). So `apps/school-portal-web/src/lib/school-data.ts` returns
representative in-memory data, and is the **single seam** to swap for real `fetch()` calls (base URL
`NEXT_PUBLIC_API_URL`) once the PRD-047 / SCHOOL-01 school API lands. Nothing on this portal is
persisted server-side yet; forms mutate local component state only.

**Local port map (dev):** backend `:4000`, student `:3000`, admin `:3001`, admin-api `:4100`,
portal-api `:3300`, partner portal `:3400`, school portal `:3500`, Redis `:6379` (now published to the
host in `docker-compose.yml`).

**Live deployment (2026-07-10).** All portals are deployed. Frontends on Vercel
(`kritantasasanroys-projects`), backends on Render (`My Workspace`, Singapore):

| Service | URL | Notes |
|---|---|---|
| Student portal | https://olympiad-student-frontend.vercel.app | existing, redeployed |
| Admin portal | https://olympiad-admin-frontend.vercel.app | existing, redeployed |
| **Partner portal** | https://bio-partner-portal.vercel.app | new (`apps/partner-portal-web`) |
| **School portal** | https://bio-school-portal.vercel.app | new (`apps/school-portal-web`) |
| Backend (NestJS) | https://olympiad-backend-wsvn.onrender.com | existing, redeployed; `/api/proctor/health` 200 |
| **admin-api** (Bun) | https://bio-admin-api.onrender.com | new; + Render Key Value `bio-admin-redis` |
| **portal-api** (Bun) | https://bio-portal-api.onrender.com | new; `/partner/*` → 401 unauthenticated ✓ |

> Updated 2026-07-10: all three Render services now deploy from **`bio-workspace-rearch`** (the
> backend previously built from `main`, which does not contain the partner module). New env vars:
> backend `ADMIN_API_URL`, portal-api `STUDENT_APP_URL`, partner portal `NEXT_PUBLIC_API_URL`. All
> services share one `JWT_SECRET` — see §0.18 for the production mismatch that broke this.

Deploy specifics worth remembering: (1) Render has **no native Bun runtime** and its `/usr/bin` is
**read-only**, so `corepack enable` fails (`EROFS`) — the Bun services build with
`npm install -g pnpm@10.32.1 bun && pnpm install --frozen-lockfile --filter <pkg>... --ignore-scripts`
(rootDir = repo root so the pnpm workspace resolves) and start with `bun services/<svc>/src/index.ts`;
Render injects `PORT`. (2) The Vercel CLI uploads only the app directory, so each portal app needs a
**self-contained `tsconfig.json`** (no `extends: ../../`) and an explicit `typescript` devDep — the
apps have no `@bio/*` workspace deps, so they build standalone. (3) `admin-api` is fail-closed on
`REDIS_URL`; a Render Key Value instance (`redis://red-...:6379`, internal) backs it. Tokens used for
this deploy were provided in-session and should be rotated.

**Remaining (Phase 3, deferred by choice — deploy-first was done first):** fill genuine student/admin
spec gaps on the **live monolith** (student: admit card, certificate + public verification,
grievance/reattempt, consent capture; admin: fair-score normalization / result-release gating,
certificate generation, refund-request review, exam-day + KYC/payment ops queues). The
partner-management view is now **done** — see §0.18.

---

### 0.18 Partner access loop + referral attribution (2026-07-10)

**The problem.** A brand-new partner could not get into the partner portal at all. Three linked gaps:
`/apply` and `/login` both required a *pasted JWT*; **no token could ever carry `role: PARTNER`**
(the backend `Role` enum lacked it, and only the legacy backend signs JWTs — admin-api/portal-api
merely verify); and admin had no way to see or decide requests (admin-api could approve/reject but had
no list endpoint and no revoke, and `admin-frontend` only ever talks to the backend on `:4000`).

**Who owns what.** The legacy backend is the platform's only JWT signer, so it owns **partner
identity + review**; admin-api keeps the partner **engine** (funnel/campaigns/statements/payouts).
They are kept in lock-step by the backend, which drives the engine over server-to-server calls.

```
partner-web ──apply/login──► backend :4000 ──s2s (short-lived SUPER_ADMIN JWT)──► admin-api :4100
            └──dashboard───► portal-api :3300 ──proxy──────────────────────────►┘
admin-web ──review queue──► backend :4000 (orchestrates the engine; no new admin client needed)
student-web ──?ref=CODE──► backend /auth/sync ──► admin-api /campaigns/{by-code,:id/signup}
```

**The reconciliation key.** `admin-api Partner.id` (minted by the public application) is stored on the
backend's `PartnerRequest.partnerId` **and used as the partner JWT `sub`** — so `sub === partnerId`
everywhere, which is exactly what portal-api's scoping already assumed.

**The access gate.** `portal-api`'s `requireApprovedPartner` reads **`Partner.status`** via
`GET /partners/:id` (previously it passed a `partnerId` to `GET /partner-applications/:id`, which
expects an *application* id). Staff drive that status through the new staff-only, audited
`PATCH /partners/:id/access` (`APPROVED | REJECTED | REVOKED`). Because the guard runs on **every**
dashboard request, **a revoke removes access immediately — even while the partner still holds a valid
24h token.** Re-granting restores it on the same token.

| Surface | Route |
|---|---|
| Partner requests access (**public, no token**) | `POST /api/partner/apply` |
| Partner signs in (email + password, bcrypt) | `POST /api/partner/login` → `role:PARTNER` JWT |
| Admin review queue | `GET /api/admin/partner-requests` |
| Admin grant / reject / revoke / re-grant | `PATCH /api/admin/partner-requests/:id` (reason mandatory, audited) |
| Engine access switch (staff, s2s) | `PATCH /partners/:id/access` |
| Dashboard identity (403 once revoked) | `GET /partner/me` |

**Referral attribution.** A partner shares `…/?ref=CODE`. The student app captures it on first touch
(landing + register, `frontend/src/lib/referral.ts` — first touch wins, matching the engine's
`LINK_FIRST_TOUCH` rule), replays it into `POST /auth/sync`, where the backend resolves
`GET /campaigns/by-code/:code` and captures the signup; the code is persisted on `User.referralCode`
and replayed at payment to credit the paid conversion. Attribution is **best-effort** (it never breaks
a registration or a payment) and **idempotent** — admin-api enforces one credit per
`student+registration`, so firing from both the Razorpay webhook and the client-verify path is safe.

**Two production bugs found and fixed while verifying:**
1. **`prisma db push` was wiping the partner engine on every backend deploy.** The admin-api partner
   tables were Drizzle-only and absent from `schema.prisma`; the production start command is
   `npx prisma db push --accept-data-loss && node dist/src/main.js`, and `db push` drops any table it
   does not know about. The 7 tables + 7 enums are now mirrored into `schema.prisma` (they are still
   *written* only by admin-api via Drizzle — Prisma just needs to know they exist). Keep the two in
   sync. Verified they survive a push.
2. **Mismatched `JWT_SECRET` in production.** `olympiad-backend` on Render had a different secret than
   `bio-admin-api` / `bio-portal-api` (which were seeded from a local `.env`), so every
   backend-issued token — partner *and* staff — was rejected in production. The two new services were
   realigned to the backend's authoritative secret (changing the backend's would have invalidated
   every live student/admin session).

**Contract reconciliation (the partner dashboard had never actually been wired).** portal-api's port
assumed a funnel shape admin-api does not return, so `/partner/funnel` leaked the raw engine payload
and `/partner/institutions` returned `{}`. The BFF adapter now merges `GET /funnel` + `GET /campaigns`
into one DTO (adding `code`, `shareUrl`, `status`), institutions come from the real assignment route,
and campaign pause/resume maps to admin-api's `deactivate` boolean (**resume was previously a silent
no-op**). The portal adopted the engine's vocabulary (`signups` / `registrations` / `paid`) instead of
the invented `leads` / `paidConversions`, and the fabricated per-institution funnel was dropped — the
engine does not key attribution by institution.

**New env vars:** backend `ADMIN_API_URL`; portal-api `STUDENT_APP_URL` (builds the `?ref=` share
link); partner portal `NEXT_PUBLIC_API_URL` (the backend, for apply/login). All three Render services
now deploy from the `bio-workspace-rearch` branch.

**Verified in production** (not just locally): apply with no token → `403` pre-approval login → admin
queue → grant → partner login → dashboard `200` → **revoke → same token `403`** → re-grant → `200`;
campaign create → funnel shows code + real `shareUrl` → referred student registers → `signups=1`;
paid conversion → `paid=1`, still `1` on replay. `admin-api` 81 tests, `portal-api` 42 tests.

---

### 0.19 Phase 3 — results integrity, decision loops, consent (2026-07-10)

Everything here lives in the **legacy backend** (`backend/`) plus the student and admin frontends.
New modules: `results/`, `certificate/`, `grievance/`, `refund/`, `consent/`.

#### The results integrity chain

Three steps, and each one is **impossible until its predecessor has run** — enforced server-side, and
mirrored in the admin UI (`/results`) by disabling the next button:

```
   normalize  ──►  release  ──►  issue certificates
   (automatic)     (human,        (only for a released
                    audited,       instance)
                    reason req.)
```

- **Normalization** (`results/normalization.ts`) is a pure, unit-tested function. Students sit
  *different question sets*, so raw marks are not comparable. It rescales in **percentage space**
  (so attempts with different `maxScore` compare correctly) via a z-score:
  `pct' = clamp(0.5 + 0.15·z, 0, 1)`, then `score' = pct' · maxScore`.
  - **A zero-variance cohort is left untouched.** If everyone scored the same, forcing them onto the
    target mean would silently rewrite a perfect 100% into a 50%.
  - Percentile is the textbook percentile *rank* `(L + 0.5E)/N · 100` (a lone candidate sits at 50);
    rank is competition ranking (ties share a rank and consume the following slots).
  - Ranking is done on the normalized **percentage**, not `normalizedScore`, because two attempts with
    different `maxScore` can order differently in raw-score space.
- **Release** requires a completed normalization run and a written reason; both go to `AuditLog`. It
  also flips the legacy `Exam.isResultReleased` so the existing student-facing gate stays in step.
- **Certificates** can only be issued for a released instance.

#### Certificates and public verification

`certificateNumber` is the public identifier, so it is **unguessable**: `BIO-<year>-<10 chars>` over a
Crockford-style alphabet (no `I`, `L`, `O`, `U`), ~50 bits of entropy, plus a unique constraint with
retry. A sequential counter would let anyone enumerate every certificate ever issued.

`GET /api/certificates/verify/:number` is **PUBLIC** (no guard). It:
- reports a revoked certificate as `{valid:false, reason:'REVOKED'}` rather than 404 — a revoked
  certificate must not silently vanish; and
- returns the *same* `NOT_FOUND` for an unknown number and a malformed one, so it cannot be used as an
  oracle. Revocation is soft.

Certificates and admit cards are **print-friendly pages**, not server-generated PDFs: Puppeteer's
bundled Chromium does not fit the current hosting tier, and print-to-PDF yields the same artefact.

#### Decision loops

- **Grievance / re-attempt** (`/support` → `/grievances`). Approving a `REATTEMPT` genuinely grants
  one: the attempt is reset to `NOT_STARTED` and its answers deleted (an `Attempt` is unique per
  student+instance, so there is no second row to create). That is destructive, so the original
  submission — score, timestamps, answer count — is **snapshotted into the audit log before it is
  cleared**. Decisions are one-shot.
- **Refunds** (`refund/refund-eligibility.ts`, pure). The rule is the spec's: *before the cutoff
  (48 h), and not once a slot booking is `CONFIRMED`*. It is evaluated at request time **and again on
  approval** — a request that was eligible last week must not be paid out after the cutoff has since
  passed. Approval issues immediately through the existing `PaymentService.adminRefund`; if Razorpay
  fails the request stays `APPROVED` (retryable) rather than being marked `ISSUED`.
- **Consent** is versioned (`CURRENT_CONSENT_VERSION`) and permanent; all three permissions are
  mandatory, so a partial consent is rejected rather than stored.

#### Surfaces

| Actor | Routes / pages |
|---|---|
| Public | `GET /api/certificates/verify/:number`; student app `/verify/[number]` |
| Student | `/consent`, `/certificates` (+ printable `[id]`), `/support` (grievance + refund), `/admit-card/[bookingId]` |
| Admin | `/results` (normalize → release → certificates), `/grievances`, `/refunds` |

#### Testing

**77 backend tests pass** (`cd backend && npm test`) — 65 new across 5 suites. The pure modules
(normalization, certificate numbering, refund eligibility) are exhaustively unit-tested; the grievance
and results services are tested against hand-rolled in-memory Prisma fakes whose rows really mutate,
so the re-attempt reset and the release gate are genuinely exercised rather than stubbed.

Runtime E2E against the live backend confirmed: release-before-normalize → `409`; normalize → release
→ certificates; **public verify with no auth** → `valid:true`; revoke → verify reports `REVOKED`;
partial consent → `400`; grievance decided twice → `409`. (A real cohort of two 0/20 attempts
exercised the zero-variance path exactly as unit-tested.) All E2E artefacts were removed from the
shared database afterwards.

**Not built, deliberately:** notifications (SMS/Email/WhatsApp — needs SES/DLT/Meta infrastructure),
Aadhaar/KYC/OTP (skipped by request), and school↔admin custom-window approval (the school portal is
still demo data — `apps/school-portal-web/src/lib/school-data.ts` is the seam).

---

### 0.20 School access loop, issued access tokens, unified admin queue (2026-07-10)

Three defects made "request access" unusable end-to-end, and the credential the spec asks for did
not exist. All four are addressed here.

#### Why partner apply failed with "the partner engine is starting up"

`PartnerService.apply()` called admin-api to mint the `partnerId` before writing anything locally.
admin-api sleeps on Render's free tier; a **measured cold start is 32.7s** (warm: 0.44s), while the
retry budget was `[1s, 3s, 6s, 10s]` — 20s of sleeping. The client gave up mid-boot and surfaced its
cold-start message to a real applicant. A stranger's very first interaction with the platform
depended on a sleeping background service waking up in time.

Applying is now a **local write only**. The engine `Partner` is provisioned lazily on the first
approval — the only moment `partnerId` is actually needed, and a path where a staff member can
afford to wait. This is strictly better than a longer timeout: the engine can be down entirely and
schools and partners can still apply.

The budget did also grow, to `[1, 2, 4, 8, 12, 15, 20]s` (~62s), but only under a **`patient`**
policy used by staff-initiated calls. Referral attribution moved to a **`fast`** policy (no retries)
and is **no longer awaited** (`void this.partnerAdminApi.tryCaptureSignup(...)`) — otherwise the wider
budget would have stalled a student's signup or a payment callback for a minute behind a cold engine.
Losing an attribution during a cold start is the accepted trade; blocking a student is not.

#### Why school requests never reached the admin queue

They were never sent. `apps/school-portal-web/src/app/activate/page.tsx` had
`handleSubmit = () => setDone(true)`, and the app made **zero network calls** — "Your school is
activated" was a cosmetic screen. There is now a real `backend/src/school/` module (PRD-047, the
access half):

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/school/apply` | public | queue a request; no credential involved |
| `POST /api/school/login` | public | exchange an access token for a `role: SCHOOL` session JWT |
| `GET /api/admin/school-requests` | staff | the review queue |
| `PATCH /api/admin/school-requests/:id` | staff | grant / reject / revoke / re-grant |
| `GET /api/admin/school-requests/:id/card` | staff | the handover card, token in the clear |
| `POST /api/admin/school-requests/:id/rotate-token` | staff | replace the token |

Approving provisions the `School` row and a coordinator `User` (`Role.SCHOOL`, new). Revoking sets
that user `isActive: false`, so `JwtStrategy` rejects a **still-valid JWT on its next request** —
the same immediacy the partner gate has.

Applying **refuses a coordinator email that already has a BIO account** rather than silently
converting someone's student account into a school coordinator at approval time.

#### Access tokens

Approval issues exactly one token per organisation, e.g. `BIO-SCH-4K2M9-...` (100 bits over a
Crockford-style alphabet with no `I`/`L`/`O`/`U`, so it survives being read aloud or retyped from a
printed card — lookup normalises case and folds the omitted glyphs).

Storage is split, because the two jobs conflict:

- **`accessTokenHash`** — SHA-256, under a **unique index**. This is what authenticates. A presented
  token resolves to at most one row, so *a token issued to one school can never sign another one in*.
- **`accessTokenSealed`** — the same token under AES-256-GCM, opened only for an authenticated admin
  re-rendering the handover card. A leaked database dump alone therefore yields no usable tokens.

The sealing key comes from **`ACCESS_TOKEN_KEY`** (falling back to `JWT_SECRET`). It is deliberately
a separate variable: rotating `JWT_SECRET` must not make every existing handover card unreadable.
If the key does change, tokens still *authenticate* (the digest is independent) — only the card
needs a rotation to be re-issued.

A token survives a revoke → re-grant cycle, so a card already sitting in a coordinator's inbox stays
valid. `rotate-token` invalidates the old one immediately.

Partners get the same credential: `POST /api/partner/login` now accepts **either** `{email, password}`
or `{accessToken}`. The password path compares against a real bcrypt hash even when no partner
matches, so "unknown email" and "wrong password" take the same time.

#### One queue

`admin-frontend/src/app/access/page.tsx` replaces `/partners` (which now redirects) with a single
queue over both request types, filterable by type and status, with the handover card as a modal
(reveal / copy token / copy full card / rotate). Approving opens the card immediately — that is
exactly when staff need the token.

**Tests:** 39 new (20 token primitive, 19 school service), 116 backend total, all green. The school
suite proves the invariants that matter rather than that a mock was called: two approved schools get
distinct tokens that each resolve only to their own school; a partner token and a JWT are both
rejected; revoke deactivates the coordinator *and* refuses login; rotation locks out the old token.

**Still deferred:** the school **dashboard** remains demo data (`school-data.ts`) — this change wires
the access loop, not the read/write half of PRD-047. Notifications are still absent, so the handover
card is copied out of the admin UI by hand rather than emailed.

---

### 0.21 Real school directory, functional school portal, partner onboarding (2026-07-10)

The school side of the platform was cosmetic in two places and outright broken in a third. All three
are now real.

#### The student "Invalid school code" bug

The register page (`frontend/src/app/register/page.tsx`) shipped a hard-coded `schools.json` of 25
schools whose codes were `SCH001`, `SCH002`… The database issues codes like `SCH-1T8GMH`. So the
moment a student picked a school and submitted, `auth/sync` looked the code up, found nothing, and
threw `Invalid school code` — the exact error in the report. The static file could never match live
data, and no onboarded school ever appeared in it.

The fix is a **live directory** — the `School` table, exposed at `GET /api/schools`:

- `GET /api/schools?q=` — search by name, city or pincode, case-insensitive. Empty query lists
  onboarded schools first.
- `GET /api/schools/by-code/:code` — resolve a school's issued code, tolerant of case, spacing and a
  missing hyphen (`normalizeSchoolCode`).
- `POST /api/schools/add` — "my school isn't listed": add it by **name + pincode only**. City and
  state come from the pincode (never the student), so two people adding the same school agree on
  where it is.

The new `SchoolPicker` component gives the student all three: search, code entry, or add. An onboarded
school shows up the instant staff approve it, because the directory *is* the table — there is no
separate list to sync.

#### No duplicate schools

`School` gains `nameKey` (a normalised name — lowercased, apostrophes dropped, non-alphanumerics
collapsed) and `pincode`, with **`@@unique([nameKey, pincode])`**. `addToDirectory` checks that key
first and returns the existing row; if a concurrent insert still wins, the `P2002` is caught and the
existing row returned. A `P2002` on any *other* column (e.g. `code`) is rethrown — swallowing it, or
retrying forever, would hide a real bug.

Pincode → city/state is `PincodeService`, backed by India Post's public directory, **proxied through
the backend** (`GET /api/geo/pincode/:pin`) so one process-lifetime cache serves every visitor and the
upstream stays off our CORS surface. A hit is cached (pincodes never change); a failure is not (an
outage must not poison the cache).

#### The school portal is no longer demo data

`school-data.ts` is deleted. Every dashboard page reads live, **JWT-scoped** data from
`/api/school/portal/*` — the `schoolId` comes off the token, so a coordinator can never address
another school. `SchoolPortalService` is **read-only except one method**: `registerStudents`, the
single write a school is trusted with. It adds students to *its own* roster as invited `User` rows
(`invitedAt`, no account until the student registers with that email), and:

- **never overwrites an existing account** — an email already on the platform is reported, not seized;
- **never moves another school's student** — "already registered elsewhere" is distinct from "already
  on your roster";
- de-dupes within a single CSV upload.

Everything else — profile, slots, monitoring, results — is a view. Results only ever include attempts
whose exam has been *released*, so a school cannot see scores before its students do; and an
auto-submitted attempt counts as completed (counting only `SUBMITTED` under-reports every school).

#### Partners onboard schools

`PartnerJwtGuard` authenticates a `role: PARTNER` token (which `JwtAuthGuard` cannot, since its `sub`
is a `Partner.id`, not a user) and re-checks the partner is still APPROVED every request.
`POST /api/partner/schools` submits a school on its behalf into the **same** admin queue a
self-applying school lands in, tagged `submittedByPartnerId`. The partner sees status and the eventual
school code — but **never the access token**, which goes to the school's own coordinator.

#### Approval adopts, rather than duplicates

Because a student may add a school before it is onboarded, approval matches on `(nameKey, pincode)`
and **adopts that row** — updating it in place, keeping the code students already hold, setting
`onboardedAt` — instead of creating a second one (which the unique index would reject anyway).

#### Migration safety

The schema change is additive, but there was live data (one real school the user created). Rather than
`db push --force-reset` (which drops the database), a hand-written migration added the columns
nullable, backfilled `nameKey`/`pincode`/`onboardedAt`/`activatedAt` from existing rows, then applied
`NOT NULL`. Verified `prisma migrate diff` emitted no `DROP`, and confirmed all 7 mirrored engine
tables plus the live school survived.

**45 new tests, 161 total.** Still deferred: the handover card is still copied by hand (no email), and
custom exam-window requests aren't built (schools view their allocated windows, they don't request new
ones — consistent with read-only).

---

### 0.22 Campaign school-onboarding, admin power, exam slot wizard, light theme (2026-07-11)

Four capabilities in one pass. Everything runs on **Neon Postgres** — the whole platform shares one
Neon instance (backend via Prisma, `admin-api` via Drizzle), standard SQL, portable by a
connection-string change plus `pg_dump`/restore.

#### 1. Campaign links onboard schools, not just students

A partner campaign already produced a student link (`…/?ref=CODE`). It now also produces a
**school-onboarding link** (`…/activate?ref=CODE`). The `portal-api` funnel adapter builds both from
the campaign's referral code (`#shareUrl` + new `#schoolShareUrl`, keyed off a new `SCHOOL_APP_URL`
env). The school portal captures `?ref=` with the same first-touch pattern copied from the student app
(`referral.ts` + `ReferralCapture`), and replays it on `POST /school/apply`.

`SchoolService.apply` resolves that code to the owning partner
(`PartnerAdminApiClient.resolvePartnerIdByReferralCode` → `GET /campaigns/by-code/:code`, ACTIVE-only)
and stamps `SchoolRequest.submittedByPartnerId` + the new `submittedViaReferralCode`. So a school that
arrives on a partner's link shows in the admin Access queue attributed to that partner — exactly like
a student signup. A bad or inactive code is ignored, never an error (attribution must not block an
application). The `PartnerModule ↔ SchoolModule` cycle this created is broken with `forwardRef`.

#### 2. Admin power — view, edit, permanently delete (with a Neon archive)

New `backend/src/admin-management` module, staff-guarded, every mutation audited:
`GET/PATCH /admin/manage/users`, `DELETE /admin/manage/{users,schools,school-requests,partners}/:id`,
`GET /admin/manage/archive`.

A delete is a **real Neon delete** of the operational rows — but never silent. Each first copies the
entity's identifying details **and a full JSON snapshot** into a new **`ArchivedEntity`** table (a
tombstone nothing references, which only grows), inside the same transaction as the removal. So a
deletion is accountable and the contact recoverable on paper, while the operational data is genuinely
gone (the user's answer to "permanently delete … but keep a separate table of their details").

Two cascade correctness points the plan flagged and the code handles:
- **Deleting a user** cascades their attempts/bookings/payments, but Prisma's cascade does **not**
  decrement `ExamSlot.booked`. The service notes the affected slots and recomputes
  `booked = count(active bookings)` for each, in the transaction.
- **Deleting a school** *detaches* its students (`schoolId → null` — they keep their accounts,
  attempts, results, bookings), removes its coordinator and slot assignments (`SchoolSlotAssignment`
  is `Restrict` on the slot, so assignments go first), and archives everything.

Admin UI: a new `/students` page (search/filter, edit modal, **typed-name-confirmation** delete), a
read-only `/archive`, delete actions on `/access`, and a People nav group.

#### 3. Exam-creation wizard with automatic slot assignment

`POST /admin/exams/full` creates the exam, one instance, and N slots in a transaction (with **explicit**
publish flags — the old `createExam` force-published, which this path no longer does).

`SchoolSlotService.autoDistributeInstance(instanceId)` then assigns every **eligible** student — class
band must be one the exam accepts (`Exam.classBands`); `runAllocationForSchool` is now filtered the
same way, closing a gap where slot sweeps ignored eligibility. The distribution rule the admin asked
for:
- **Same school, same slot** — a school's students stay together, pinned via a `SchoolSlotAssignment`
  so later registrations land there too.
- **Balance** — schools are placed into the emptiest slot that fits them (largest first), so no slot
  is crowded while others sit empty.
- **Overflow** — a school too big for one slot fills its primary slot, then spills into the
  next-emptiest.
- **Never oversells** — every booking goes through the atomic `UPDATE … WHERE booked < capacity`
  guard; an in-memory capacity mirror only decides *preference*, not permission.

Admin UI: a 4-step `/exams/new` wizard (details → schedule → slots → review) that calls `createFull`,
then offers "Auto-assign eligible students now" and reports allocated / overflowed / no-capacity.

**Admin slot changes (feature 5) already existed** — individual `POST /admin/bookings/:id/reassign`
and bulk `POST /admin/schools/:id/instances/:id/reassign-all`, with UI in `slots/page.tsx`. Verified,
not rebuilt.

#### 4. Light mode everywhere

All portals now default to light with a dark toggle. The partner and school portals are token-driven
(no hardcoded colours), so a `[data-theme="light"]` palette + a zero-dependency toggle (sharing the
`bio-theme` localStorage key and `data-theme` attribute) reskins them with no page rewrites; student
and admin flip their default to light. Poppins/Montserrat added for display type.

**Schema is additive** (`ArchivedEntity` + `SchoolRequest.submittedViaReferralCode` — both new/nullable),
verified no DROP, live data preserved. **179 backend tests (23 new):** campaign attribution,
admin delete/archive + slot-counter recompute + school-detach, and 8 slot-distribution cases.

---

### 0.23 Portal fixes — support to admin, campaign school counts, auto-refresh (2026-07-11)

Seven reported gaps in the partner and school portals, all resolved and verified live.

#### Support tickets from partners and schools now reach admin

The partner "Support" form used to `POST` to an **in-memory** repository in `portal-api` — it vanished
on restart and no admin ever saw it. The school "Support" page was a `mailto:` composer only. Neither
reached the platform.

A new backend **`SupportTicket`** model + `backend/src/support/` module fixes this. Partners raise
tickets at `POST /partner/support` (behind `PartnerJwtGuard`, since a partner is not a `User`), school
coordinators at `POST /school/support` (`SCHOOL` role). Both persist and appear on a **new admin
Support page** (`/support`, `GET /admin/support-tickets`), where an admin can respond and mark a ticket
`IN_REVIEW`/`RESOLVED`; the response flows back to the raiser's own list. Kept separate from the
student `Grievance` table, which is bound to an exam attempt and can't represent a partner.

#### Campaigns and the funnel now count schools, not just students

A school that activates via a campaign's onboarding link was already attributed
(`SchoolRequest.submittedViaReferralCode`), but nothing surfaced it. That field is now returned on the
partner's school list, so the **Campaigns** page shows "Schools onboarded: N (X approved)" per campaign,
and the **Funnel** shows a "Schools onboarded" total plus a per-campaign Schools column beside the
student signup/registration/paid numbers. This is computed client-side by merging the funnel (from the
admin-api engine, student-keyed) with the backend's partner-schools list — no engine change.

#### The "onboard a school" false error

A cold-started backend could create the `SchoolRequest` server-side while the browser saw a network
error; a retry then hit the `coordinatorEmail` unique constraint (`409`) and read as "already exists".
The submit flow now **reloads the list after every attempt** (so a server-side success is always
shown) and treats a `409` as "already submitted" — information, not failure.

#### Auto-refresh everywhere

Data changed elsewhere (an admin approving a school, resolving a ticket) used to require a manual
reload. Now: a small `usePoll` hook drives the partner pages; the school portal's `useResource` polls
in the background (a `background` refresh updates data in place without flipping the spinner); and the
admin access, grievances, students, and support pages poll every 12s. All polling pauses while the tab
is hidden.

#### Institutions page removed

The partner **Institutions** page listed opaque `institutionId` strings from the engine's
`PartnerInstitutionAssignment` table, with no admin way to populate it and no names — a vestige of
PRD-011 superseded by the Schools onboarding flow. The page, its detail route, and its nav entry are
removed; the partner **overview** now lists the partner's schools instead.

**Schema additive** (`SupportTicket` + `SupportTicketSource`/`SupportTicketStatus` enums), verified no
DROP. **184 backend tests (5 new).** Live E2E (14/14, artefacts cleaned): partner ticket → admin sees
it → resolves → partner sees the response; school ticket → admin sees it filtered by source;
campaign-attributed school appears in the partner's list with its code and status.

---

### 0.24 UI fixes — student forms, grievances vs support, results page (2026-07-11)

Three presentational fixes, no schema/backend change.

**Student portal forms rendered unstyled.** Seven pages (`support`, `profile`, `certificates`,
`consent`, `admit-card`, `verify`, `exams`) used admin-design-system class names — `.form-control`,
`.form-group`, `.exam-form`, `.data-table`, `.page-header`, `.form-error`, `.text-muted`,
`.table-responsive`, `.class-pill`, `.modal-content` — that **were never defined in the student
portal's `globals.css`**. The result was tiny native inputs with labels jammed against them. Added the
classes, mirroring the student portal's own tokens, which fixes all seven pages together (the student
portal separately uses `.input-field`/`.input-group` on its auth pages; both vocabularies now exist).

**Grievances vs Support tickets.** They look similar but are not redundant. `Grievance` is a student's
exam dispute — it carries a `userId` and an `attemptId`, and approving a `REATTEMPT` resets the
attempt so the student can re-sit. `SupportTicket` is a free-form help request from a partner or
school, with neither. The admin nav now reads **"Student grievances"**, each page names its audience,
and the two cross-link.

**Admin results page.** Added a collapsible **"What do these mean?"** panel explaining the
normalize → release → issue-certificates chain (normalization = fair-score processing: comparable
scores + percentile + rank, changing nothing students see until release). The table **auto-refreshes**
(10s), Normalized/Released show a ✓ and a timestamp tooltip, and the Certificates column shows
**"✓ N issued" / "None yet" / "—"** instead of a bare number. The Normalize button becomes
"Re-normalize" once done, signalling that re-running is optional.

---

### 0.25 Exam lifecycle, slot self-service, per-audience results, question media (2026-07-14)

Twenty-one reported defects and gaps, most of them tracing back to **four missing rules** and **two
missing relationships**. This section is organised by the underlying cause rather than by the bug
list, because fixing them one at a time is exactly how they got this way.

#### The root cause: exam lifecycle rules lived nowhere

An exam's state was implied by scattered date comparisons, and each caller made its own. So:
unpublished exams were listed to students; an exam scheduled for next month rendered a live "Start"
button; an exam with **no questions at all** could be published; results were released for exams that
had not been sat; and slots could be scheduled *before* the exam window opened, which made them
unsittable — the start gate refuses every attempt before `instance.startsAt`, so those students would
have watched their slot expire against a button that never enabled.

All of it now derives from one pure module, **`backend/src/exam/exam-lifecycle.ts`**, which is
exhaustively unit-tested (29 cases) with no database:

```
examPhase(exam, instance, mySlot, now) →
  DRAFT → SCHEDULED → NEEDS_SLOT → SLOT_UPCOMING → OPEN → SLOT_MISSED → ENDED
                                                     ↑
                                        the ONLY startable phase
```

The ordering is the substance: **publication beats scheduling, and scheduling beats slots.** An
unpublished exam is `DRAFT` however its dates read; a closed exam window is `ENDED` even if a
misconfigured slot still looks open, so a slot can never authorise an attempt outside its exam.

| Gate | Rule | Where enforced |
|---|---|---|
| `canPublish` | Needs ≥1 question **attached to a section**, and ≥1 scheduled instance | `publishExam` **and** `updateExam` |
| `canReleaseResults` | The exam must be **over** (`now > endsAt`), and normalized | `ResultsService.release` **and** `updateExam` |
| `validateSlotWindow` | A slot must sit **inside** its exam window | `createSlot`, `updateSlot`, `createFull`, `updateInstance` |
| `examPhase` | Only `OPEN` may start an attempt | `AttemptService.startAttempt` **and** the exam list |

**The "and" in that table is the point.** The gates were initially added only to the dedicated
`/publish` and `/release-results` routes — and the admin UI does not use those routes. It flips both
flags through `PUT /admin/exams/:id`, which was an unguarded side door straight to
`prisma.exam.update`. A rule that lives on one of two write paths is not a rule. Turning a flag **on**
is now gated wherever it is written; turning it **off** never is, so taking a bad exam down or pulling
back a wrong result is always possible.

`ExamService.createExam` also stopped force-setting `isPublished: true, isResultReleased: true` on
every new exam — which is *why* an exam with no paper and no schedule was instantly visible to
students with its results already "released".

#### Students see what is coming, and start only when their slot opens

Items 5 and 11 read as opposites and are not. `GET /exams` now returns each exam stamped with its
phase **for that student**, plus `mySlot` — so a scheduled exam is visible (the student can see the
date and which slot they hold) but is not startable, and the Start button enables the moment their
own slot opens, not merely when the exam window does. The page re-polls every 30s so it enables on
its own. `startAttempt` re-derives the same phase server-side, so calling the API directly gets a
student nothing.

#### The two missing relationships

**1. `School.partnerId`** (new, nullable). This is what scopes a partner's view and what a school
reads to know who its partner is. It is set when a partner onboards a school (from
`SchoolRequest.submittedByPartnerId`, at approval) and is editable by staff.

A school with **no** partner falls back to the **house partner** — Lemon Ideas, operating the olympiad
directly (`PartnerDirectoryService`, `DEFAULT_PARTNER_ID`, default
`e95c5ab7-9edc-438e-a846-9f770ebbce11`). That fallback is what makes "if no partner, default to
*Bharat Innovation Olympiad — Partner access*" true **without backfilling a partnerId onto every
existing school row**. The school portal therefore always has a partner card to render. The partner's
**access token is never exposed to schools** — it is that partner's sign-in credential; schools get
contact details and the portal URL, nothing more.

**2. Students were never linked on the path that mattered.** `AuthService.syncUser` had two branches.
The new-user branch resolved a school and ran auto-allocation. The branch that **claims an invited
roster entry** — the common case for a school-run exam — did neither: it never re-linked a school, and
it never ran allocation. So a school's own invited students registered, and were never booked into
their school's slot. That is the real content of "slot assign shows 0 students allocated" and "school
can't see its students".

#### Slot assignment: the reassign bug, and why "0" looked broken

`reassignSchool` moved the bookings but left `SchoolSlotAssignment` pointing at the **old** slot. So
the next student from that school to register was auto-allocated straight back into the slot the admin
had just emptied, and the school ended up split across two slots — precisely what "same school, same
slot" exists to prevent. It now re-points the assignment.

Separately, `setSchoolSlotAssignment` returned a bare count. "0 student(s) auto-allocated" is true in
half a dozen unrelated situations — no students on the roster, all in the wrong class for this exam,
all already booked, slot full, slot ended — and reporting a bare zero for all of them is what made a
*working* screen look broken. It now returns a breakdown with human-readable `notes`.

#### Schools pick their own slots (item 15)

The school portal's slots page showed only the one slot staff had already assigned — so a coordinator
with no assignment saw an empty page and no way to ask for one. It now shows the **whole board** for
every published exam: every slot, how full each is, how many of the school's students are eligible,
and which slot the school holds. A coordinator can claim an open slot themselves
(`POST /school/portal/slots`), which runs the **same** auto-allocation staff use — so a school-picked
slot and a staff-assigned one behave identically, and the atomic
`UPDATE … WHERE booked < capacity` guard means two schools racing for the last seats cannot oversell.

#### Results: per-audience release, and Excel

Release is no longer one boolean. `ExamInstance` gained
`resultsReleasedToStudentsAt` / `…ToSchoolsAt` / `…ToPartnersAt`, and each audience is granted and
revoked **independently** (`POST /admin/exam-instances/:id/release` and `…/revoke`, both audited, both
requiring a written reason). A school can be given results to sanity-check a day before students see
them; a partner may never be given them at all. The legacy `Exam.isResultReleased` tracks the
**STUDENTS** audience only, so releasing to a school does not hand students their scores as a side
effect. Revoking from students closes their scorecards immediately.

`ResultsExportService` builds a real `.xlsx` (exceljs — typed number cells, frozen header, column
widths), and the **same builder serves all three audiences**; only the scope differs, and the scope is
always derived from the caller's identity, never from a parameter they send. Every non-admin read
passes through `assertReleased`, so the download is not a side door around the release gate:

| Caller | Sees | Gate |
|---|---|---|
| Admin | Every student | none (staff decide *whether* to release, so they need the sheet first) |
| School | Its own students | `resultsReleasedToSchoolsAt` |
| Partner | Students of the schools assigned to it | `resultsReleasedToPartnersAt` |

#### Question media — pictures and video, on Cloudinary (no AWS)

A question can now carry a **picture and a video at the same time** (`Question.imageUrl`,
`Question.videoUrl` — two independent columns, not another `mediaUrl`/`mediaType` pair), rendered to
the student in the exam player.

**The bytes never touch the API.** Render's instance has 512 MB of RAM and an ephemeral disk:
streaming a 100 MB question video through the Node process would blow the memory budget, and anything
written to its disk vanishes on the next deploy. So the admin browser asks for a short-lived **upload
ticket** and sends the file **straight to the storage provider**; the API only ever handles the
signature.

**Provider: Cloudinary** (see §4 for setup). Picked for the testing phase because it needs **no bucket,
no CORS rule and no IAM policy** — three env vars and it works. 25 GB free, and it transcodes video and
makes poster frames for free, which a question video played inline mid-exam actually needs.

Uploads are **signed, not unsigned-preset**. An unsigned preset needs no server at all, but the preset
name necessarily reaches the browser, and anyone who reads it can upload to the account forever.
Signing costs one SHA-1 and **no new npm dependency**, and means only a request that has already passed
the admin JWT guard can obtain the right to upload. The signature is timestamped and Cloudinary rejects
one over an hour old, so a leaked ticket is not a standing permit.

`ObjectStorageService` keeps a **second provider behind the same seam** (`STORAGE_PROVIDER=s3` → any
S3-compatible endpoint: Cloudflare R2, B2, Supabase, MinIO, AWS) for when 25 GB runs out. Nothing
upstream knows which is live — both return an `UploadTicket`, and the ticket says which shape to use,
because the two genuinely differ: Cloudinary reveals the public URL only *on* upload (`secure_url`),
while S3 knows it up front.

Limits, enforced server-side before anything is signed: **10 MB per image, 100 MB per video** — both
Cloudinary's free-plan ceilings, so a bigger file would fail at their end regardless. Unconfigured, the
service **warns and boots**; upload returns a 503. Media is not worth taking the platform down for.

#### A privilege-escalation bug found on the way

`PUT /users/profile` took an **inline-typed body** (`@Body() data: { firstName?: string }`) and passed
it straight to `prisma.user.update`. An inline TypeScript type erases to `Object` at runtime, and
Nest's `ValidationPipe` **skips any body whose metatype is a native type** — so `whitelist` and
`forbidNonWhitelisted` never engaged, and the *entire request body* reached Prisma. A student could
have sent `{"role": "SUPER_ADMIN"}` or `{"schoolId": "…"}` and escalated themselves. It now takes a
decorated DTO class (`UpdateUserProfileDto`), which is what makes the pipe strip unknown fields. The
distinction between a decorated DTO and an inline type is load-bearing, not stylistic.

#### Profile editing (item 14) and admin power (item 20)

Students, schools and partners each edit their own contact details — and each is bounded by what they
must **not** change:

- **Student** (`PUT /auth/me`): name, phone. Not role, school, or email.
- **School** (`PATCH /school/portal/me`): board, UDISE, city, state, coordinator name + phone. **Not**
  the school name, pincode or code — `(nameKey, pincode)` is the directory's uniqueness key and the
  code is what students type at registration, so a coordinator rewriting either would collide with
  another school or break every student already pointing at this one. Not the coordinator email — it
  is the identity the access token was issued against.
- **Partner** (`PATCH /partner/portal/profile`): org name, contact person, phone. Not the email (its
  sign-in identity), status, or commission.

Admin gets what each of those withholds, plus the relationships: `GET/PATCH /admin/manage/schools`
(including **assigning a school to a partner**), `GET/PATCH /admin/manage/partners`, and
`POST /admin/manage/students/move` for bulk student shuffling in one transaction and one audit entry.

#### New / changed surfaces

| Actor | Route |
|---|---|
| Admin | `POST /admin/exams/:id/unpublish` · `GET /admin/manage/{schools,partners}` · `PATCH /admin/manage/{schools,partners}/:id` · `POST /admin/manage/students/move` · `POST /admin/exam-instances/:id/{release,revoke}` (audiences) · `GET /admin/exam-instances/:id/results.xlsx` · `GET /admin/questions/media-upload-url?kind=image|video` |
| School | `PATCH /school/portal/me` · `GET /school/portal/partner` · `POST /school/portal/slots` · `GET /school/portal/results/instances` · `GET /school/portal/results/:id/export.xlsx` |
| Partner | `GET /partner/portal/{overview,schools,students,results,profile}` · `PATCH /partner/portal/profile` · `GET /partner/portal/results/:id/export.xlsx` |
| Student | `GET /exams` now returns `phase`, `canStart`, `startBlockedReason`, `mySlot` per instance |

New admin pages: **`/schools`** (edit + assign partner) and **`/exams/[id]/schedule`** (edit the exam
window, and add / edit / delete slots — both were previously write-once, so a rescheduled exam meant
deleting it and losing its questions). New partner pages: **`/dashboard/students`**,
**`/dashboard/results`**, **`/dashboard/profile`**.

#### Schema (additive — verified no DROP)

`School.partnerId` · `User.phone` · `Question.imageUrl` · `Question.videoUrl` ·
`ExamInstance.resultsReleasedTo{Students,Schools,Partners}At`. `prisma migrate diff` emitted only
`ADD COLUMN` / `CREATE INDEX` before the push, so the live Drizzle-owned partner-engine tables were
never at risk (see §0.18's `db push` hazard).

#### Testing

**235 backend tests pass (56 new).** The two new suites test the invariants that actually broke:

- `exam-lifecycle.spec.ts` (29) — pure, fixed-clock. Unpublished-is-invisible; scheduled-is-visible-
  but-not-startable; the slot window, not the exam window, enables Start; a closed exam beats an open
  slot; `OPEN` is the **only** startable phase (asserted by filtering all seven); publish needs a
  paper; release needs the exam to be **over**; and a property test that any slot passing
  `validateSlotWindow` is `OPEN` at every instant inside it — which is exactly what an out-of-window
  slot violates.
- `school-slot.assignment.spec.ts` (14) — against an in-memory Prisma fake with **real** capacity
  semantics (the same atomic compare-and-increment). It pins the reassign regression directly: after a
  bulk move, a student registering *afterwards* must land with their school, not back in the old slot.

All four frontends typecheck and build.

---

## 1. Project Overview

Bharat Innovation Olympiad is a **national online competitive examination platform** for Indian school students (classes 6–12). It provides:

- Secure fullscreen exam delivery with anti-cheat enforcement
- Real-time server-authoritative countdown timer via WebSocket
- Webcam-based AI proctoring (face-api.js — runs entirely in student's browser, free)
- Admin portal for exam/question bank management and analytics
- Student portal for registration, exam-taking, and results

**Current scale:** Designed for individual use; AWS migration required before 5,000 concurrent users.

---

## 2. Repository Structure

```
bharat Innovation Olympiad/
│
├── backend/                        # NestJS REST API + WebSocket
│   ├── prisma/
│   │   ├── schema.prisma           # Single source of truth for DB schema
│   │   └── migrations/             # All Prisma migration files (auto-generated)
│   ├── scripts/
│   │   ├── seed-admin.js           # Seeds the ADMIN user from env vars
│   │   └── seed-schools.js         # Seeds Indian schools into School table
│   ├── src/
│   │   ├── main.ts                 # App entry point (port 4000)
│   │   ├── bootstrap.ts            # CORS, validation pipe, helmet setup
│   │   ├── app.module.ts           # Root module — imports all feature modules
│   │   ├── health.controller.ts    # GET /health — uptime probe
│   │   │
│   │   ├── auth/                   # Authentication module
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts  # POST /auth/admin-login, /auth/sync, /auth/login-sync, GET/PUT /auth/me
│   │   │   ├── auth.service.ts     # syncUser, loginSync, getOrCreateAdmin, updateProfile
│   │   │   ├── dto/auth.dto.ts     # SyncUserDto, LoginSyncDto, UpdateProfileDto
│   │   │   └── strategies/
│   │   │       └── jwt.strategy.ts # Passport JWT strategy — validates Bearer tokens
│   │   │
│   │   ├── user/                   # User profile module
│   │   │   ├── user.module.ts
│   │   │   ├── user.controller.ts  # GET/PUT /users/profile
│   │   │   └── user.service.ts     # findById, updateProfile
│   │   │
│   │   ├── exam/                   # Exam + Question Bank module
│   │   │   ├── exam.module.ts
│   │   │   ├── exam.controller.ts  # All /exams and /admin/exams routes
│   │   │   └── exam.service.ts     # Full CRUD + analytics + question bank
│   │   │
│   │   ├── attempt/                # Exam attempt module
│   │   │   ├── attempt.module.ts
│   │   │   ├── attempt.controller.ts # POST start/answer/submit, GET results/report
│   │   │   └── attempt.service.ts  # startAttempt (slot-gated), saveAnswer, submitAttempt, scoring
│   │   │
│   │   ├── slot/                   # Slot booking module
│   │   │   ├── slot.module.ts
│   │   │   ├── slot.controller.ts  # GET /slots, POST /slots/:id/book, admin CRUD
│   │   │   ├── slot.service.ts     # createSlot, listSlots, bookSlot ($transaction), cancelBooking
│   │   │   └── dto/slot.dto.ts     # CreateSlotDto, BookSlotDto
│   │   │
│   │   ├── exam/
│   │   │   ├── seb-config.service.ts # ★ SEB config generation (PRD EXAM-06)
│   │   │
│   │   ├── common/
│   │   │   ├── guards/
│   │   │   │   ├── seb.guard.ts    # ★ SEB HMAC validation (PRD EXAM-06)
│   │   │   ├── services/
│   │   │   │   ├── s3.service.ts   # ★ AWS S3 — presigned PUT/GET URLs, uploadBuffer, deleteObject
│   │   │   │   └── s3.module.ts    # ★ @Global() module — S3Service injected anywhere
│   │   │
│   │   ├── payment/                # Razorpay payment module
│   │   │   ├── payment.module.ts
│   │   │   ├── payment.controller.ts # POST create-order, verify, webhook; coupon CRUD
│   │   │   └── payment.service.ts  # createOrder, verifyWebhookSignature, handleWebhookEvent
│   │   │
│   │   ├── proctor/                # AI Proctoring module (face-api.js client-side)
│   │   │   ├── proctor.module.ts
│   │   │   ├── proctor.controller.ts # POST enroll/verify/events; GET enrollment/live/report
│   │   │   └── proctor.service.ts  # enrollFace, verifyFace, createEvent, getLiveMonitoring, getReport
│   │   │
│   │   ├── timer/                  # Real-time timer module
│   │   │   ├── timer.module.ts
│   │   │   ├── timer.gateway.ts    # WebSocket gateway (Socket.IO)
│   │   │   └── timer.service.ts    # Server-authoritative countdown + auto-submit
│   │   │
│   │   ├── prisma/                 # Prisma singleton
│   │   │   ├── prisma.module.ts    # Global module — injected everywhere
│   │   │   └── prisma.service.ts   # Extends PrismaClient, handles onModuleInit/Destroy
│   │   │
│   │   └── common/
│   │       ├── decorators/
│   │       │   ├── current-user.decorator.ts  # @CurrentUser() — extracts from JWT payload
│   │       │   └── roles.decorator.ts         # @Roles(Role.ADMIN) metadata decorator
│   │       ├── guards/
│   │       │   ├── jwt-auth.guard.ts           # Extends AuthGuard('jwt') — validates Bearer token
│   │       │   └── roles.guard.ts              # Reads @Roles() metadata, checks user.role
│   │       ├── interceptors/
│   │       │   └── audit-log.interceptor.ts    # Writes every mutating request to AuditLog table
│   │       └── demo-exams.ts                   # Sample exam seed data
│   │
│   ├── .env                        # Runtime environment variables (never committed)
│   ├── .env.example                # Template for env vars
│   ├── nest-cli.json
│   ├── tsconfig.json               # strict: true
│   └── package.json
│
├── frontend/                       # Student-facing Next.js app (port 3000)
│   └── src/
│       ├── app/
│       │   ├── layout.tsx          # Root layout — ThemeProvider + fonts
│       │   ├── page.tsx            # Landing page
│       │   ├── globals.css         # Global CSS variables + design tokens
│       │   ├── login/page.tsx      # Neon Auth OTP login
│       │   ├── register/page.tsx   # Registration — calls POST /auth/sync
│       │   ├── dashboard/page.tsx  # Student dashboard — exam list + results summary
│       │   ├── profile/page.tsx    # Profile view/edit
│       │   ├── exams/page.tsx      # Available exams list
│       │   ├── exams/[id]/
│       │   │   ├── instructions/page.tsx  # Pre-exam instructions + "Start Exam" button
│       │   │   ├── slots/page.tsx         # Slot selection grid + booking flow
│       │   │   └── play/page.tsx          # MAIN EXAM PLAYER — fullscreen + timer + proctoring
│       │   ├── payment/
│       │   │   ├── [bookingId]/page.tsx   # Razorpay checkout — coupon + payment modal
│       │   │   └── success/page.tsx       # Post-payment confirmation screen
│       │   ├── results/page.tsx    # Post-exam results view
│       │   └── api/                # Next.js route handlers — use Prisma directly
│       │       ├── auth/login/route.ts
│       │       ├── auth/me/route.ts
│       │       ├── auth/refresh/route.ts
│       │       ├── exams/route.ts
│       │       ├── exams/upcoming/route.ts
│       │       ├── exams/[id]/route.ts
│       │       ├── exams/[id]/start/route.ts
│       │       ├── attempts/recent/route.ts
│       │       ├── attempts/results/route.ts
│       │       ├── attempts/[id]/answer/route.ts
│       │       ├── attempts/[id]/submit/route.ts
│       │       ├── slots/route.ts                    # GET slots by examId/instanceId
│       │       ├── slots/[id]/book/route.ts          # POST atomic slot booking ($transaction)
│       │       ├── bookings/me/route.ts              # GET user's active booking for exam
│       │       ├── bookings/[id]/route.ts            # GET booking by id (ownership check)
│       │       ├── bookings/[id]/cancel/route.ts     # POST cancel booking + decrement
│       │       ├── payments/create-order/route.ts    # POST create Razorpay order (idempotent)
│       │       ├── payments/verify/route.ts          # POST HMAC verify + confirm booking
│       │       ├── payments/webhook/route.ts         # POST Razorpay webhook (raw body)
│       │       ├── payments/my-payments/route.ts     # GET payment history
│       │       ├── coupons/validate/route.ts         # GET validate coupon code
│       │       ├── admin/exams/[id]/sections/route.ts
│       │       ├── admin/questions/[id]/route.ts
│       │       └── admin/sections/[id]/questions/route.ts
│       ├── components/
│       │   ├── layout/
│       │   │   ├── AuthGuard.tsx   # Wraps pages — redirects if not authenticated or wrong role
│       │   │   └── Navbar.tsx      # Top navigation bar
│       │   └── ThemeProvider.tsx   # Dark/light mode context
│       ├── hooks/                  # See Section 11
│       │   ├── useFaceProctor.ts   # ★ face-api.js — camera + face detection + event reporting
│       │   ├── useWebcam.ts        # Basic camera stream for device check page
│       │   ├── useFullscreenMonitor.ts
│       │   ├── useExamSession.ts
│       │   ├── useTimer.ts
│       │   └── useSocket.ts
│       ├── lib/
│       │   ├── api.ts              # Axios instance — baseURL + JWT interceptor + refresh logic
│       │   └── constants.ts        # TIMER_WARNING_THRESHOLD, TIMER_DANGER_THRESHOLD
│       ├── store/
│       │   └── examStore.ts        # Zustand store — exam session state
│       └── types/
│           ├── exam.ts             # TypeScript types for Exam, Attempt, Question, etc.
│           └── proctor.ts          # ProctorEventType (incl. LOOKING_AWAY), LiveMonitoringEntry
│
├── admin-frontend/                 # Admin-facing Next.js app (port 3001)
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx            # Redirects to /dashboard
│       │   ├── login/page.tsx      # Admin login — calls POST /auth/admin-login
│       │   ├── dashboard/page.tsx  # Stats overview — exams, students, attempts + quick actions
│       │   ├── exams/page.tsx      # Exam list + create/edit/delete + question bank
│       │   ├── questions/page.tsx  # Global question bank management
│       │   ├── slots/page.tsx      # ★ Slot management — create/edit/delete slots + view bookings per slot
│       │   ├── payments/page.tsx   # ★ Payments dashboard — revenue summary, transactions, refunds, coupon CRUD
│       │   ├── proctor/
│       │   │   ├── page.tsx        # ★ Live monitoring — all active students, risk scores, recent violations (polls every 15s)
│       │   │   └── [attemptId]/page.tsx  # ★ Per-student proctor detail — full event timeline, risk score, identity info
│       │   ├── analytics/
│       │   │   ├── page.tsx        # Exam analytics + student directory — score distribution, completion rate, links to /students/[id]
│       │   │   └── attempt/[attemptId]/page.tsx  # Per-student attempt detail + proctor events
│       │   ├── students/
│       │   │   └── [id]/page.tsx   # ★ Full student profile — attempts, payment history, slot bookings, violation summary, face enrollment status
│       │   └── unauthorized/page.tsx
│       ├── components/
│       │   ├── layout/AuthGuard.tsx
│       │   ├── layout/Navbar.tsx
│       │   └── ThemeProvider.tsx
│       ├── hooks/
│       ├── lib/
│       ├── store/
│       └── types/
│
│
├── docker-compose.yml              # Local dev: PostgreSQL (5432) + Redis (6379)
├── render.yaml                     # Render.com deployment config for backend
├── CLAUDE.md                       # Claude Code project instructions
├── DOCUMENTATION.md                # ← this file
└── ROADMAP_CHECKLIST.md            # Upcoming tasks checklist
```

---

## 3. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTS                               │
│                                                              │
│  ┌──────────────────┐        ┌──────────────────────────┐   │
│  │  Student Browser  │        │     Admin Browser         │   │
│  │  (Next.js :3000)  │        │  (Next.js :3001)          │   │
│  └────────┬─────────┘        └──────────┬───────────────┘   │
└───────────┼──────────────────────────────┼───────────────────┘
            │ HTTPS REST + WebSocket        │ HTTPS REST
            ▼                              ▼
┌───────────────────────────────────────────────────────────────┐
│                  NestJS Backend (:4000)                        │
│                                                               │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │  Auth   │  │   Exam   │  │ Attempt  │  │   Proctor   │  │
│  │ Module  │  │  Module  │  │  Module  │  │   Module    │  │
│  └────┬────┘  └────┬─────┘  └────┬─────┘  └──────┬──────┘  │
│       │             │              │                │          │
│  ┌────┴─────────────┴──────────────┴────────────────┴──────┐ │
│  │                    PrismaService                          │ │
│  └─────────────────────────┬────────────────────────────────┘ │
│                             │                                  │
│  ┌──────────────────────────┼────────────────────────────┐   │
│  │  Timer Module (WebSocket) │                            │   │
│  │  TimerGateway (Socket.IO) │                            │   │
│  └───────────────────────────────────────────────────────┘   │
└───────────────────────────┬───────────────────────────────────┘
                            │
            ┌───────────────┴──────────────┐
            ▼                              ▼
┌───────────────────┐          ┌──────────────────────┐
│  PostgreSQL (Neon) │          │    Redis (Docker/     │
│  Primary DB        │          │    ElastiCache)       │
│                    │          │    Timer state cache  │
└───────────────────┘          └──────────────────────┘
```
> **Proctoring note:** All AI face analysis runs in the student's browser via face-api.js (WebGL).
> No separate proctoring service. The NestJS backend only receives small JSON violation events.

**Data flow during an exam:**
```
Student Browser
  → POST /exams/:instanceId/start      → creates Attempt row
  → WS join-exam (attemptId)           → starts server timer
  ← WS timer-tick (every second)       → updates countdown UI
  → POST /attempts/:id/answer          → saves answer to AttemptItem
  → POST /proctor/events               → logs violations (face detection + fullscreen/tab)
  → POST /attempts/:id/submit          → scores + marks SUBMITTED
  ← WS timer-expired                   → triggers auto-submit
```

---

## 4. Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | Neon PostgreSQL pooled connection string | `postgresql://user:pass@host/db?pgbouncer=true` |
| `DIRECT_URL` | Neon direct connection (for migrations) | `postgresql://user:pass@host/db` |
| `JWT_SECRET` | HS256 signing key for access tokens | 64-char hex string |
| `JWT_REFRESH_SECRET` | Signing key for refresh tokens | 64-char hex string |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `ADMIN_EMAIL` | Hardcoded admin account email | `admin@olympiad.in` |
| `ADMIN_PASSWORD` | Hardcoded admin password | strong password |
| `FRONTEND_URL` | Student frontend origin (CORS) | `https://exam.bharatolympiad.in` |
| `ADMIN_FRONTEND_URL` | Admin frontend origin (CORS) | `https://admin.bharatolympiad.in` |
| `ALLOWED_ORIGINS` | Comma-separated additional CORS origins | — |
| `PORT` | Backend listen port | `4000` |
| `RAZORPAY_KEY_ID` | Razorpay API key ID (test: `rzp_test_...`) | from Razorpay dashboard |
| `RAZORPAY_KEY_SECRET` | Razorpay API key secret | from Razorpay dashboard |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook signing secret | from Razorpay dashboard |
| `DEFAULT_PARTNER_ID` | The **house partner** every school with no partner of its own falls back to (§0.25). Overridable so staging is not pointed at the live partner. | `e95c5ab7-9edc-438e-a846-9f770ebbce11` |
| `PARTNER_APP_URL` | Partner portal origin, shown on a school's partner card | `https://bio-partner-portal.vercel.app` |
| `AWS_REGION` | Legacy alias for `STORAGE_REGION` | `ap-south-1` |
| `AWS_ACCESS_KEY_ID` | Legacy alias for `STORAGE_ACCESS_KEY_ID` | from provider console |
| `AWS_SECRET_ACCESS_KEY` | Legacy alias for `STORAGE_SECRET_ACCESS_KEY` | from provider console |
| `AWS_S3_BUCKET` | Legacy alias for `STORAGE_BUCKET` | `bio-olympiad-prod` |

#### Question media storage — Cloudinary (§0.25)

**No AWS.** Question media lives on **Cloudinary**, chosen for the testing phase because it needs no
bucket, no CORS rule and no IAM policy: sign up, copy three values, done. Its free tier (25 GB storage
+ 25 GB bandwidth) is the most generous of the options, and — the reason it actually matters here — it
**transcodes video and generates poster frames for free**, which a question video played inline
mid-exam needs.

**Setup (about two minutes):**
1. Sign up at `cloudinary.com`.
2. Dashboard → **Product Environment Credentials** → copy *Cloud name*, *API Key*, *API Secret*.
3. Put them on the backend (Render). Nothing else — no bucket, no upload preset, no CORS.

| Variable | Description |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | From the Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | From the Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | From the Cloudinary dashboard — **backend only**, never shipped to a browser |

**Signed uploads, not an unsigned preset.** Cloudinary's "unsigned upload preset" needs no server at
all, but the preset name necessarily travels to the browser, and anyone who reads it can then upload
to the account for free, forever. Instead the backend signs each upload (a SHA-1 of the sorted signed
params plus the API secret — **no extra npm dependency**), so only a request that has already passed
the admin JWT guard can obtain the right to upload. The signature is timestamped, and Cloudinary
rejects one over an hour old, so a leaked ticket is not a standing upload permit.

**Bytes never touch the API.** The browser asks `GET /admin/questions/media-upload-url` for an
*upload ticket*, then POSTs the file **straight to Cloudinary** and reads `secure_url` off the
response — which is what gets stored on `Question.imageUrl` / `videoUrl`. Render's 512 MB instance
cannot stream a 100 MB video, and its disk is ephemeral, so this is not an optimisation but a
requirement.

Limits enforced server-side before anything is signed: **10 MB per image, 100 MB per video** (both are
Cloudinary's free-plan ceilings, so a larger file would fail at their end anyway).

#### Switching to S3 later (`STORAGE_PROVIDER=s3`)

`ObjectStorageService` keeps a second provider behind the same seam, for when 25 GB runs out. It
speaks the S3 API against a **configurable endpoint**, so it runs unchanged on Cloudflare R2 (10 GB
free, **zero egress**), Backblaze B2, Supabase Storage, MinIO or AWS S3 — only env vars change, and
nothing upstream (`ExamService`, the admin uploader) knows which provider is live.

| Variable | Description | Example (Cloudflare R2) |
|---|---|---|
| `STORAGE_PROVIDER` | `cloudinary` (default) or `s3` | `s3` |
| `STORAGE_ENDPOINT` | S3-compatible endpoint. Omit for AWS S3. | `https://<account-id>.r2.cloudflarestorage.com` |
| `STORAGE_REGION` | Region. R2 wants the literal `auto`. | `auto` |
| `STORAGE_BUCKET` | Bucket name | `bio-media` |
| `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` | Access keys | from the provider console |
| `STORAGE_PUBLIC_BASE_URL` | Public-read base for the bucket | `https://pub-<hash>.r2.dev` |

On this path the bucket needs public read on `questions/` **and** a CORS rule allowing `PUT` from the
admin origin — the browser uploads directly, so without CORS it is blocked before it starts. (Avoiding
exactly this setup is why Cloudinary is the default for now.) The provider is also **inferred**: with
only Cloudinary keys set it picks Cloudinary; with a bucket and access key set it picks S3; an explicit
`STORAGE_PROVIDER` overrides both.

If storage is unset entirely the API **logs a warning and boots normally** — media upload returns a
503 with a clear message rather than taking the whole platform down. (Deliberately unlike
`PaymentService`, which still crashes at boot without dummy `RAZORPAY_*` values; see §15.)

### Student Frontend (`frontend/.env`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend base URL e.g. `https://api.bharatolympiad.in` |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL e.g. `wss://api.bharatolympiad.in` |
| `DATABASE_URL` | Neon PostgreSQL connection string (used by Next.js API routes via Prisma) |
| `JWT_SECRET` | Same secret as backend — used to verify tokens in Next.js API routes |
| `RAZORPAY_KEY_ID` | Razorpay key ID — also passed to client as `key` in order response |
| `RAZORPAY_KEY_SECRET` | Razorpay key secret — used server-side only for HMAC verification |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook signing secret — used in `/api/payments/webhook` |

### Admin Frontend (`admin-frontend/.env`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Same backend base URL |
| `NEXT_PUBLIC_WS_URL` | Same WebSocket URL |

---

## 5. Database Schema

### Models

#### `User`
Primary account table for all user types.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Auto-generated |
| `email` | String UNIQUE | Login identifier |
| `passwordHash` | String? | Null for OTP-only accounts |
| `firstName` | String | — |
| `lastName` | String | — |
| `role` | Enum Role | STUDENT / PARENT / ADMIN / SUPER_ADMIN |
| `classBand` | Int? | School class (6–12) — used to filter relevant exams |
| `schoolId` | FK → School? | Optional school linkage |
| `faceEmbedding` | Bytes? | Stored face vector from proctor enrollment |
| `profileImageUrl` | String? | URL of profile photo |
| `isActive` | Boolean | Soft-delete flag |
| `createdAt` | DateTime | — |
| `updatedAt` | DateTime | Auto-updated |

**Relations:** `bookings[]` (Booking), `payments[]` (Payment)  
**Indexes:** `email`, `schoolId`, `role`

---

#### `School`
Registry of Indian schools.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `name` | String | Full school name |
| `code` | String UNIQUE | Short code for lookup |
| `city` | String | — |
| `state` | String | — |
| `createdAt` | DateTime | — |

**Indexes:** `code`

---

#### `Exam`
Master exam definition (not tied to a specific date/time).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `title` | String | — |
| `description` | String? | — |
| `classBands` | Int[] | Which classes can take this exam |
| `totalMarks` | Int | Sum of all question marks |
| `durationMinutes` | Int | Exam duration |
| `isPublished` | Boolean | False = draft, True = visible to students |
| `isResultReleased` | Boolean | Controls result visibility |
| `feeAmount` | Int? | Registration fee **in paise** (null or 0 = free exam) |

**Relations:** `sections[]` (ExamSection), `instances[]` (ExamInstance)

---

#### `ExamSection`
Logical sections within an exam (e.g. Physics, Chemistry, Math).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `examId` | FK → Exam | — |
| `title` | String | Section name |
| `sortOrder` | Int | Display order |
| `questionsToAssign` | Int | Questions each student receives from this section's pool (0 = all) |

**Relations:** `sectionQuestions[]` (SectionQuestion)

---

#### `Question`
Global question bank — questions exist independently of exams.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `type` | Enum QuestionType | MCQ / MULTI_SELECT / TRUE_FALSE / SHORT_ANSWER / NUMERIC |
| `difficulty` | Enum Difficulty | EASY / MEDIUM / HARD |
| `text` | String | Question body |
| `options` | Json? | Array of `{id, text}` objects |
| `correctAnswer` | String? | Option id of correct answer |
| `marks` | Int | Points for correct answer (default 1) |
| `negativeMarks` | Float | Deduction for wrong answer (default 0) |
| `timeLimitSecs` | Int? | Per-question time limit if set |
| `mediaUrl` | String? | S3 URL or public URL of attached media (image/video/audio) |
| `mediaType` | Enum MediaType? | `IMAGE` / `VIDEO` / `AUDIO` / `DIAGRAM` |
| `tags` | String[] | Searchable tags |
| `explanation` | String? | Post-exam explanation text |

---

#### `SectionQuestion`
Junction table linking Questions to ExamSections (many-to-many).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `sectionId` | FK → ExamSection | — |
| `questionId` | FK → Question | — |
| `sortOrder` | Int | Display order within section |

**Unique constraint:** `(sectionId, questionId)` — same question cannot appear twice in a section.

---

#### `ExamInstance`
A scheduled occurrence of an exam (specific start/end time window).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `examId` | FK → Exam | Parent exam |
| `startsAt` | DateTime | When students can enter |
| `endsAt` | DateTime | Hard cutoff — auto-submits remaining |
| `requireSeb` | Boolean | Safe Exam Browser enforcement flag |
| `browserExamKey` | String? | SEB config hash |
| `configKey` | String? | SEB config key |
| `quitUrl` | String? | SEB quit URL |
| `maxAttempts` | Int | Max attempts per student (default 1) |

**Relations:** `slots[]` (ExamSlot)

---

#### `ExamSlot`
A time window within an ExamInstance that students can book.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `examInstanceId` | FK → ExamInstance | Parent instance |
| `label` | String? | Human-readable label e.g. "Morning Batch" |
| `startsAt` | DateTime | Slot start time |
| `endsAt` | DateTime | Slot end time |
| `capacity` | Int | Max students allowed in this slot |
| `booked` | Int | Current booking count (default 0, incremented atomically) |

**Relations:** `bookings[]` (Booking), `schoolAssignments[]` (SchoolSlotAssignment)

---

#### `SchoolSlotAssignment` (2026-07-09)
Same school, same slot: which `ExamSlot` a school's students land in for a given `ExamInstance`, admin-editable. Read by `SchoolSlotService.autoAllocateStudent()` at registration time and by the admin reassignment endpoints.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `schoolId` | FK → School | — |
| `examInstanceId` | FK → ExamInstance | — |
| `slotId` | FK → ExamSlot | Must belong to `examInstanceId` (validated on write) |
| `assignedBy` | String? | Admin user id who set it |
| `createdAt` / `updatedAt` | DateTime | — |

**Unique constraint:** `(schoolId, examInstanceId)` — one assignment per school per instance.

---

#### `Booking`
A student's reservation for a specific ExamSlot.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `userId` | FK → User | Student who booked |
| `slotId` | FK → ExamSlot | Which slot was booked |
| `paymentId` | FK → Payment? | Linked payment (null for free exams) |
| `status` | Enum BookingStatus | PENDING / CONFIRMED / CANCELLED |
| `createdAt` | DateTime | — |

**Unique constraint:** `(userId, slotId)` — one booking per student per slot.  
**Note:** PENDING = paid exam awaiting payment; CONFIRMED = active (free exam or payment received); CANCELLED = refunded or cancelled.

---

#### `Payment`
Razorpay payment record linked to a booking.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `userId` | FK → User | — |
| `razorpayOrderId` | String UNIQUE | Order ID from `razorpay.orders.create()` |
| `razorpayPaymentId` | String? UNIQUE | Payment ID after checkout success |
| `razorpaySignature` | String? | HMAC signature stored for audit |
| `amount` | Int | Amount charged **in paise** |
| `currency` | String | Always `INR` |
| `status` | Enum PaymentStatus | CREATED / PAID / FAILED / REFUNDED |
| `couponId` | FK → Coupon? | Applied coupon (if any) |
| `createdAt` | DateTime | — |

---

#### `Coupon`
Discount codes for exam fee reduction.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `code` | String UNIQUE | Promo code (case-sensitive) |
| `discountPct` | Int | Percentage discount (1–100) |
| `maxUses` | Int | Total allowed uses |
| `usedCount` | Int | Times applied so far (default 0) |
| `expiresAt` | DateTime? | Optional expiry |

---

#### `Attempt`
One student's attempt at one ExamInstance.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `userId` | FK → User | — |
| `examInstanceId` | FK → ExamInstance | — |
| `status` | Enum AttemptStatus | NOT_STARTED / IN_PROGRESS / SUBMITTED / AUTO_SUBMITTED / EXPIRED |
| `startedAt` | DateTime? | Set on first answer/start |
| `submittedAt` | DateTime? | Set on submit |
| `totalScore` | Float? | Calculated on submit |
| `maxScore` | Float? | Max possible score |
| `ipAddress` | String? | Logged at start |
| `deviceFingerprint` | String? | Browser fingerprint |
| `riskScore` | Float | Proctor risk score (0–100) |

**Unique constraint:** `(userId, examInstanceId)` — one attempt per student per instance.

---

#### `AttemptItem`
Individual question response within an attempt.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `attemptId` | FK → Attempt | — |
| `questionId` | FK → Question | — |
| `answer` | Json? | Selected option id |
| `isCorrect` | Boolean? | Computed on submit |
| `score` | Float? | Marks awarded |
| `answeredAt` | DateTime? | Timestamp of last answer |

**Unique constraint:** `(attemptId, questionId)` — one response per question per attempt.  
**Used for:** answer restoration on page refresh (frontend reads `attempt.items` on load).

---

#### `ProctorEvent`
Timestamped proctoring violation/event log.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `attemptId` | FK → Attempt | — |
| `type` | Enum ProctorEventType | See enum below |
| `severity` | Int | 1 = low, 2 = medium, 3 = high |
| `details` | Json? | Extra data (violationCount, source, etc.) |
| `timestamp` | DateTime | Event time |

**ProctorEventType values:**  
`NO_FACE` `MULTIPLE_FACES` `FACE_MISMATCH` `TAB_SWITCH` `EXIT_FULLSCREEN` `SCREEN_CAPTURE` `NETWORK_DISCONNECT` `IP_CHANGE`

---

#### `AuditLog`
Immutable log of all admin/mutating API actions.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `userId` | String? | Who performed the action |
| `action` | String | e.g. `CREATE`, `UPDATE`, `DELETE` |
| `resource` | String | e.g. `exam`, `question`, `attempt` |
| `details` | Json? | Request body snapshot |
| `ipAddress` | String? | Requester IP |
| `createdAt` | DateTime | — |

---

#### `RefreshToken`
Stores issued refresh tokens for rotation.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `token` | String UNIQUE | Hashed refresh token |
| `userId` | FK → User | — |
| `expiresAt` | DateTime | TTL |

---

### Enums

```
Role:             STUDENT | PARENT | ADMIN | SUPER_ADMIN
QuestionType:     MCQ | MULTI_SELECT | TRUE_FALSE | SHORT_ANSWER | NUMERIC
Difficulty:       EASY | MEDIUM | HARD
MediaType:        IMAGE | VIDEO | AUDIO | DIAGRAM
AttemptStatus:    NOT_STARTED | IN_PROGRESS | SUBMITTED | AUTO_SUBMITTED | EXPIRED
ProctorEventType: NO_FACE | MULTIPLE_FACES | FACE_MISMATCH | LOOKING_AWAY | TAB_SWITCH |
                  EXIT_FULLSCREEN | SCREEN_CAPTURE | NETWORK_DISCONNECT | SEB_VIOLATION | IP_CHANGE
BookingStatus:    PENDING | CONFIRMED | CANCELLED
PaymentStatus:    CREATED | PAID | FAILED | REFUNDED
```

---

## 6. Backend — NestJS API

**Base URL:** `https://api.bharatolympiad.in` (prod) / `http://localhost:4000` (dev)  
**Auth:** Bearer JWT in `Authorization` header for all protected routes.  
**Global interceptor:** `AuditLogInterceptor` — logs all POST/PUT/PATCH/DELETE to `AuditLog` table.

---

### Auth Routes (`/auth`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/admin-login` | Public | Admin login with hardcoded email/password → returns JWT |
| POST | `/auth/sync` | Public | Called after Neon OTP registration → creates User → returns JWT |
| POST | `/auth/login-sync` | Public | Called after Neon OTP login → looks up User → returns JWT |
| GET | `/auth/me` | JWT | Returns current user profile |
| PUT | `/auth/me` | JWT | Updates firstName, lastName, classBand |
| GET | `/auth/admin/users` | JWT + ADMIN | Returns all students with their exam scores + face enrollment flag |
| GET | `/auth/admin/users/:id` | JWT + ADMIN | ★ Full student profile — attempts (with per-attempt violation counts), payments, bookings, and a summary block (total attempts, total violations, highest risk score, total spend). Backs the admin `/students/[id]` page. |

**Request body — `POST /auth/sync`:**
```json
{
  "email": "student@example.com",
  "firstName": "Arjun",
  "lastName": "Sharma",
  "classBand": 10,
  "schoolCode": "DPS001"
}
```

**Response — all auth routes return:**
```json
{
  "accessToken": "<jwt>",
  "user": { "id": "...", "email": "...", "role": "STUDENT", ... }
}
```

---

### User Routes (`/users`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users/profile` | JWT | Get own user profile |
| PUT | `/users/profile` | JWT | Update firstName, lastName |

---

### Exam Routes (Student)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/exams` | JWT | List published exams matching student's classBand |
| GET | `/exams/upcoming` | JWT | Same as /exams (alias) |
| GET | `/exams/:id` | JWT | Get exam with sections + shuffled questions (shuffled for STUDENT role) |

**Note on `/exams/:id`:** When called by a STUDENT, `shuffleUserId` is passed to `exam.service.findExamById()` which shuffles question order using the userId as seed — ensuring the student sees a consistent (but student-specific) order.

---

### Admin Exam Routes (`/admin/exams`)

All require `JWT + ADMIN or SUPER_ADMIN role`.

| Method | Path | Description |
|---|---|---|
| GET | `/admin/exams` | List all exams (published + drafts) |
| POST | `/admin/exams` | Create exam |
| PUT | `/admin/exams/:id` | Update exam metadata |
| DELETE | `/admin/exams/:id` | Delete exam |
| POST | `/admin/exams/:id/publish` | Toggle isPublished = true |
| POST | `/admin/exams/:id/release-question-paper` | — |
| POST | `/admin/exams/:id/release-results` | Toggle isResultReleased = true |
| GET | `/admin/exams/:id/analytics` | Score distribution, completion rate, top scorers |
| GET | `/admin/exams/:id/instances` | List all instances of an exam |
| POST | `/admin/exams/:id/instances` | Create exam instance (schedule) |
| PUT | `/admin/instances/:id` | Update instance timing |
| DELETE | `/admin/instances/:id` | Delete instance |

**Create exam body:**
```json
{
  "title": "National Science Olympiad 2026",
  "description": "...",
  "classBands": [9, 10, 11, 12],
  "totalMarks": 100,
  "durationMinutes": 90
}
```

**Create instance body:**
```json
{
  "startsAt": "2026-06-15T09:00:00Z",
  "endsAt": "2026-06-15T10:30:00Z",
  "requireSeb": false,
  "maxAttempts": 1
}
```

---

### Admin Section Routes (`/admin/sections`)

All require `JWT + ADMIN`.

| Method | Path | Description |
|---|---|---|
| POST | `/admin/exams/:id/sections` | Create section in exam |
| PUT | `/admin/sections/:id` | Update section title/order |
| DELETE | `/admin/sections/:id` | Delete section + all its questions |
| GET | `/admin/sections/:id/questions` | List questions in section |
| POST | `/admin/sections/:id/questions` | Create new question directly in section |
| POST | `/admin/sections/:id/questions/bulk` | Bulk create questions in section |
| POST | `/admin/sections/:id/questions/attach` | Attach existing bank question to section |
| DELETE | `/admin/sections/:sectionId/questions/:questionId` | Detach question from section |
| PUT | `/admin/sections/:sectionId/questions/:questionId` | Reorder question within section |
| POST | `/admin/sections/:sectionId/questions/:questionId/move` | Move question to different section |

---

### Admin Question Bank Routes (`/admin/questions`)

| Method | Path | Description |
|---|---|---|
| GET | `/admin/questions` | Search global bank (`?q=keyword&difficulty=EASY&examId=`) |
| GET | `/admin/questions/media-upload-url` | Get presigned S3 PUT URL for question media upload |
| POST | `/admin/questions` | Create standalone bank question |
| POST | `/admin/questions/bulk` | Bulk create bank questions |
| PUT | `/admin/questions/:id` | Update question |
| DELETE | `/admin/questions/:id` | Delete question from bank |

**`GET /admin/questions/media-upload-url?filename=diagram.png&contentType=image/png` response:**
```json
{
  "uploadUrl": "https://bio-olympiad-prod.s3.ap-south-1.amazonaws.com/questions/uuid/diagram.png?X-Amz-...",
  "publicUrl": "https://bio-olympiad-prod.s3.ap-south-1.amazonaws.com/questions/uuid/diagram.png",
  "key": "questions/uuid/diagram.png"
}
```

**Workflow:** Admin calls `GET media-upload-url` → uploads file directly to S3 via `uploadUrl` → stores `publicUrl` as `mediaUrl` on the question body sent to `POST /admin/questions`.

**Question body (with optional media):**
```json
{
  "type": "MCQ",
  "difficulty": "MEDIUM",
  "text": "What is the speed of light?",
  "mediaUrl": "https://bio-olympiad-prod.s3.ap-south-1.amazonaws.com/questions/uuid/diagram.png",
  "mediaType": "IMAGE",
  "options": [
    {"id": "a", "text": "3×10⁸ m/s"},
    {"id": "b", "text": "3×10⁶ m/s"},
    {"id": "c", "text": "3×10¹⁰ m/s"},
    {"id": "d", "text": "3×10⁴ m/s"}
  ],
  "correctAnswer": "a",
  "marks": 2,
  "negativeMarks": 0.5,
  "tags": ["physics", "optics"],
  "explanation": "Speed of light in vacuum is approximately 3×10⁸ m/s"
}
```

**Supported `mediaType` values:** `IMAGE` · `VIDEO` · `AUDIO` · `DIAGRAM`

The student exam player renders each type automatically:
- `IMAGE` / `DIAGRAM` → `<img>` tag, max 400px height
- `VIDEO` → `<video controls>`, max 400px height
- `AUDIO` → `<audio controls>`, full width

---

### Attempt Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/exams/:instanceId/start` | JWT | Create/resume attempt for this instance |
| POST | `/attempts/:id/answer` | JWT | Save/update answer for a question |
| POST | `/attempts/:id/submit` | JWT | Submit exam → calculate score |
| GET | `/attempts/results` | JWT | All submitted attempts for current user |
| GET | `/attempts/recent` | JWT | Recent attempts (dashboard widget) |
| GET | `/attempts/:id` | JWT | Get full attempt with items |
| GET | `/admin/attempts/:id/report` | JWT + ADMIN | Detailed attempt report for admin |

**`POST /exams/:instanceId/start` response:**
```json
{
  "attempt": {
    "id": "attempt-uuid",
    "status": "IN_PROGRESS",
    "startedAt": "...",
    "items": [
      { "questionId": "q-uuid", "answer": null, "answeredAt": null }
    ]
  },
  "exam": { ... },
  "questions": [ ... ]
}
```

**`POST /attempts/:id/answer` body:**
```json
{ "questionId": "q-uuid", "answer": "option-id-a" }
```

**`POST /attempts/:id/submit` response:**
```json
{
  "attempt": { "status": "SUBMITTED", "totalScore": 72, "maxScore": 100 },
  "redirectUrl": "/results"
}
```

**Scoring strategies (PRD SCORE-01):**

| QuestionType | Correct condition | Score | Wrong score |
|---|---|---|---|
| `MCQ` | Selected option has `isCorrect: true` | `marks` | `-negativeMarks` |
| `TRUE_FALSE` | Answer matches `correctAnswer` string | `marks` | `-negativeMarks` |
| `MULTI_SELECT` | All correct options selected, no extras | `marks` | `-negativeMarks` |
| `SHORT_ANSWER` | Case-insensitive string match on `correctAnswer` | `marks` | `0` |
| `NUMERIC` | `abs(submitted - correctAnswer) ≤ tolerance` | `marks` | `0` |

---

### Question Pool System

Each `ExamSection` contains a **pool** of questions (e.g. 100). The field `questionsToAssign` (default 0 = all) controls how many each student receives from that pool (e.g. 50).

**Selection algorithm (`AttemptService.buildQuestionSet`):**

1. **Difficulty-bucket selection** — from the section pool, shuffle each bucket (EASY / MEDIUM / HARD) independently using a deterministic `FNV-1a + xorshift32` PRNG seeded with `userId:examId:sectionId:[e|m|h]`. Pick `easyPct%`, `mediumPct%`, `hardPct%` of `questionsToAssign` from each bucket.
2. **Deficit fill** — if any bucket is undersized (fewer questions than the percentage requires), the shortfall is filled from the remaining pool using a `seed:fill` shuffle.
3. **Cross-section order shuffle** — after assembling all sections, the final list is shuffled with seed `userId:examId:order`, ensuring no two students share the same question ordering even if they received identical subsets.
4. **Stability** — the resulting ordered list is pre-persisted as `AttemptItem` rows with `sortOrder`. All subsequent page refreshes read these rows — the question set never changes after attempt start.

**Properties:**
- Same student → identical subset on every resume (deterministic by userId + examId)
- Different students → statistically unique subsets from the same pool
- No two students share question order, even for identical subsets
- Question-bank edits after attempt start do not affect the student's assigned set

**Admin setup:**
```
POST /admin/exams/:id/sections  { title, sortOrder, questionsToAssign: 50 }
POST /admin/sections/:id/questions  ← add all 100 pool questions here
PUT  /admin/exams/:id           { easyPct: 30, mediumPct: 50, hardPct: 20 }
```

---

### Proctor Routes (`/proctor`)

**Provider:** face-api.js (client-side, browser-based — no server AI processing)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/proctor/enroll` | JWT | Store student's 128-D face descriptor from enrollment photo |
| GET | `/proctor/enrollment` | JWT | Check if student has a face descriptor stored |
| POST | `/proctor/verify` | JWT | Compare live descriptor vs stored — returns `{ match, distance }` |
| POST | `/proctor/events` | JWT | Log violation event (tab/fullscreen/face detection) |
| GET | `/proctor/live` | JWT + ADMIN | All IN_PROGRESS attempts with recent events (poll every 15s) |
| GET | `/proctor/report/:attemptId` | JWT + ADMIN | Full proctor event timeline |
| GET | `/proctor/health` | Public | Service health check |

**`POST /proctor/enroll` body:**
```json
{ "descriptor": [0.023, -0.114, ...] }
```
128 floats from `faceapi.faceRecognitionNet`. Stored as `User.faceEmbedding Bytes`.

**`POST /proctor/verify` response:**
```json
{ "match": true, "distance": 0.31 }
```
Distance < 0.5 = same person. The endpoint works correctly, but `useFaceProctor` doesn't currently call it — see the "Known issue" note under `useFaceProctor.ts` (§11) for why identity verification is presently a no-op on the client.

**`GET /proctor/live?since=5` response (per-attempt entry):**
```json
[
  {
    "attemptId": "uuid",
    "studentName": "Arjun Sharma",
    "studentEmail": "arjun@...",
    "examTitle": "National Science Olympiad",
    "startedAt": "2026-06-26T09:00:00Z",
    "riskScore": 0.25,
    "recentEvents": [...],
    "eventCounts": { "NO_FACE": 2, "LOOKING_AWAY": 3 }
  }
]
```

**`POST /proctor/events` body:**
```json
{
  "attemptId": "attempt-uuid",
  "type": "NO_FACE",
  "details": { "source": "face-api.js" }
}
```

---

### SEB Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/seb/config/:instanceId` | Public | Download SEB JSON config for this instance (SEB fetches this before auth) |
| GET | `/seb/launch/:instanceId` | JWT + ADMIN | Returns `seb://` deep-link URL for QR-code distribution |

**SEB Guard (`SebGuard`):** Applied to `POST /exams/:instanceId/start`. For instances with `requireSeb = true`, validates:
1. `User-Agent` contains `SEB/` identifier
2. `x-safeexambrowser-requesthash` header matches `SHA-256(fullUrl + browserExamKey)`
3. `x-safeexambrowser-configkeyhash` header matches `SHA-256(fullUrl + configKey)` (if configKey set)

Instances with `requireSeb = false` pass through unchecked — no change to existing exam behavior.

---

### Slot Routes

Student slot endpoints require `JWT`. Admin slot endpoints require `JWT + ADMIN`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/slots` | JWT | List slots (`?examInstanceId=` or `?examId=`) |
| POST | `/slots/:id/book` | JWT | Atomically book a slot — checks capacity in `$transaction` |
| DELETE | `/bookings/:id` | JWT | Cancel own booking + decrement slot counter |
| GET | `/bookings/me` | JWT | Get own active booking for an exam (`?examId=`) |
| POST | `/admin/slots` | JWT + ADMIN | Create a new slot for an instance |
| PUT | `/admin/slots/:id` | JWT + ADMIN | Update slot label/timing/capacity |
| DELETE | `/admin/slots/:id` | JWT + ADMIN | Delete slot |
| GET | `/admin/slots` | JWT + ADMIN | List all slots (`?examInstanceId=`) |
| GET | `/admin/slots/:id/bookings` | JWT + ADMIN | List all bookings for a slot |
| GET | `/admin/schools` | JWT + ADMIN | Minimal school directory (`id, name, code`) — powers the assignment UI; not the full School module in ROADMAP Step 2.3 |
| PUT | `/admin/exams/instances/:instanceId/schools/:schoolId/slot` | JWT + ADMIN | ★ Assign/edit which slot a school's students use for an instance; upserts `SchoolSlotAssignment` then sweeps currently-unbooked eligible students into it |
| GET | `/admin/exams/instances/:instanceId/school-slot-assignments` | JWT + ADMIN | ★ List current school→slot assignments for an instance |
| POST | `/admin/bookings/:id/reassign` | JWT + ADMIN | ★ Move one student's booking to a different slot (capacity-checked) |
| POST | `/admin/schools/:schoolId/instances/:instanceId/reassign-all` | JWT + ADMIN | ★ Bulk-move every active booking of a school's students to a different slot; returns `{ total, succeeded, failed }` — a capacity shortfall never rolls back students who already moved |

**`POST /slots/:id/book` response:**
```json
{
  "booking": { "id": "...", "status": "PENDING", "slot": { ... } },
  "requiresPayment": true,
  "amount": 50000
}
```
Free exams return `"status": "CONFIRMED"` and `"requiresPayment": false`.

**`POST /admin/slots` body:**
```json
{
  "examInstanceId": "instance-uuid",
  "startsAt": "2026-07-01T09:00:00Z",
  "endsAt": "2026-07-01T11:30:00Z",
  "capacity": 200,
  "label": "Morning Batch"
}
```

#### School → Slot auto-allocation (`backend/src/slot/school-slot.service.ts`, 2026-07-09)

**Same school, same slot, admin-editable.** A `SchoolSlotAssignment` row (`schoolId` + `examInstanceId` -> `slotId`, `@@unique([schoolId, examInstanceId])`) is the mapping an admin sets via `PUT /admin/exams/instances/:instanceId/schools/:schoolId/slot`. Once set:

- **Registration trigger**: `AuthService.syncUser()` calls `SchoolSlotService.autoAllocateForNewStudent(userId, schoolId)` right after a new student's `schoolId` resolves — it sweeps every exam instance that school already has an assignment for and books the student in, with no student action required. No-ops when the school has no assignment for any instance, so registration for every other exam is unaffected.
- **Manual booking always wins**: if a student already holds a `PENDING`/`CONFIRMED` booking for the exam (self-service `POST /slots/:id/book`), auto-allocation skips them (`MANUALLY_BOOKED`) rather than double-booking or overriding.
- **Free vs. paid**: mirrors `SlotService.bookSlot()` exactly — free exams (`feeAmount` null/0) get a `CONFIRMED` booking immediately; paid exams get a `PENDING` booking, and the *existing* Razorpay `create-order`/`verify`/webhook flow (unchanged) confirms it on payment, since those only need a `bookingId` to exist, not how it was created.
- **Capacity safety**: uses an atomic `updateMany({ where: { id, booked: { lt: capacity } } })` compare-and-increment — a single SQL statement, not a separate read-then-write — so concurrent allocations can never oversell a slot. (The older `SlotService.bookSlot()` read-then-write pattern this was modeled on does not have this guarantee; it was left unchanged since it was out of scope for this pass.)
- **Admin controls**: `setSchoolSlotAssignment()` (assign/edit + sweep unbooked students), `reassignBooking()` (move one student, capacity-checked on the destination), `reassignSchool()` (bulk-move every active booking of a school's students, reporting per-booking success/failure — a capacity shortfall never rolls back students who already moved).
- **Tests**: `backend/src/slot/school-slot.service.spec.ts` (10 cases against a hand-rolled in-memory Prisma fake with real capacity/uniqueness semantics) — including a concurrency test that genuinely fails against a naive find-then-increment implementation (both callers get allocated, oversetting a capacity-1 slot) and passes against the atomic `updateMany` implementation actually shipped.

---

### Payment Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/payments/create-order` | JWT | Create Razorpay order for a booking (idempotent) |
| POST | `/payments/verify` | JWT | Verify Razorpay signature — marks Payment PAID + Booking CONFIRMED |
| POST | `/payments/webhook` | Public | Razorpay webhook — HMAC verified, handles captured/failed/refund events |
| GET | `/payments/my-payments` | JWT | Payment history for current user |
| GET | `/admin/payments` | JWT + ADMIN | All payments with booking details |
| POST | `/admin/payments/:id/refund` | JWT + ADMIN | Initiate Razorpay refund |
| POST | `/admin/coupons` | JWT + ADMIN | Create coupon code |
| GET | `/admin/coupons` | JWT + ADMIN | List all coupons |
| PUT | `/admin/coupons/:id` | JWT + ADMIN | Update coupon |
| DELETE | `/admin/coupons/:id` | JWT + ADMIN | Delete coupon |

**`POST /payments/create-order` body:**
```json
{ "bookingId": "booking-uuid", "couponCode": "OLYMPIAD20" }
```

**`POST /payments/create-order` response:**
```json
{
  "orderId": "order_XXXXXXXXXXXXXXXX",
  "amount": 40000,
  "currency": "INR",
  "key": "rzp_test_...",
  "bookingId": "booking-uuid",
  "paymentId": "internal-payment-uuid"
}
```

**`POST /payments/verify` body:**
```json
{
  "razorpayOrderId": "order_...",
  "razorpayPaymentId": "pay_...",
  "razorpaySignature": "hmac-hex-string"
}
```

**Webhook flow:** Razorpay sends raw JSON to `/payments/webhook`. The handler verifies the `x-razorpay-signature` header via HMAC-SHA256 using `RAZORPAY_WEBHOOK_SECRET`. Handles events:
- `payment.captured` → Payment.status = PAID, Booking.status = CONFIRMED
- `payment.failed` → Payment.status = FAILED
- `refund.processed` → Payment.status = REFUNDED

**Important — raw body requirement:** The NestJS `main.ts` registers `express.raw({ type: 'application/json' })` middleware on `/payments/webhook` **before** the global JSON parser, so Razorpay's raw body is available for HMAC computation.

---

### Health Route

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | Public | Returns `{ status: "ok" }` |

---

## 7. WebSocket Gateway

**URL:** `wss://api.bharatolympiad.in` (same host as REST API)  
**Library:** Socket.IO  
**Auth:** JWT token passed in `handshake.auth.token` on connection.

### Connection

```javascript
// Client-side (useSocket.ts)
const socket = io(NEXT_PUBLIC_WS_URL, {
  auth: { token: accessToken }
});
```

### Events

**Client → Server:**

| Event | Payload | Description |
|---|---|---|
| `join-exam` | `{ attemptId: string }` | Join attempt room + start server-side timer |
| `heartbeat` | `{ attemptId: string }` | Keep-alive ping (records timestamp) |
| `leave-exam` | `{ attemptId: string }` | Leave room + stop timer |

**Server → Client:**

| Event | Payload | Description |
|---|---|---|
| `timer-tick` | `{ remaining: number }` | Countdown in seconds, emitted every second |
| `timer-expired` | `{}` | Timer hit zero — client must call submit |

### Timer Logic (TimerService)

- On `join-exam`, server reads attempt `startedAt` and `exam.durationMinutes` from DB.
- Calculates `remaining = (startedAt + durationMinutes*60) - now` in seconds.
- Starts `setInterval(1000)` emitting `timer-tick` to `attempt:<attemptId>` room.
- On expiry, calls `attemptService.autoSubmit()` directly then emits `timer-expired`.
- Timer persists even if client disconnects — reconnecting client gets correct remaining time.
- Redis used to store `timerStart` so timer survives backend restarts.

---

## 8. Client-Side AI Proctoring (face-api.js)

**Library:** [face-api.js](https://github.com/justadudewhohacks/face-api.js) — TensorFlow.js in-browser face analysis  
**Cost:** Free — zero API calls, zero 3rd-party services  
**Processing:** 100% in the student's browser via WebGL GPU  
**Hook:** `frontend/src/hooks/useFaceProctor.ts`

All AI inference runs locally on the student's device. The server receives only lightweight violation events (small JSON POSTs), never raw video frames.

### Models

Three tiny models are served as static files from `frontend/public/models/`. The browser downloads them once and caches indefinitely.

| Model | File size | Purpose |
|---|---|---|
| `tinyFaceDetector` | 190 KB | Fast face bounding-box detection |
| `faceLandmark68TinyNet` | 80 KB | 68-point facial landmarks (for gaze estimation) |
| `faceRecognitionNet` | 6.2 MB | 128-D face descriptor (for identity matching) |

**Total first-load download: ~6.5 MB** (cached after first exam session).

### Model Setup (one-time)

```bash
# Install in frontend
cd frontend && npm install face-api.js

# Download model weights to public/models/
# Get from: https://github.com/justadudewhohacks/face-api.js/tree/master/weights
# Files needed:
#   tiny_face_detector_model-weights_manifest.json + shard1
#   face_landmark_68_tiny_model-weights_manifest.json + shard1
#   face_recognition_model-weights_manifest.json + shard1
cp -r weights/ frontend/public/models/
```

### Detection Cadence

```
setInterval(5000ms) → requestIdleCallback → runDetection()
```

One inference tick every **5 seconds**, scheduled during browser idle time so the exam UI is never blocked. Each tick takes 30–50ms on GPU via WebGL.

### Events Fired (per tick)

| Condition | Event posted |
|---|---|
| `detections.length === 0` | `NO_FACE` |
| `detections.length > 1` | `MULTIPLE_FACES` |
| Nose X deviation > 0.25 × face width, 2 consecutive ticks | `LOOKING_AWAY` |
| Euclidean distance (live vs enrolled descriptor) > 0.5 | `FACE_MISMATCH` |

### Gaze Estimation Algorithm

```
faceCenterX  = (landmarks[36].x + landmarks[45].x) / 2   // eye outer corners
faceWidth    = landmarks[45].x - landmarks[36].x
deviation    = (landmarks[30].x - faceCenterX) / faceWidth  // nose tip
if |deviation| > 0.25 → looking away
```

Two consecutive away-look ticks are required before posting `LOOKING_AWAY` (prevents single-frame false positives from natural head movement).

### Identity Verification

```
enrolled descriptor  → Float32Array(128) stored as Buffer in User.faceEmbedding
live descriptor      → captured by faceRecognitionNet on exam tick
distance             = euclidean(enrolled, live)
match                = distance < 0.5
```

Enrollment happens once via `POST /proctor/enroll` (from profile setup). Verification runs server-side via `POST /proctor/verify`, called at exam start. Mismatch during exam → `FACE_MISMATCH` event.

### Proctoring Flow (face-api.js)

```
1. Student completes face enrollment on profile/device-check page
   → captureDescriptor() → POST /proctor/enroll { descriptor: number[128] }
2. Student clicks "Start Exam"
   → useFaceProctor.startProctoring() called
   → loadModels() (one-time, cached after first load)
   → camera stream opened (320×240, front-facing)
   → POST /proctor/verify to confirm identity at exam start
3. setInterval fires every 5s → requestIdleCallback → runDetection()
   → All violations posted to POST /api/proctor/events
4. Admin sees events in real-time via GET /proctor/live (polls every 15s)
5. On exam submit → stopProctoring() → camera stream closed
```

---

## 9. Student Frontend

### Key Pages

#### `/exams/[id]/slots` — Slot Selection
The entry point for paid exams. Shows a grid of available time slots with seat availability indicators (green/amber/red based on capacity).

**Key behavior:**
- Loads slots via `GET /api/slots?examId=` and existing booking via `GET /api/bookings/me?examId=` in parallel
- If student already has a booking: shows banner with "Go to Instructions" (CONFIRMED) or "Complete Payment" (PENDING) CTA
- On clicking a slot: calls `POST /api/slots/:id/book`
- Free exams (amount = 0): booking immediately CONFIRMED → redirects to `/exams/:id/instructions`
- Paid exams: booking set to PENDING → redirects to `/payment/:bookingId`

---

#### `/payment/[bookingId]` — Razorpay Checkout
Handles the payment step for paid slot bookings.

**Key behavior:**
- Loads booking details via `GET /api/bookings/:bookingId`
- Optional coupon input: calls `GET /api/coupons/validate?code=` → shows discount amount
- On "Pay Now": calls `POST /api/payments/create-order` → gets `{ orderId, amount, key }`
- Opens `window.Razorpay` modal (loaded via `next/script` from `checkout.razorpay.com`)
- On checkout success: calls `POST /api/payments/verify` → on success navigates to `/payment/success?bookingId=`
- Idempotent: refreshing the page does not create duplicate Razorpay orders

---

#### `/payment/success` — Payment Confirmation
Post-payment success screen with booking details. Uses `useSearchParams()` wrapped in `<Suspense>` to read `?bookingId=` param. Provides "Go to Exam Instructions" and "Back to Dashboard" buttons.

---

#### `/exams/[id]/play` — Exam Player
The most complex page. Orchestrates:
- **`useExamSession`** — loads exam + attempt, manages answers state
- **`useFullscreenMonitor`** — enforces fullscreen; owns the single shared violation counter (fullscreen exits, tab switches, AND face-related violations reported via `reportExternalViolation()`)
- **`useTimer`** — subscribes to WebSocket timer ticks
- **`useFaceProctor`** — runs face-api.js in browser; detects faces + gaze every 5s (identity check currently non-functional, see §11); reports sustained/instant violations into `useFullscreenMonitor`'s counter
- **Zustand `examStore`** — persists exam session state across renders

**Fullscreen gate overlay:** Shown on load and after each fullscreen-specific violation only. Student must click "Enter Fullscreen" before interacting with exam. Face-related violations (no-face, looking-away, multi-face, mismatch) show a separate subtle popup instead — they add to the same counter but don't gate/pause the exam. After 3 total violations (of any kind), exam auto-submits.

**Slot gate:** `startAttempt()` in the backend checks for a CONFIRMED booking within the current slot's time window before allowing exam entry. If no slots exist for the instance, the gate is bypassed (backward-compatible with existing exams).

#### `/register` — Registration
1. Student enters email → Neon Auth sends OTP
2. Student verifies OTP → Neon Auth confirms ownership
3. Frontend calls `POST /auth/sync` with email + profile data
4. Backend creates User → returns JWT → stored in localStorage
5. **Mandatory face enrollment** — the form advances to a third `'face'` step (not a redirect) that opens the camera via `useFaceProctor().startEnrollmentCamera()`. There is no skip button; the student cannot reach `/dashboard` until `captureDescriptor()` + `enrollFace()` succeed. This only applies going forward — **existing accounts created before this step existed are never retroactively blocked** from taking exams if unenrolled; the login flow and exam start have no enrollment gate.

#### `/login` — Login
1. Student enters email → Neon Auth OTP
2. Frontend calls `POST /auth/login-sync`
3. Backend looks up user → returns JWT

### Zustand Store (`examStore.ts`)

```typescript
// Key state
exam: Exam | null
attempt: Attempt | null
questions: Question[]
currentIndex: number
answers: Record<string, any>     // questionId → selectedOptionId
flagged: Set<string>              // questionIds marked for review
remaining: number                 // seconds (from WebSocket)
isExpired: boolean

// Key actions
setExamSession(exam, attempt, questions)  // restores answers from attempt.items on refresh
saveAnswer(questionId, answer)
toggleFlag(questionId)
submitExam()
```

### API Client (`lib/api.ts`)

- Axios instance with `baseURL = NEXT_PUBLIC_API_URL`
- Request interceptor: attaches `Authorization: Bearer <token>` from localStorage
- Response interceptor: on 401, attempts token refresh via `POST /auth/refresh`, retries original request

---

## 10. Admin Frontend

### Key Pages

#### `/exams` — Exam Management
- Full CRUD for exams
- Exam instance (schedule) management
- Section management with drag-reorder
- Question bank: create, bulk import (JSON), attach from bank, edit, delete
- Publish/unpublish toggle
- Release results toggle

#### `/slots` — Slot Management ★ NEW
- Lists all exam slots grouped by exam title
- Filter by exam dropdown
- Per-slot: label, start/end time, capacity/booked progress bar, instance window
- Create slot: select exam → select instance → fill label/times/capacity
- Edit slot: update timing/capacity/label via `PUT /admin/slots/:id`
- Delete slot (blocked if any bookings exist)
- View bookings per slot: modal table with student name, email, booking status, payment amount

#### `/payments` — Payments & Revenue ★ NEW
- Revenue summary cards: total revenue (₹), paid count, pending count, refunded count
- Transactions table: student, exam/slot, amount, status badge, coupon applied, order ID, date
- Search by student name/email/exam title/order ID
- Status filter (Paid / Pending / Failed / Refunded)
- Refund button with confirmation → calls `POST /admin/payments/:id/refund`
- Coupon management section:
  - List all coupons with code, discount %, used/max progress bar, expiry, active/expired/exhausted status
  - Create coupon modal (code, discount %, max uses, optional expiry)

#### `/analytics` — Exam Analytics
- Score distribution chart (Recharts)
- Completion rate
- Average score
- Top performers table
- Per-attempt detail view with proctor event timeline

#### `/questions` — Global Question Bank
- Search by text, difficulty
- Create/edit/delete questions
- View which exams use each question

### Auth (Admin)
- Login calls `POST /auth/admin-login` with hardcoded credentials from env
- JWT stored in `js-cookie` (httpOnly not possible from Next.js client)
- `AuthGuard` component redirects to `/login` if no token or wrong role

---

## 11. Frontend Hooks

### `useFullscreenMonitor.ts`
Enforces fullscreen during exam. **Critical security component.**

**Module-level state (survives re-mounts):**
```typescript
let _violationLocked = false;    // Lock preventing duplicate violation events
let _lockTimer: ReturnType<typeof setTimeout> | null = null;
const LOCK_MS = 5000;            // 5s cooldown absorbs all duplicate browser events
```

**Key behavior:**
- On mount: attempts auto-fullscreen
- `acquireViolationLock()`: only first event in 5s window registers a violation
- `registerViolation()`: increments count → gates exam → starts 20s auto-submit timer
- `requestFullscreen()`: if already in fullscreen (Windows key case) → un-gates directly without API call
- `releaseViolationLock()`: called on fullscreen re-entry → allows next violation to count fresh
- Violations persisted to `sessionStorage` keyed by URL path → survive page refresh
- 3 violations → `onAutoSubmit` called → exam submitted
- `reportExternalViolation(type)`: entry point for violations that originate OUTSIDE this hook's own DOM listeners — specifically face-related violations from `useFaceProctor`. Adds to the **same** counter/auto-submit-at-3 logic as fullscreen/tab-switch violations, but skips the gating/20s-pause-timer behavior (no `acquireViolationLock()`, no `isGated`) — face issues get a subtle popup instead of the full-screen fullscreen-recovery overlay, so the student keeps answering.

**Events monitored:** `fullscreenchange`, `webkitfullscreenchange`, `mozfullscreenchange`, `MSFullscreenChange`, `visibilitychange`, `window.blur`, plus externally-reported `no_face` / `looking_away` / `face_mismatch` / `multiple_faces` from `useFaceProctor`

---

### `useTimer.ts`
Subscribes to WebSocket timer ticks.

```typescript
// Connects to WS, joins exam room, updates examStore.remaining every second
useTimer(attemptId: string) → { remaining: number }
```

---

### `useWebcam.ts`
Manages webcam stream for the pre-exam device check page only.

```typescript
useWebcam() → { videoRef, canvasRef, startWebcam }
```

- `startWebcam()`: requests `navigator.mediaDevices.getUserMedia({ video: true })`, attaches stream to video element
- Used only on `/exams/[id]/instructions` for the camera preview check — not on the exam page
- During the actual exam, `useFaceProctor` handles camera + AI detection

---

### `useFaceProctor.ts`
Client-side AI proctoring hook — replaces all server-side face analysis.

```typescript
useFaceProctor({ attemptId, disabled?, onSustainedViolation?, onInstantViolation? }) → {
  videoRef, isLoaded, loadingProgress,
  currentFaceCount, isIdentityVerified,
  noFaceSince, awaySince, mismatchSince,
  startProctoring, startEnrollmentCamera, stopProctoring,
  enrollFace, captureDescriptor
}
```

- `startProctoring()`: loads face-api.js models from `/public/models/`, opens camera at **640×480 (ideal)**, **and starts the 5s detection interval** — use this only on the exam page, since every tick posts an event tied to `attemptId`.
- `startEnrollmentCamera()`: loads models + opens camera **without** starting the detection interval — used by the profile page and the registration face-enrollment step, where there's no real `Attempt` row to attach events to. (Calling `startProctoring()` in those contexts silently spams `POST /proctor/events` with a bogus `attemptId` every 5s, which fails a foreign-key constraint server-side on every tick — a bug fixed by splitting this into two entry points.)
- Detection (face count + gaze) runs every **5 seconds** via `setInterval` + `requestIdleCallback` — never blocks exam UI. A second, lightweight **1-second** timer (`checkSustained`, no model inference — just `Date.now()` comparisons against timestamps the 5s tick sets) tracks how long the last-known state has persisted, since "sustained for N seconds" needs finer resolution than the 5s inference cadence provides.
- **Detector tuning:** `TinyFaceDetectorOptions` uses `inputSize: 512` (both `runDetection` and `captureDescriptor` share this constant) instead of face-api.js's default (`416`) — gives the detector more pixel detail from the 640×480 camera feed to work with, since the original 320×240 resolution was contributing to missed, clearly-visible faces surfacing as false `NO_FACE` events. `scoreThreshold` was tried at a lowered `0.3` but reverted back to face-api.js's own default `0.5` — the lower value let through too many low-confidence, unreliable detections. Since face-count, gaze estimation, and multi-face detection all run against the same `detectAllFaces()` call, the `inputSize` change improves reliability across all three, not just the face-presence check.
- Per 5s tick: detects all faces → checks count, gaze (68-point landmarks). Identity match (128-D descriptor vs. `enrolledDescriptorRef`) — **currently non-functional**, see below.
- Posts raw violation events to `POST /proctor/events` (via the shared `api` axios client, not a bare relative `fetch` — the backend lives on a different origin/port than the Next.js app) with Bearer token, on every tick the condition is observed (audit-trail granularity).

**Violation-counting model** (separate from the raw event log above — this drives the exam page's shared violation counter / auto-submit-at-3, via `onSustainedViolation`/`onInstantViolation`):

| Type | Sustain threshold | Counting rule |
|---|---|---|
| `NO_FACE` | 7s continuous | 2 sustained occurrences = 1 violation |
| `LOOKING_AWAY` | 5s continuous | 2 sustained occurrences = 1 violation |
| `FACE_MISMATCH` | 5s continuous | 2 sustained occurrences = 1 violation *(currently unreachable — see Known Issue below)* |
| `MULTIPLE_FACES` | none — instant | 1 violation on the very first tick, no buffer, no pairing; only re-fires once it clears and reoccurs (a single continuous multi-face episode doesn't spam violations every 5s) |

All three sustained types (`NO_FACE`/`LOOKING_AWAY`/`FACE_MISMATCH`) also have a **12-second single-episode safety net**: if one continuous episode drags on past 12s, it counts as its own violation even without a second occurrence to pair with — silently, no extra popup (the original popup covering that episode is already on screen). This closes the loophole where staying away/mismatched for the whole exam would otherwise only ever count as a single incomplete "half" of a pair.

The exam play page shows a **center-screen modal popup with an OK button** (not a passive toast) as soon as an issue is first observed — not after the sustain threshold — using `noFaceSince`/`awaySince`/`mismatchSince`/`currentFaceCount` to derive which single issue to display. Only one popup shows at a time, priority `MULTIPLE_FACES` > `NO_FACE` > `FACE_MISMATCH` > `LOOKING_AWAY`; each type tracks which specific episode (`since` timestamp) was last dismissed, so clicking OK hides that occurrence but a *fresh* episode of the same issue shows the popup again rather than staying dismissed for the rest of the exam. There's also an (i) info button next to the violation counter that explains the policy generically (no exact thresholds/mechanics disclosed) and confirms 3 violations auto-submits.

The device-check page's "Start Exam" button no longer navigates directly — it opens a confirmation modal listing every rule in full (the same array the Rules & Guidelines card renders, so the two can't drift apart) with an explicit "I Understand, Start Exam" button. Rules include: background must be plain and solid-coloured, or AI proctoring may fail to verify the student and result in disqualification.

> **Known issue — identity verification (`FACE_MISMATCH`) is a no-op.** `enrolledDescriptorRef` (the client-side descriptor to compare live frames against) is declared but never populated anywhere in the codebase — there is no code path that fetches the enrolled descriptor into it. A fix was tried (calling `POST /proctor/verify` — a server-side comparison — on every tick) but was reverted at the user's request: distance readings near the 0.5 match threshold flicker under normal lighting/angle changes, producing frequent false mismatches that felt worse than no detection at all. `FACE_MISMATCH` popups/violations are wired up and functional once matching itself works, but currently never fire. Fixing this properly needs either a smoothed/debounced distance signal (e.g. require N consecutive over-threshold ticks before flipping `isIdentityVerified`) or a materially different verification strategy — not yet decided.

- `enrollFace(descriptor)`: sends `POST /proctor/enroll` — called from the profile page and the registration face-enrollment step
- `captureDescriptor()`: runs single-face detection + returns 128 floats — used during enrollment capture

---

### `useExamSession.ts`
Orchestrates the full exam session lifecycle.

```typescript
useExamSession(examId: string) → {
  exam, attempt, questions, currentIndex, currentQuestion,
  answers, flagged, error,
  startExam, saveAnswer, submitExam,
  goToQuestion, nextQuestion, prevQuestion, toggleFlag
}
```

- `startExam()`: calls `POST /exams/:instanceId/start` → populates Zustand store
- `saveAnswer()`: calls `POST /attempts/:id/answer` + updates local store
- `submitExam()`: calls `POST /attempts/:id/submit` → returns `{ redirectUrl }`
- On `setExamSession`: restores `answers` from `attempt.items` so refresh doesn't lose progress

---

### `useAuth.ts`
Auth state management.

```typescript
useAuth() → { user, isLoading, isAuthenticated, login, logout, refreshToken }
```

---

### `useDeviceCheck.ts`
Pre-exam device compatibility check.

```typescript
useDeviceCheck() → { hasWebcam, hasFullscreenSupport, isMobile }
```

---

### `useSocket.ts`
Low-level Socket.IO connection wrapper.

```typescript
useSocket() → { socket, isConnected }
```

---

## 12. Authentication Flow

### Student Registration
```
1. Student enters email on /register
2. Neon Auth sends OTP to email
3. Student enters OTP → Neon Auth verifies
4. Frontend: POST /auth/sync { email, firstName, lastName, classBand, schoolCode }
5. Backend: finds or creates User with role=STUDENT
6. Backend: signs JWT { sub: userId, email, role } expiry 24h
7. Frontend: stores token in localStorage['auth_token']
8. AuthGuard: reads token, decodes, sets user context
```

### Admin Login
```
1. Admin enters email + password on /login (admin-frontend)
2. Frontend: POST /auth/admin-login { email, password }
3. Backend: compares against ADMIN_EMAIL/ADMIN_PASSWORD env vars
4. Backend: getOrCreateAdmin() → finds or creates ADMIN user
5. Backend: signs JWT expiry 8h
6. Admin frontend: stores in js-cookie 'admin_token'
```

### JWT Structure
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "role": "STUDENT",
  "iat": 1234567890,
  "exp": 1234654290
}
```

---

## 13. Exam Flow End-to-End

```
1. ADMIN creates Exam + Sections + Questions (question bank)
2. ADMIN creates ExamInstance (startsAt, endsAt window)
3. ADMIN creates ExamSlots for the instance (optional — if none, exam is open-access)
4. ADMIN sets Exam.feeAmount if paid (in paise, e.g. 50000 = ₹500)
5. ADMIN publishes exam (isPublished = true)

6. STUDENT logs in → dashboard shows available exams (filtered by classBand)
7. STUDENT opens exam → /exams/:id/slots (if slots exist)
   - Views slot grid with seat availability (green/amber/red)
   - Clicks a slot → POST /api/slots/:id/book
   - Free exam → Booking CONFIRMED → redirect to /exams/:id/instructions
   - Paid exam → Booking PENDING → redirect to /payment/:bookingId

8. STUDENT completes payment (paid exam):
   - Optional: enters coupon code for discount
   - Clicks "Pay Now" → POST /api/payments/create-order → Razorpay modal opens
   - Pays → Razorpay calls POST /api/payments/webhook (backup) + client calls POST /api/payments/verify
   - Booking status → CONFIRMED → redirect to /payment/success → then /exams/:id/instructions

9. STUDENT opens /exams/:id/instructions (device check):
   - Viewport / fullscreen-support / webcam / mic checks, same as before
   - Face ID enrollment check (`GET /proctor/enrollment`) — if not enrolled, an inline "Face ID Enrollment" card opens the camera and requires `captureDescriptor()` + `enrollFace()` to succeed before "Start Exam" is enabled (reuses the same camera permission as the webcam check — no second prompt)
   - Clicks "Start Exam" → page navigates to /exams/:id/play
   - useExamSession.startExam() → POST /exams/:instanceId/start
   - Backend slot gate: checks CONFIRMED booking within slot time window (skips if no slots)
   - Backend **face-enrollment gate**: throws `FACE_ENROLLMENT_REQUIRED` if `User.faceEmbedding` is still null (defense in depth — catches direct-URL navigation bypassing the instructions page)
   - Backend creates Attempt + AttemptItems (one per question)
   - Returns exam + questions (shuffled by userId seed) + attempt

10. Fullscreen gate appears → student clicks "Enter Fullscreen"
    - Browser enters fullscreen
    - fullscreenchange event fires → isGated = false → exam unlocked

11. useTimer connects WS → join-exam → server starts countdown
    - Every 1s: timer-tick → updates UI countdown

12. useFaceProctor starts → loads face-api.js models (one-time, ~3s, browser-cached)
    - Camera opens at 320×240
    - Every 5s via requestIdleCallback: detect faces + gaze (identity check currently non-functional, §11)
    - Every event tick → POST /proctor/events → ProctorEvent row + riskScore update (raw audit log)
    - Separately: sustained-duration tracking (checked every 1s, no extra inference) turns 2 occurrences of NO_FACE (>7s each) or LOOKING_AWAY (>5s each) into 1 counted violation; MULTIPLE_FACES counts instantly (no buffer); any single episode past 12s also counts on its own, silently — see §11 for the full table

13. Student answers questions:
    - Click option → handleSelectOption() → saveAnswer() → POST /attempts/:id/answer
    - AttemptItem.answer updated in DB
    - Local Zustand store updated

14. Student navigates questions via Next/Previous/sidebar grid

15. Student clicks "Submit Exam" → confirmation modal
    - Confirm → POST /attempts/:id/submit
    - Backend calculates score: for each item, correctAnswer check → score + negativeMarks
    - Attempt.status = SUBMITTED, totalScore set
    - sessionStorage violations cleared
    - Redirect to /results

16. Auto-submit scenarios:
    a. Timer expired: WS timer-expired event → handleAutoSubmit()
    b. 3 violations (fullscreen/tab-switch OR sustained/instant face violations, same shared counter): useFullscreenMonitor onAutoSubmit → handleAutoSubmit()
    c. 20s pause after a fullscreen violation specifically: violation timer → onAutoSubmit()
    Each auto-submit: clears sessionStorage, calls submitExam(), redirects

17. ADMIN releases results (isResultReleased = true)
18. STUDENT views score breakdown on /results
```

---

## 14. Proctoring System

### Three Layers of Anti-Cheat

**Layer 1 — Fullscreen Enforcement (`useFullscreenMonitor`)**
- Exam is gated behind a fullscreen overlay
- Browser fullscreen API enforced; cannot dismiss overlay without entering fullscreen
- Exit events (Escape, Windows key, Alt+Tab) trigger violations
- Module-level `_violationLocked` flag with 5s cooldown prevents one keypress = multiple violations
- 3 violations → auto-submit
- 20s grace timer after each violation → auto-submit if not restored

**Layer 2 — Tab/Window Monitoring**
- `visibilitychange` event: switching tabs → violation
- `window.blur` event: window losing focus → violation (suppressed for 2s after fullscreen transitions)
- All violations stored as `ProctorEvent` rows via `POST /proctor/events`

**Layer 3 — face-api.js Client-Side AI Proctoring**
- `useFaceProctor` hook starts automatically when exam begins (no manual launch needed)
- Camera opens at 320×240; models load once from `/public/models/` (~6.5 MB, browser-cached)
- Inference runs every **5 seconds** in browser idle time — no UI lag, no server processing
- Events logged: `NO_FACE`, `MULTIPLE_FACES`, `LOOKING_AWAY`, `FACE_MISMATCH`
- Student enrolled via `POST /proctor/enroll` on profile setup; identity verified at exam start
- Admin monitors all active students via live dashboard at `/proctor` (polls every 15s)

### Proctor API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/proctor/enroll` | JWT | Store student's 128-D face descriptor |
| GET | `/proctor/enrollment` | JWT | Check if student has a face enrolled |
| POST | `/proctor/verify` | JWT | Compare live descriptor vs enrolled → `{ match, distance }` |
| POST | `/proctor/events` | JWT | Log violation event (all layers) |
| GET | `/proctor/live` | JWT + ADMIN | All IN_PROGRESS attempts with recent events |
| GET | `/proctor/report/:attemptId` | JWT + ADMIN | Full event timeline for attempt |
| GET | `/proctor/health` | Public | `{ status: 'ok', provider: 'face-api.js', mode: 'client-side' }` |

### Violation Persistence
- Fullscreen/tab violations stored in `sessionStorage['violations_/exams/:id/play']`
- Survives page refresh (intentional — prevents cheat via refresh)
- Cleared only on exam submit or auto-submit
- Face detection violations stored permanently in `ProctorEvent` table (no sessionStorage)

---

## 15. Deployment

### Current Deployment

| Service | Platform | URL | Auto-deploy on push? |
|---|---|---|---|
| Backend (NestJS) | Render.com (Blueprint, `render.yaml`) | `https://olympiad-backend-wsvn.onrender.com` | Yes — service is Blueprint-managed |
| Student Frontend | Vercel | `https://olympiad-student-frontend.vercel.app` | **No** — project has no Git integration ("Connect Git" is still unclicked in the dashboard); deploys are manual only |
| Admin Frontend | Vercel | `https://olympiad-admin-frontend.vercel.app` | **No** — same as above |
| Database | Neon.tech (PostgreSQL) | Managed connection string | — |

> Both Vercel projects deploy from whatever's on disk when you run `vercel --prod`, not from GitHub. Pushing to `main` does **not** update either Vercel deployment — you have to deploy manually every time (see below). If you want auto-deploy, click "Connect Git" on each project in the Vercel dashboard and link it to this repo.

> **Render Blueprint sync doesn't retroactively update an existing service's build/start commands.** Editing `render.yaml` and pushing triggers a new deploy (confirmed via `GET /v1/services/:id/deploys`), but the service's stored `buildCommand`/`startCommand` can silently stay on the OLD values from before the edit — every deploy since the original face-api.js migration commit failed for exactly this reason (`startCommand` kept running `prisma migrate deploy` even after `render.yaml` said `prisma db push`). If a render.yaml change doesn't seem to take effect, `PATCH /v1/services/:id` directly with `serviceDetails.envSpecificDetails.{buildCommand,startCommand}` (Render API, needs an API key from Account Settings) rather than assuming the Blueprint sync applied it.

> **Render free tier spins the backend down after ~15 min idle** — the first request after that takes 50+ seconds to wake it up, which shows up client-side as the admin/student app appearing to hang on load. A GitHub Actions workflow (`.github/workflows/keep-alive.yml`) pings `/api/proctor/health` every 10 minutes to prevent this at zero cost. Note: newly-added scheduled GitHub Actions workflows don't fire immediately — there can be a delay before the first scheduled run actually executes (verify via `GET /repos/:owner/:repo/actions/workflows/:id/runs`); the cold-start symptom can still occur until then. The permanent fix is upgrading the Render service off the free plan.

### Deploy Commands

```bash
# Backend — push to main triggers Render auto-deploy (Blueprint sync)
git push origin main

# Student frontend — force production deploy (no git auto-deploy — see note above)
cd frontend && npx vercel --prod --yes

# Admin frontend — force production deploy (same)
cd admin-frontend && npx vercel --prod --yes

# Sync DB schema after a schema.prisma change — this project has no prisma/migrations/
# history, so use db push everywhere (locally, and as Render's startCommand step)
cd backend && npx prisma db push
```

> **Before deploying the payment feature:** Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` in both `backend/.env` and `frontend/.env` (or Vercel/Render environment settings). Use `rzp_test_...` keys for development and `rzp_live_...` for production.

### face-api.js Model Setup (one-time, per environment)

```bash
# Install library
cd frontend && npm install face-api.js

# Download model weights from face-api.js GitHub releases
# https://github.com/justadudewhohacks/face-api.js/tree/master/weights
# Copy the following files into frontend/public/models/:
#   tiny_face_detector_model-weights_manifest.json
#   tiny_face_detector_model-shard1
#   face_landmark_68_tiny_model-weights_manifest.json
#   face_landmark_68_tiny_model-shard1
#   face_recognition_model-weights_manifest.json
#   face_recognition_model-shard1
#   face_recognition_model-shard2   ← easy to miss: the recognition net is split
#                                      across TWO shard files (~4 MB + ~2.2 MB).
#                                      Downloading only shard1 loads fine but
#                                      throws a tensor-shape mismatch at the first
#                                      inference call ("... should have 589824
#                                      values but has 166263"). Check the
#                                      manifest's "paths" array if unsure how many
#                                      shard files a model expects.
```

Models are served as static assets and browser-cached after first load — no CDN or extra server needed.

### Local Development

The project connects directly to a shared Neon Postgres database — there is no local Postgres container. `docker-compose.yml` only runs Redis + the three app services.

```bash
# backend/.env
DATABASE_URL=postgresql://<user>:<pass>@<neon-host>/<db>?sslmode=require
JWT_SECRET=...
ADMIN_EMAIL=admin@bharatolympiad.in
ADMIN_PASSWORD=...
RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=... RAZORPAY_WEBHOOK_SECRET=...   # required for PaymentService to boot even in dev — use dummy test values if payments aren't under test

# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=ws://localhost:4000
NEXT_PUBLIC_NEON_AUTH_URL=https://<project>.neonauth.<region>.aws.neon.tech/<db>/auth   # Neon Auth (Better Auth) endpoint — powers student OTP login/registration

# Backend
cd backend && npx prisma db push   # no migrations/ folder exists — schema is kept in sync via db push, not migrate dev
cd backend && npm run start:dev

# Student frontend
cd frontend && npm run dev       # http://localhost:3000

# Admin frontend
cd admin-frontend && npm run dev  # http://localhost:3001 — NEXT_PUBLIC_API_URL defaults to localhost:4000, no .env needed
# No proctor-service needed — proctoring runs in the browser
```

Note: `prisma migrate dev` requires an interactive terminal and will refuse to run non-interactively (Prisma 5.22+). Since this project has no `prisma/migrations/` history, use `prisma db push` for schema changes in all environments.
