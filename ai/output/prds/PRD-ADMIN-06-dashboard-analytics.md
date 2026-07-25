# PRD-ADMIN-06: Admin Dashboard, Operational Analytics & Reports
- **Final primary project:** bio-admin | **Impacted projects:** bio-portal, bio-exam, bio-proctor | **Phase:** P2 Admin/Ops | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-ADMIN-06-dashboard-analytics.md + docs/prds/phase-5-scale-compliance/PRD-22-analytics-dashboards.md

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-admin
- **Impacted projects:** bio-portal, bio-exam, bio-proctor
- **Deploy cadence:** admin/curation/results/ops; low baseline outside exams, scale for authoring/results/ops
- **Final boundary note:** Admin owns analytics/read models across registration, attempts, scoring, and proctor signals.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Give admins a live operational + performance + business view of the olympiad: registration/booking funnel, seat fill, revenue, exam attempts, scoring, results, proctor risk, and support/exam-day health — backed by **read-models fed from events**, never heavy live queries on the hot exam-runtime path. Goal: one console (with exports + alerts) to monitor health, conversion, and outcomes across all four repos without degrading runtime.

## 2. Users & Personas
- **Super Admin / Analyst / Leadership** — KPIs, funnel, revenue, score distributions, exports.
- **Ops** — live exam-day monitoring (active attempts, errors, auto-submit backlog).
- **Finance** — payments/refunds reporting + CSV exports (FINANCE role, AUTH-04).
- **Proctor Reviewer** — alert-triage entry point, deep-links into the proctor review console (PROCTOR-04).
- **Content/Admin** — questions/papers/slots status views.

## 3. User Stories
- As an analyst, I see registrations, bookings, revenue, and seat fill by exam/slot/class-band/school/date.
- As an analyst, I see the **commerce funnel** (visitors → OTP starts/verifications → profile completions → slot holds → payment starts/captures/failures → confirmed registrations → refunds).
- As Ops, on exam day I watch live attempts, completion %, auto-submit/backlog, error/disconnect rates, answer-save latency/error rate, and WebSocket connections in near-real-time.
- As an analyst, I see score distributions per exam (avg/median/percentiles), scoring backlog, and release/hold status.
- As a reviewer, I jump from a high-risk attempt to the proctor review console; I see proctor frames/sec, queue depth, risk bands, event-type counts.
- As Finance/Admin, I export CSVs for registrations, payments, slot fill, and results.
- As Ops, I get **alerts** on anomalies (OTP vendor errors, payment webhook failures, oversell attempts, runtime latency, save errors, proctor/auto-submit backlog, DB/Redis pressure).

## 4. Functional Requirements
- **FR-1 (KPI dashboards by group):**
  - **Commerce funnel:** visitors, OTP starts/verifications, profile completions, slot holds, payment starts/captures/failures, confirmed registrations, refunds; bookings/revenue; seat fill.
  - **Admin/content:** questions by status, papers by status, slots published/open/full, capacity vs confirmed/held.
  - **Runtime:** active attempts, answer-save latency/error rate, WebSocket connections, auto-submit backlog, attempts by status, completion %, error/disconnect rates.
  - **Proctor:** frames/sec, queue depth, risk bands, event-type counts, review queue, proctor-flag rates.
  - **Results:** scoring backlog, score distribution (avg/median/percentiles), release status, result holds.
- **FR-2 (Filters & drill-down):** filter by exam/slot/class-band/school/date; drill-down is **audited** and respects PII rules.
- **FR-3 (Live exam-day view):** near-real-time (refresh ≤ 10 s): active attempts, completion %, auto-submit count/backlog, error/disconnect rates, save error rate.
- **FR-4 (Read models):** dashboards backed by **read-models/reporting tables fed from events** (bookings, attempts, scores, proctor) — **never ad-hoc joins on transactional/hot runtime tables**. Refresh near-real-time for ops; slower acceptable for business reports. Built/maintained by `admin-worker` from the cross-repo event streams.
- **FR-5 (Exports):** CSV exports for registrations, payments, slot fill, results (and each dashboard); **permission-gated** (FINANCE/analyst); large exports run **async** (job + download link) and never block APIs; **export access audited**.
- **FR-6 (Alerts):** alert on OTP vendor high error rate, payment webhook failures, seat-reservation oversell attempt, exam-API high latency, answer-save errors, proctor queue backlog, auto-submit backlog, DB/Redis pressure. Alerts testable in staging.
- **FR-7 (Deep links):** deep-link to PROCTOR-04 (review/incident) and SCORE-02 (results/release).

## 5. Non-Functional (perf, security, scale, DPDP)
- Dashboards load **< 1 s p95** over read-models; live view refresh **≤ 10 s**; dashboard self-tracks **freshness ("as of" timestamp) and query latency**.
- **Analytics must not degrade exam runtime** — event-driven read models / read replicas only; no heavy aggregates on hot tables.
- **PII:** aggregates by default; individual drill-down audited; exports permission-gated + audited; no PII over-exposure. India residency.

## 6. Flows, States & Edge Cases
- **Flow:** events → `admin-worker` updates read-models → dashboards/exports/alerts read from read-models.
- **Edges:** event lag → show "as of" timestamp; partial data during a live exam → clearly labeled; very large exports → async job + download link; alert during incident → links into exam-day ops/incident response (OPS-01 / theirs PRD-24).

## 7. Data Model & Contracts (entities, named events, APIs)
- **Read-models:** `RegistrationStats`, `BookingRevenue`, `SeatFill`, `AttemptStats`, `ScoreDistribution`, `ProctorFlagStats` (plus funnel/runtime/results reporting tables).
- **Consumes (events):** bio-portal → core: `PaymentCaptured`, `RegistrationConfirmed`, `RegistrationCancelled`, `RefundProcessed`, `SeatReservationHeld/Expired`; core internal: `attempt.started/submitted/scored`; bio-proctor → core: `ProctorEventRaised`, `RiskScoreChanged`, `ProctorReportFinalized`; admin: `ExamSlotPublished/CapacityChanged/Closed`. (No new outbound events; read-only analytics consumer.)
- **APIs (`admin-api`):** `GET /dashboards/:group?filters`, `GET /dashboards/live`, `POST /exports/:type` (async job), `GET /exports/:jobId`, `GET /alerts` / alert config.

## 8. Out of Scope
- Individual result/certificate issuance (SCORE-02). Proctor review **actions/decisions** (PROCTOR-04). Question/item analytics (future). Owning the alert delivery infra beyond config (PLAT-04/OPS-01).

## 9. Acceptance Criteria
- [ ] Core KPIs render from **read-models < 1 s p95**; each dashboard shows an "as of" freshness timestamp.
- [ ] Commerce dashboard shows the booking funnel; admin/content, runtime, proctor, and results groups render.
- [ ] Live exam-day view reflects active attempts, auto-submits/backlog, errors, and answer-save error rate within **10 s**.
- [ ] Drill-downs are **audited**; aggregates expose **no individual PII by default**.
- [ ] CSV export works per dashboard, is permission-gated + audited, and **large exports run async without blocking APIs**.
- [ ] Alerts fire on the defined anomalies and are testable in staging.

## 10. Dependencies & Open Decisions
- Depends on ADMIN-04 (publish/snapshot ids), PLAT-04 (audit/observability), and event streams from PORTAL/EXAM/SCORE/PROCTOR. Cross-repo since source events span all 4 repos.
- **Open:** read-model store (materialized views vs separate analytics DB vs read replica); real-time transport; BI tool vs in-app dashboards; alert delivery channel/ownership (here vs PLAT-04/OPS-01); export retention/expiry of download links.
- **Note (theirs adds):** explicit dashboard **groups** (commerce/admin/runtime/proctor/results) with concrete metrics, **alerts** catalog, async permission-gated audited exports, freshness/latency self-tracking, cross-repo scope (P1, Phase 5). **Mine adds:** named read-models, < 1 s p95 + ≤ 10 s live refresh targets, audited drill-down with PII-by-aggregate default, deep links to PROCTOR-04/SCORE-02, exam/slot/band/school/date filters.

## 11. Success Metrics
- Dashboard adoption by ops on exam day; decision latency; read-model freshness lag.
- Dashboard query latency (p95); export success rate.
- 0 PII-exposure incidents; 0 instances of analytics degrading runtime.

## 12. Risks & Mitigations
- **Analytics becomes production DB load / degrades runtime** → event-driven read models + read replicas; no hot-table aggregates; large exports async.
- **PII over-exposure via drill-down/exports** → aggregate-by-default, audited drill-down, permission-gated + audited exports.
- **Stale/misleading data during incidents** → "as of" timestamps, partial-data labeling, freshness self-monitoring + alerts.
