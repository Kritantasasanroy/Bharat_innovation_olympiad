# PRD-PLAT-03: Infrastructure, Environments & Data Residency
- **Final primary project:** all four repos / foundation track | **Impacted projects:** bio-portal, bio-admin, bio-exam, bio-proctor | **Phase:** P0 Foundation | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-PLAT-03-infrastructure.md + docs/prds/phase-0-foundation/PRD-00-platform-foundation.md (infra / env / config / secrets / CI portions)

## 0. Final Ownership & Service Boundary

- **Final primary project:** all four repos / foundation track
- **Impacted projects:** bio-portal, bio-admin, bio-exam, bio-proctor
- **Deploy cadence:** foundation; applies to all deployment cadences
- **Final boundary note:** Define always-on vs exam-window infrastructure and spin-up/spin-down gates.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Provision the runtime substrate for all services with **India data residency** (DPDP), durable jobs, caching, object storage, CDN, and fail-closed secrets — with local-dev parity via Docker. The prior build's in-memory state (timers, sessions) and dev-secret fallbacks must be structurally impossible.

**Goal:** every service has reproducible **local + staging + prod** environments with no hardcoded/fallback secrets, no in-process durable state, validated config at boot, and all PII/biometric data pinned to an India region.

## 2. Users & Personas
- **Engineers** — `docker compose up` gives full local parity.
- **Ops / DevOps** — deploy, scale, and operate; horizontal scale with shared state.
- **Security / DPO** — residency guarantees, secret hygiene, fail-closed config.

## 3. User Stories
- As an engineer, `docker compose up` gives me PG + pgvector, Redis, and object storage locally (each repo brings the deps it owns).
- As Ops, I scale exam-api horizontally with shared Redis/PG and **no in-memory state** (timers/sessions externalized).
- As the DPO, all PII/biometric stores are pinned to an India region and I can prove it.
- As Security, no service boots with a default or missing secret — it fails closed.

## 4. Functional Requirements

### FR-1 — Datastores
1. **Postgres 16 + pgvector** — system of record (`bio-admin`: admin identity/RBAC, authoring, scheduling, scoring/results, ops; `bio-exam`: examination attempts/runtime read stores; `bio-portal`: commerce/student profile/consent) **and** embeddings (bio-proctor face embeddings). Connection pooling (**PgBouncer**) for burst; read replicas for read-heavy/analytics load (PLAT-04 read models).
2. **Redis 7** — cache + **BullMQ** durable job queues (durable timers, scoring, retention/deletion, outbox/event dispatch). No in-process `setInterval` for any durable behavior (cross-ref EXAM-04 durable timer, PROCTOR-05 retention).

### FR-2 — Object storage + CDN
- **S3-compatible object storage** in an India region (marketing/static assets, exam media, admit cards, proctor frames/snapshots).
- **CDN** in front of marketing/static + exam assets.

### FR-3 — Secrets & config (fail-closed)
- **Secrets manager**; secrets loaded from env / secret manager **only**.
- **No fallback production/dev secrets** in any service — boot **fails closed** on a missing/empty required secret (no silent default JWT/HMAC/DB creds — cross-ref PLAT-05, AUTH-05).
- **Config validation at boot** (schema-checked); CI fails on missing env vars in production mode.
- All vendor credentials (Razorpay, MSG91, S3, ML) **scoped per environment**.

### FR-4 — Environments
- `local` (Docker Compose) · `staging` · `prod`, plus a `test` env for CI. Per-env config via env + secrets; strict separation (no shared creds across envs).

### FR-5 — CI/CD
- Per-repo pipeline: build → test → deploy. **DB migrations gated** in the pipeline (run as an explicit, ordered, reversible step — never auto-applied silently).
- Container-build smoke for backend services (from PLAT-01 CI) extends into deploy artifacts.

### FR-6 — Runtime health & scaling
- Health/readiness probes wired (`/health/live`, `/health/ready` — defined PLAT-01, semantics PLAT-04) drive orchestrator readiness gating.
- Autoscaling policy for **exam-api** (burst-aware), exam-ws, and workers; scale on connection/queue pressure.

## 5. Non-Functional (perf, security, scale, DPDP)
- **Residency (DPDP):** ALL PII/biometric data physically in an India region; no cross-border replication of personal/biometric data.
- **Burst/scale:** sized for **50k concurrent exam-starts within a 5-minute window**; PgBouncer + read replicas absorb the connection storm; Redis sized for timer + job throughput at that concurrency.
- **Recovery:** PITR backups; **RPO ≤ 5 min**; documented restore drill.
- **Security:** fail-closed on secrets; least-privilege per-env credentials; encrypted at rest (PII, biometric embeddings) and in transit.
- **Cost/portability:** keep S3-compatible and managed-PG-agnostic to avoid vendor lock-in.

## 6. Flows, States & Edge Cases
- **Start-burst → connection storm** → PgBouncer pools + read replicas absorb; autoscale exam-api/exam-ws on pressure.
- **Redis outage** → exam **start fails closed** (no untimed exams — cross-ref EXAM-04); in-flight durable timers recover from persisted state on Redis restore.
- **Object-storage outage** → media degraded but exam proceeds (text questions render; media placeholder); admit-card/frame writes retried via queue.
- **Missing/empty secret at boot** → service refuses to start (fail-closed), surfaces a clear error, never falls back to a default.
- **Migration failure in pipeline** → deploy halts; reversible step rolls back; no partial schema in prod.
- **Region misconfiguration** → CI/IaC policy check blocks provisioning a non-India region for PII/biometric stores.

## 7. Data Model & Contracts (entities, named events, APIs)
- **Database instances / schemas:**
  - **bio-admin (PG):** `admin_identity`, `authoring`, `scheduling`, `scoring`, `results`, `ops`, admin audit partitions.
  - **bio-exam (PG):** `examination`, runtime `ExamRegistration` read model, attempts, autosave/submission state, runtime audit partitions.
  - **bio-portal (PG):** commerce schema (registrations, payments, seat reservations, refunds).
  - **bio-proctor (PG + pgvector):** face **embeddings** (encrypted), proctor events, risk scores.
- **Queues (Redis/BullMQ):** durable timers, scoring, retention/deletion, event outbox/dispatch.
- **Object storage buckets (India region):** static/marketing, exam media, admit cards, proctor frames.
- No new domain events here; this PRD hosts the transport (Redis/BullMQ) and storage that the PLAT-02 event catalog flows over.

## 8. Out of Scope
- Application/business logic.
- Specific cloud-vendor lock-in (keep S3-compatible + managed-PG-agnostic).
- Observability tooling internals (PLAT-04) and security policy/threat model (PLAT-05) — referenced, not defined here.

## 9. Acceptance Criteria
- [ ] Local `docker compose up` brings up PG + pgvector + Redis + object storage for each repo's owned deps.
- [ ] No service boots with a default/missing secret (fail-closed verified by test).
- [ ] CI fails on missing env variables in production mode (config validation at boot).
- [ ] Staging + prod reachable via CI deploy; **DB migrations run as a gated pipeline step**.
- [ ] All data stores confirmed **India-region** (IaC/policy check).
- [ ] PITR/backup configured; restore drill documented; RPO ≤ 5 min demonstrated in staging.
- [ ] Durable timer/job queue (BullMQ) operational; survives a Redis restart with state intact.
- [ ] Exam-api autoscaling policy validated under a start-burst load test.

## 10. Dependencies & Open Decisions
- **Depends on:** PLAT-01.
- **Open — cloud provider:** AWS `ap-south-1` vs GCP `asia-south1` (both India).
- **Open — managed vs self-hosted PG**; **BullMQ vs cloud-native queue** (ties to PLAT-01 worker-runtime spike).
- **Open — CDN provider** and whether exam media is served signed-URL vs CDN-token-gated.
- **Open — event transport** for cross-repo seams: outbox→consumer vs signed webhooks vs shared bus (README §11.4) — affects Redis/queue vs managed-bus choice.

## 11. Success Metrics
- 0 secret-fallback incidents.
- Start-burst load test passes at 50k concurrent within a 5-min window.
- 100% of PII/biometric stores verified India-region.
- RPO ≤ 5 min met in restore drill; 0 silent migrations in prod.

## 12. Risks & Mitigations
- **Connection storm at slot start** → PgBouncer + read replicas + burst-aware autoscale; load-tested at target.
- **In-process state regression (timers/sessions)** → durable BullMQ + Redis-backed sessions enforced; EXAM-04 timer is durable by contract.
- **Secret leakage / dev fallback** → secrets-manager-only + fail-closed boot + secret-scan (PLAT-01) + no defaults in code (PLAT-05).
- **Data-residency violation** → IaC region policy check blocks non-India provisioning of PII/biometric stores.
- **Vendor lock-in** → S3-compatible + managed-PG-agnostic abstractions in adapters.
- **Migration causing outage** → gated, ordered, reversible migration step; halt-on-failure.
