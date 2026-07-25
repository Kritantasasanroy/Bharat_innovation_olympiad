# PRD-PLAT-04: Observability, Telemetry & Immutable Audit Trail
- **Final primary project:** all four repos / foundation track | **Impacted projects:** bio-portal, bio-admin, bio-exam, bio-proctor | **Phase:** P0 Foundation | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-PLAT-04-observability-audit.md + docs/prds/phase-5-scale-compliance/PRD-22-analytics-dashboards.md (observability / read-model parts) + docs/prds/phase-5-scale-compliance/PRD-24-exam-day-ops-incident-response.md (telemetry parts)

## 0. Final Ownership & Service Boundary

- **Final primary project:** all four repos / foundation track
- **Impacted projects:** bio-portal, bio-admin, bio-exam, bio-proctor
- **Deploy cadence:** foundation; applies to all deployment cadences
- **Final boundary note:** One telemetry/audit standard across portal, admin, exam runtime, and proctor.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
A contested national result needs a defensible record, and a time-bound live Olympiad needs real-time operational visibility. Provide structured logging, metrics, distributed tracing, error tracking, the **telemetry feed** that powers exam-day ops dashboards, and an **immutable audit trail that is actually wired** — the prior build defined an audit interceptor and never registered it.

**Goal:** every privileged/state-changing action is auditable; every service is observable; exam-day ops can see live slot health; analytics never degrades the exam runtime.

## 2. Users & Personas
- **Ops / on-call** — metrics, alerts, live exam-day command-center health.
- **Support / Grievance** — audit lookups ("who changed this score/booking and when").
- **Security** — incident forensics across services.
- **Engineers** — distributed tracing across portal → core → proctor.
- **Leadership / Finance** — read-model-backed business dashboards (funnel, payments) — built without touching hot runtime tables.

## 3. User Stories
- As Support, I can show who changed a question/score/booking/consent and when.
- As Ops, I get alerted when exam-start error rate, answer-save error rate, or auto-submit lag breaches threshold.
- As an engineer, I trace a single request across portal → core → proctor via a propagated correlation ID.
- As Ops on exam day, one dashboard shows live active attempts, answer-save error rate, WS connections, proctor queue depth, and auto-submit backlog per slot.
- As Finance, I read the commerce funnel from a read model that never queries the live commerce DB hot path.

## 4. Functional Requirements

### FR-1 — Structured logging
- **pino** (TS) / structured JSON (Python) with request ID + propagated **correlation/trace ID**.
- **PII/secret redaction** at the logger boundary (tokens, OTPs, payment secrets, biometric data — cross-ref PLAT-05 redaction matrix). Errors logged with safe redaction.

### FR-2 — Metrics (Prometheus / OpenTelemetry-compatible)
Per-service, with these **critical metrics** exposed:
- Runtime: exam-start rate, active attempts, **answer-save latency + error rate**, WebSocket connection count, **auto-submit backlog/lag**, attempts-by-status.
- Commerce: OTP starts/verifications, payment success rate, payment-webhook failures, **seat-hold contention / oversell attempts**, confirmed registrations, refunds.
- Proctor: frames/sec, **queue depth**, risk bands, event-type counts, review-queue depth.
- Scoring/results: scoring backlog, score distribution, release status, result holds.
- Infra: DB/Redis pressure.

### FR-3 — Distributed tracing
- Cross-service trace propagation via headers (W3C `traceparent`/correlation ID) across portal → core → proctor; trace overhead < 2%.

### FR-4 — Error tracking
- Sentry (or self-hosted equivalent) wired in every service, PII-redacted.

### FR-5 — Immutable audit trail (the headline fix)
- Append-only `AuditLog`: **actor, action, resource, before/after (where applicable), IP, timestamp, correlationId**.
- **Globally registered** in every API (interceptor/middleware) — not opt-in. Covers: auth (login, role change, force-logout), authoring (create/approve/publish), scoring, bookings, refunds, **consent**, **retention/deletion**, and all governed ops controls (PRD-24 dangerous actions).
- Audit write **must not fail the request** (async, durable buffer) but **must not silently drop** (dead-letter + alert).

### FR-6 — Reporting read models (analytics off the hot path)
- Build reporting tables / read models **from events** (PLAT-02 catalog), not from hot runtime tables.
- Refresh **near-real-time for ops**, slower for business reports (acceptable lag).
- Read from replicas (PLAT-03), never the runtime primary, for heavy aggregates.

### FR-7 — Exam-day telemetry feed (command-center source)
- Expose the per-slot live metrics (FR-2 runtime/proctor/commerce subset) as the data source for the OPS-01 command-center dashboard: registrations confirmed, checked-in, attempts started, active attempts, answer-save error rate, WS count, proctor queue depth, auto-submit backlog, open support tickets, incident-banner status.

### FR-8 — Dashboards & alerts
- Dashboards per critical metric; alert rules on: OTP-vendor high error rate, payment-webhook failures, **seat-reservation oversell attempt**, exam-API high latency, answer-save errors, proctor-queue backlog, auto-submit backlog, DB/Redis pressure.
- Alerts must be **testable in staging** (synthetic breach).

## 5. Non-Functional (perf, security, scale, DPDP)
- **Audit:** tamper-evident, append-only; periodic immutable export; partitioned by month for write volume.
- **Privacy/DPDP:** all logs PII-redacted; audit `before/after` redacts sensitive field values per PLAT-05 matrix; biometric/OTP/token never logged.
- **Perf:** trace overhead < 2%; analytics queries isolated from runtime (read models + replicas) so dashboards never degrade exam-start/answer-save.
- **Scale:** audit + telemetry sized for the 50k-concurrent burst (PLAT-03); high-write audit → partitioned table / append store.

## 6. Flows, States & Edge Cases
- **Audit write path:** request → async durable buffer → append store; on buffer/store failure → dead-letter + alert (never silently dropped, never blocks the user request).
- **High audit write volume** (burst) → partitioned `AuditLog` (by month) / append-only store absorbs.
- **Trace continuity:** missing inbound `traceparent` → generate a root and propagate downstream; never drop the correlation chain mid-flow.
- **Analytics load spike** → served from read replicas / read models; runtime primary untouched.
- **Redaction failure-closed:** if a field can't be classified for redaction, log is dropped/flagged rather than leaking raw PII.

## 7. Data Model & Contracts (entities, named events, APIs)
- **`AuditLog`** `{ id, actor, actorRole, action, resourceType, resourceId, before?, after?, ip, correlationId, occurredAt }` — append-only, partitioned by month (`bio-admin` and `bio-exam` each write their own audit partitions/stores; cross-service correlation via trace/correlation ids).
- **Read models / reporting tables** derived from the PLAT-02 event catalog (`PaymentCaptured`, `RegistrationConfirmed`, `attempt.started/submitted/scored`, `ProctorEventRaised`, `RiskScoreChanged`, etc.).
- **Standard log/trace envelope** lives in `shared-types` (PLAT-02).
- **Health endpoints** `/health/live`, `/health/ready` (defined PLAT-01) — this PRD owns their liveness/readiness semantics.

## 8. Out of Scope
- Business-analytics product surfaces / exports UI (ADMIN-06; OPS-01 owns the command-center UI and support/runbook flows — this PRD provides the telemetry/read-model substrate).
- Proctor ML-quality metrics specifics (PROCTOR-03).
- The governed ops-control actions themselves (OPS-01) — this PRD only guarantees they emit audit + telemetry.

## 9. Acceptance Criteria
- [ ] Audit interceptor/middleware **registered and verified on every API** (integration test asserts registration, not just existence).
- [ ] Privileged actions (role change, publish, score, refund, consent, deletion, governed ops controls) each produce an audit record with actor/action/resource/before-after/IP/correlationId.
- [ ] Cross-service trace visible for a portal → core → proctor request (single correlation ID).
- [ ] Alerts fire on a synthetic breach of **each** critical metric in staging.
- [ ] Ops dashboard shows live active attempts and answer-save error rate per slot.
- [ ] Commerce dashboard shows the booking funnel from a **read model** (not the hot commerce table).
- [ ] A large export / heavy aggregate runs against replicas/read models and does **not** block or slow the runtime API.
- [ ] Audit write failure dead-letters + alerts and never fails the originating request (fault-injection test).
- [ ] Token/OTP/biometric/payment-secret values never appear in logs (redaction test).

## 10. Dependencies & Open Decisions
- **Depends on:** PLAT-03 (datastores, replicas, queues), PLAT-02 (event catalog, log/trace envelope), PLAT-05 (redaction matrix).
- **Open — error tracking:** Sentry (SaaS) vs self-hosted (residency consideration — keep India-region or self-host).
- **Open — OTel collector placement** (sidecar vs central) and backend (Prometheus/Grafana vs managed).
- **Open — audit store:** PG partitioned table vs append-only store; export medium for tamper-evidence (WORM bucket vs signed periodic export).

## 11. Success Metrics
- 100% of privileged actions audited; 0 unexplained state changes.
- Reduced MTTR via tracing; time-to-detect-incident and time-to-first-admin-communication tracked (feeds OPS-01).
- Dashboard freshness + query latency within SLO; 0 analytics-induced runtime degradations.

## 12. Risks & Mitigations
- **Unwired audit (prior bug recurs)** → registration asserted by integration test in CI; deny-merge if any API lacks the interceptor.
- **Audit write blocks or drops** → async durable buffer + dead-letter + alert; fault-injection tested.
- **Analytics becomes production DB load** → event-driven read models + read replicas; runtime primary never queried for dashboards.
- **PII leaking into logs/audit** → redaction at logger + audit boundary (PLAT-05 matrix); fail-closed on unclassifiable fields.
- **Telemetry gaps on exam day** → critical-metric set fixed here and validated by synthetic alert tests before any large live exam.
