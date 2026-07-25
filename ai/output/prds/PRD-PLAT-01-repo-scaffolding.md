# PRD-PLAT-01: Monorepo & Repo Scaffolding (Hexagonal Foundation)
- **Final primary project:** all four repos / foundation track | **Impacted projects:** bio-portal, bio-admin, bio-exam, bio-proctor | **Phase:** P0 Foundation | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-PLAT-01-repo-scaffolding.md + docs/prds/phase-0-foundation/PRD-00-platform-foundation.md

## 0. Final Ownership & Service Boundary

- **Final primary project:** all four repos / foundation track
- **Impacted projects:** bio-portal, bio-admin, bio-exam, bio-proctor
- **Deploy cadence:** foundation; applies to all deployment cadences
- **Final boundary note:** Scaffold four deployable service repos; no bio-core monolith remains.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
The prototype proves the concept but lacks production-ready repo boundaries, CI gates, hexagonal-architecture enforcement, environment hygiene, and a deployment structure — the very gaps that let prior security/scale issues (role escalation, IDOR, in-memory timers, key exposure, localStorage tokens) reappear. Before any feature work, stand up the four service repositories on a consistent, machine-enforced hexagonal scaffold so every later PRD has a stable home, toolchain, and boundary discipline.

**Goal:** `clone → install → dev` works in one command per repo; hexagonal boundaries (`core ⊥ adapters ⊥ infra`) are enforced in CI; every later PRD targets an explicit repo/service; logging, config, secrets, health checks, testing, and docs layout are standardized across all four repos.

## 2. Users & Personas
- **Engineers** — clone and build in one command; time-to-first-PR < 1 day.
- **CI** — runs typecheck / lint / format / unit / contract / boundary / security-audit / secret-scan / container-build-smoke per repo on every PR.
- **DevOps** — consistent build/deploy structure across heterogeneous stacks (TS + Python).
- **QA / Security** — boundary and secret guarantees are testable, not aspirational.

## 3. User Stories
- As an engineer, I run the documented dev command in each repo (`bio-portal`, `bio-admin`, `bio-exam`, `bio-proctor`) and that repo's apps/services start; `docker compose up` brings up the local dependencies that repo owns.
- As an engineer, a PR that imports `adapters/*` or `infra/*` from `core/*` fails CI (boundary check).
- As an engineer, shared types resolve across apps without publishing (workspace) during Phase 0.
- As a new dev, I clone any repo and reach a running dev stack from the README alone in < 30 min.
- As CI, I block any PR whose dependency audit has high/critical findings or whose secret scan trips.

## 4. Functional Requirements

### FR-1 — Four service repos, canonical names + aliases
1. **bio-portal** (alias `bio-growth-commerce`) — Next.js (App Router) public/student portal plus backend/API/worker code for commerce, booking, notifications, and entitlement issuance. Consumes `@bio/auth-kit`, `@bio/shared-types`, `@bio/domain-contracts`, and `@bio/ui-kit` via workspace during bootstrap or private registry after PLAT-02.
2. **bio-admin** (alias `bio-curation-admin`) — pnpm workspace forked from the proven `app-hq` scaffold. Stack: Bun/Elysia services, Vite/React admin UI, Drizzle, Biome, Lefthook, Bun/Node worker support. Owns authoring, scheduling source, publishing, scoring, results, analytics, ops, and admin auth/RBAC.
3. **bio-exam** (alias `bio-exam-runtime`) — pnpm workspace forked from the same scaffold. Stack: Bun/Elysia (or Node workers where BullMQ requires it), Vite/React exam UI, Drizzle, Redis/BullMQ, Biome, Lefthook. Owns exam-window runtime only: attempts, autosave, timer, submission, SEB/readiness. **No answer keys.**
4. **bio-proctor** (alias `bio-proctor-service`) — Python/FastAPI (uv or poetry), ruff + mypy, pytest, Dockerfile; `model-runtime` package for ML inference; pgvector/encrypted embedding store; async inference + retention workers.

### FR-2 — Per-service scaffold trees
- **bio-portal**:
  ```text
  apps/
    marketing-web/
    student-portal-web/
  services/
    portal-api/          # or Next API route boundary, still hexagonal internally
    commerce-worker/
    notification-worker/
    entitlement-outbox/
  packages/
    contracts/   ui/   config/   observability/   testkit/
  ```
- **bio-admin**:
  ```text
  apps/
    admin-web/
    ops-command-center/
  services/
    admin-api/      admin-worker/
    publish-worker/ scoring-worker/ results-worker/ analytics-worker/
  packages/
    contracts/ (producer fixtures)
    admin-domain/ scoring-domain/ results-domain/
    auth-admin/ config/ observability/ testkit/
  ```
- **bio-exam**:
  ```text
  apps/
    exam-web/
  services/
    exam-api/   exam-ws-or-polling-gateway/
    exam-worker/ timer-worker/
    snapshot-import-consumer/ entitlement-consumer/
  packages/
    runtime-domain/ contracts/ seb-readiness/ config/ observability/ testkit/
  ```
- **bio-proctor**:
  ```text
  apps/
    proctor-review-web/   # optional; admin may embed/deep-link, but proctor owns API/workflow
  services/
    proctor-api/   proctor-worker/   retention-worker/
  packages/
    contracts/   model-runtime/   config/   observability/   testkit/
  ```
> Naming reconciliation: canonical shared package names remain `shared-types`, `domain-contracts`, `auth-kit`, and `ui-kit`. The per-service `config`/`observability`/`testkit` packages from theirs are absorbed (PLAT-03/04 own their behavior). Packages defined fully in PLAT-02. Distribution may be a private registry or workspace link during Phase 0, but no service hand-writes duplicate DTOs.

### FR-3 — Hexagonal architecture (every backend service)
```text
src/
  core/
    domain/   ports/in/   ports/out/   services/   errors/
  adapters/
    in/http/   in/ws/   in/jobs/
    out/postgres/   out/redis/   out/events/   out/storage/   out/vendor/
  infra/
    config   logger   metrics   tracing   composition-root
```
Rules (machine-enforced):
- `core` MUST NOT import from `adapters` or `infra`.
- `core/services` implement input ports; outbound integrations implement output ports.
- HTTP / WS / jobs are driving (in) adapters only.
- ORM/Drizzle models MUST NOT leak into domain objects (mapping at the adapter boundary).
- Vendor SDKs (Razorpay, MSG91, S3, ML runtimes) stay in `adapters/out/vendor` only.

### FR-4 — Boundary enforcement
- TS repos: ESLint `no-restricted-imports` (boundary-only) **and/or** dependency-cruiser, wired into a `boundaries` script + Lefthook pre-commit + CI.
- Python repo (bio-proctor): import-linter (or equivalent) enforcing the same `core ⊥ adapters ⊥ infra` contract.

### FR-5 — Repo bootstrapping (per repo)
- Root `README.md` with a **service map**.
- Committed package-manager lockfile (deterministic installs).
- `.env.example` with **no real secrets**.
- Local Docker Compose for the dependencies the repo owns (PLAT-03 defines contents).
- Each service ships `README.md`, `src/`, `test/`, and a health endpoint (or, for workers, a job smoke test).
- Per-repo `AGENTS.md` / `CLAUDE.md` mirroring scaffold conventions.

### FR-6 — Standard scripts (every repo)
```text
dev   build   typecheck   lint   format:check
test   test:contract   security:audit   boundaries
```

### FR-7 — CI on every pull request
- Dependency install from lockfile → typecheck → lint/format check → unit tests → contract tests → architecture boundary check → dependency audit (fail on high/critical) → secret scan → container-build smoke for backend services.
- CI matrix per repo; bootstrap order: **shared contracts/auth-kit fixtures → bio-admin producers → bio-portal consumers/producers → bio-exam consumers/runtime → bio-proctor consumers/producers**. Contract changes require producer and consumer fixture updates in the same wave.

### FR-8 — Cross-repo contract distribution (seam established here)
- Establishes `domain-contracts` as the home for cross-repo schemas (exam package, slot catalog, entitlement, events). Distribution mechanism (private npm registry vs git submodule/subtree vs npm-via-git) is an Open Decision (§10); Phase 0 may use a local workspace package, target private package by Phase 1 end.

## 5. Non-Functional (perf, security, scale, DPDP)
- **Perf:** cold `install + dev` < 60s on a dev laptop; CI runtime < 12 min for a normal PR.
- **Determinism:** lockfiles committed; reproducible installs.
- **Security:** no real secrets in repo (enforced by secret scan); fail-closed config validation at boot (PLAT-03); high/critical dependency audit blocks merge.
- **Scale:** scaffold is minimal-but-enforced; no premature scale optimization, but no stateful in-process assumptions baked into service skeletons (no in-memory timers/sessions — see PLAT-03/EXAM-04).
- **DPDP:** scaffold only; data-residency and consent live in PLAT-03 / AUTH-03 / PROCTOR-05. No PII handling introduced here.

## 6. Flows, States & Edge Cases
- **Cross-repo type sharing:** choose published private package vs git submodule/subtree (§10). Edge: version skew between portal and core contracts → CI `CONTRACT_VERSION` gate (PLAT-02) blocks deploy with a clear diff.
- **Heterogeneous toolchains:** TS (Bun/Elysia/Next) + Python (FastAPI) → shared templates and scripts keep the command surface uniform; per-language boundary linters keep the same architectural contract.
- **Worker-on-Bun viability:** BullMQ-on-Bun spike; if unviable, scoring/timer workers run on Node (flagged §10) — scaffold must not hard-couple to a single runtime for workers.
- **Boundary-violation PR:** caught pre-commit locally; defense-in-depth re-checked in CI.

## 7. Data Model & Contracts (entities, named events, APIs)
- **No domain data** in this PRD. Establishes structural seams only:
  - `packages/domain-contracts` — home for cross-repo schemas + the canonical event catalog (defined in PLAT-02).
  - `packages/shared-types` — API envelope, error codes, pagination.
  - `packages/auth-kit` — session/token/RBAC/policy interfaces (defined in PLAT-02 / PLAT-05).
- **Health contract (every backend service):** `GET /health/live`, `GET /health/ready` (PLAT-04 owns observability semantics).

## 8. Out of Scope
- Cloud infra provisioning and IaC (PLAT-03).
- Concrete shared-package contents/schemas (PLAT-02) and security policy interfaces (PLAT-05).
- Any domain/business feature.
- Final UI design.
- Massive-scale optimization before product flows exist.

## 9. Acceptance Criteria
- [ ] All 4 repos build, typecheck, lint, format-check, unit-test, and contract-test green in CI.
- [ ] A boundary-violation PR (`core` importing `adapters`/`infra`) fails CI in **every** repo (TS and Python).
- [ ] `shared-types` / `domain-contracts` consumed by `bio-portal`, `bio-admin`, `bio-exam`, and `bio-proctor` with type-checking.
- [ ] Bun/Elysia/Vite app cores run; Next.js portal runs; FastAPI proctor runs.
- [ ] A new developer can clone each repo and run the dev stack from the README alone in < 30 min.
- [ ] CI fails on missing env variables in production mode (config validation at boot — cross-ref PLAT-03).
- [ ] Health checks (`/health/live`, `/health/ready`) work locally for every backend service.
- [ ] A sample domain service has a unit test and passes the boundary check.
- [ ] No real secrets appear in repo scan (secret-scan gate green).
- [ ] Dependency audit fails the build on a synthetic high/critical advisory.

## 10. Dependencies & Open Decisions
- **Depends on:** — (root PRD).
- **Open — contract distribution:** private npm registry vs git submodule/subtree vs npm-via-git. (Recommendation: private package by Phase 1 end; workspace package acceptable in Phase 0.) See PLAT-02 §10.
- **Open — worker runtime:** BullMQ-on-Bun viability spike; fall back to Node worker for scoring/timer if needed.
- **Open — repo naming:** keep canonical `bio-admin/exam/portal/proctor` (this pass) vs descriptive `bio-exam-platform/growth-commerce/proctor-service`. Aliases preserved. (README §11.1.)

## 11. Success Metrics
- 0 boundary violations merged.
- New-engineer time-to-first-PR < 1 day; time-to-first-local-boot < 30 min.
- CI runtime < 12 min for a normal PR.
- 100% of backend services expose `/health/live` and `/health/ready`.

## 12. Risks & Mitigations
- **Too much scaffold before feature delivery** → create a minimal but strictly enforced skeleton; defer non-essential structure to the PRD that needs it.
- **Tooling fragmentation across heterogeneous repos** → shared templates + uniform script surface + per-language boundary linters enforcing the same contract.
- **Worker runtime risk (BullMQ-on-Bun)** → spike early; Node-worker fallback path kept open in the scaffold.
- **Contract version skew across repos** → `CONTRACT_VERSION` gate (PLAT-02) blocks mismatched deploys with a clear diff.
- **Scaffold drift between repos over time** → conventions captured in per-repo `AGENTS.md`/`CLAUDE.md` + shared lint/boundary config.

---

---

## 13. Final Codex Augmentation — Repo Scaffolds Locked

- Canonical implementation repos: `bio-portal`, `bio-admin`, `bio-exam`, `bio-proctor`.
- Retired pass-2 repo: `bio-core`; its admin/authoring/scoring/results/ops portions move to `bio-admin`, and attempt/runtime/timer/submission/SEB portions move to `bio-exam`.
- Repo scaffold documents now exist in this directory:
  - [`REPO-SCAFFOLD-bio-portal.md`](REPO-SCAFFOLD-bio-portal.md)
  - [`REPO-SCAFFOLD-bio-admin.md`](REPO-SCAFFOLD-bio-admin.md)
  - [`REPO-SCAFFOLD-bio-exam.md`](REPO-SCAFFOLD-bio-exam.md)
  - [`REPO-SCAFFOLD-bio-proctor.md`](REPO-SCAFFOLD-bio-proctor.md)
- `bio-exam` and `bio-proctor` must support exam-window spin-up/spin-down from day one; `bio-portal` remains always-on; `bio-admin` remains available for curation/results/ops at lower baseline outside exam windows.
- Node workers are the v1 default for BullMQ/outbox-critical jobs where Bun compatibility is not proven, reducing runtime risk for queue/timer/scoring correctness.
