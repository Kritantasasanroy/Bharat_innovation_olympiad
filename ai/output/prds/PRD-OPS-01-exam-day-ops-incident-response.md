# PRD-OPS-01: Exam-Day Operations, Support & Incident Response
- **Final primary project:** bio-admin | **Impacted projects:** bio-portal, bio-exam, bio-proctor | **Phase:** P7 Ops | **Status:** Final golden PRD
- **Source union:** docs/prds/phase-5-scale-compliance/PRD-24-exam-day-ops-incident-response.md (+ cross-cutting ops notes from docs/prd/: PLAT-04, ADMIN-06, EXAM-03/04, PORTAL-04/07, AUTH-01, ADMIN-04)

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-admin
- **Impacted projects:** bio-portal, bio-exam, bio-proctor
- **Deploy cadence:** admin/curation/results/ops; low baseline outside exams, scale for authoring/results/ops
- **Final boundary note:** Admin owns command center/runbooks/controls; all runtime services emit signals and accept governed controls.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Live Olympiad exams are time-bound, national-scale, and contestable: a failure during slot start, OTP login, payment/webhook, entitlement gate, answer-save, durable timer, proctoring, or result release can hit thousands of students inside a fixed window, with no second chance and reputational/legal exposure. The platform already emits the *signals* (PLAT-04 metrics/audit) and the *read-models* (ADMIN-06), but there is **no operational surface to act on them** — no per-slot command center, no safe support lookup, no governed mid-incident controls, and no tested runbooks. The prior audit also warns that ad-hoc manual intervention during an exam can silently destroy result integrity.

**Goal:** ship an **exam-day command center (per active slot)** that aggregates health from all four repos, a **safe support-lookup** surface (find a student by mobile / registration-code / payment-receipt / attempt-id, see SAFE info only), a set of **governed ops controls** (permission-gated, audited, dual-control on dangerous actions) that recover students *without* harming integrity, a library of **tested incident runbooks** for every known failure class, a **student-facing incident banner + comms templates**, and a **post-incident report** workflow. OPS-01 is the *cockpit and playbook layer* — it **consumes** ADMIN-06 read-models and PLAT-04 audit/metrics/alerts; it does not re-implement them (see §10 boundary).

## 2. Users & Personas
- **Exam-Day Operations Lead (Ops)** — owns the live slot; watches the command center, declares incidents, runs runbooks, triggers comms. Primary persona.
- **Support Agent (Tier-1/Tier-2)** — fields student/parent contacts; uses support-lookup + the *safe* recovery controls (resend admit card, mark device-issue exception, raise ticket). Cannot see keys or raw proctor images.
- **Super Admin / Incident Commander** — approves dangerous/dual-control actions (governed cancel/refund, pause result release, slot-wide check-in extension), authors the post-incident report.
- **Engineering On-Call** — owns infra runbooks (DB/Redis degradation, exam-api latency, queue backlog); paged from PLAT-04 alerts; works alongside Ops.
- **Proctor Reviewer** (entry point only) — deep-links from a flagged attempt into the PROCTOR-04 review console (OPS-01 does not duplicate review actions).
- **Indirect:** **Finance** (refund reconciliation via PORTAL-04/06), **Security** (forensics via PLAT-04 audit), **Students/Parents** (recipients of the incident banner and comms templates).

## 3. User Stories
- As **Ops**, I open the command center for slot `S` and see in one view: confirmed registrations, checked-in count, attempts started/active, answer-save error rate, WS connection count, durable-timer/auto-submit backlog, proctor queue depth, open support tickets, and current banner status — so I know the slot's health at a glance.
- As **Ops**, when answer-save error rate breaches threshold mid-exam, I get the matching runbook surfaced inline and can act from the same screen.
- As a **Support Agent**, a parent gives me a mobile number or registration code and I instantly find the student's registration status, payment summary, slot time, readiness, attempt status, and last heartbeat — **without** ever seeing answer keys or raw proctor frames.
- As a **Support Agent**, a student's webcam failed device-check; I **mark a support exception** and **resend the admit card** so they can proceed — and every such action is logged with my identity.
- As a **Super Admin**, a bad paper went live; I **pause result release** for the affected exam and **extend the check-in window** for the slot — both requiring a second approver and producing an audit record.
- As **Ops**, MSG91 OTP delivery is failing; I open the *MSG91 outage* runbook, flip the documented fallback/mitigation, and publish a student-facing incident banner + send the templated SMS/email — all from the cockpit.
- As **Engineering On-Call**, I'm paged on exam-api latency; the runbook tells me exactly which dashboards (PLAT-04), which scale levers, and which Ops controls (extend check-in, banner) to coordinate.
- As a **Super Admin**, after the incident I generate a **post-incident report** that auto-pulls the audit timeline (PLAT-04), the controls invoked, the impact metrics, and a blameless RCA + action items.

## 4. Functional Requirements

### FR-1 — Command center (per active slot)
A real-time operational console scoped to a **slot** (multi-slot exam day → slot switcher / aggregate roll-up). Tiles (all sourced from ADMIN-06 read-models + PLAT-04 metrics — **read-only aggregation, no new compute on the hot path**):
1. Registrations confirmed (entitlements ACTIVE for the slot).
2. Students checked in / readiness passed (EXAM-01).
3. Attempts started; active attempts; completed; auto-submitted.
4. **Answer-save error rate** (EXAM-03 autosave failures / reconciliation conflicts).
5. **WebSocket connection count** (exam-ws heartbeat channel) + disconnect rate.
6. **Durable-timer / auto-submit backlog** (BullMQ delayed-job depth + jobs firing late vs `endsAt`, EXAM-04).
7. **Proctor queue depth** (proctor-worker frame/event backlog, PROCTOR-02/03).
8. Open support tickets (by issue class).
9. Incident banner status (active/inactive, scope, message).
10. **Health roll-up** per upstream dependency (MSG91, Razorpay/webhooks, exam-api latency, DB/Redis) from PLAT-04 — green/amber/red with "as-of" timestamp.
- Each tile shows an **"as of" timestamp** (read-models are event-fed and may lag — inherit ADMIN-06's lag semantics) and a **breach indicator** when the underlying PLAT-04 alert threshold is crossed.
- A breached tile **surfaces the matching runbook inline** (deep-link to FR-4) and a one-click "declare incident" affordance.

### FR-2 — Support lookup (SAFE info only)
2.1 **Search keys:** mobile (phoneHash match), registration code, **payment receipt / Razorpay reference**, attempt id. Lookup is itself a privileged, **audited** action (PLAT-04).
2.2 **Safe view returns:** registration status; **payment status summary** (paid/pending/refunded — never card data, never raw gateway payloads); slot date/time; readiness/device-check status (EXAM-01); attempt status + **last heartbeat**; admit-card status; entitlement state; current proctor **risk band** (LOW/MED/HIGH label only).
2.3 **Hard exclusions (deny-by-default):** answer keys / correct answers (ADMIN-01/04 — SUPPORT already 403 on key endpoints), raw proctor images/frames or biometric vectors (PROCTOR-02/05), full PII beyond what's needed, raw payment gateway payloads. Elevated views (e.g., a specific proctor frame for a grievance) require an **explicit elevated permission** + audited reason, and are an entry point into PROCTOR-04 — not rendered inline here.
2.4 **No state change from the read view** — actions live in FR-3 behind their own gates.

### FR-3 — Governed ops controls (permission-gated; dual-control on dangerous actions)
Two tiers, deny-by-default, **every action audited** (actor, target, reason, before/after) via PLAT-04:
- **Safe (single Support/Ops actor + audit):**
  1. **Resend confirmation / admit card** (re-trigger PORTAL-05 notification).
  2. **Mark student support exception** for a device/connectivity issue (annotates the attempt/registration; may relax a non-integrity gate per policy — never bypasses entitlement or proctoring).
  3. **Raise / annotate support ticket**; link to ticketing.
- **Dangerous (require Super-Admin approval + DUAL CONTROL: a second distinct approver + mandatory reason; idempotent; audited):**
  4. **Extend check-in window** for a slot (slot-wide; affects EXAM-01 gate timing).
  5. **Governed cancel + refund** of a registration (delegates to PORTAL-06 refund workflow; never an ad-hoc money movement — OPS-01 *initiates the governed flow*, it does not move funds itself).
  6. **Pause / resume result release** for an exam/slot (blocks SCORE-02 publication; e.g., bad paper or contested integrity).
  7. **Set / clear incident banner** on the student portal/exam app (FR-5).
  8. (Where policy allows) **slot-wide timer/window adjustment** — highest-risk; dual-control + Incident-Commander sign-off; must respect EXAM-04 server-authoritative timer (adjust `endsAt` via the supported path, never edit timers ad hoc).
- **Integrity guardrails (prior-audit fix):** no control may reveal keys, retro-edit a submitted answer, alter a score directly, or silently change a published snapshot. Dangerous controls are **idempotent**, **reversible or compensating where possible**, and **always enqueue a post-incident review** item (FR-6). All controls fail **closed** if the audit write path is unavailable.

### FR-4 — Incident runbooks (tested)
Versioned, in-repo runbooks (one per failure class), each with: **detection signal** (which PLAT-04 metric/alert/threshold), **blast-radius**, **immediate mitigation**, **Ops controls to invoke** (FR-3), **comms to send** (FR-5), **escalation/on-call owner**, **recovery & verification steps**, and **rollback**. Required runbooks:
1. **MSG91 OTP outage** → detect: OTP send-failure rate / deliverability drop. Mitigate: provider fallback route behind `SmsSenderPort` (AUTH-01), relax/extend login window, banner. 
2. **Razorpay payment / webhook outage** → detect: `payment.captured` webhook lag / signature-verify failures (PORTAL-04). Mitigate: rely on poll/verify + reconciliation report; hold seats; auto-refund capture-after-seat-lost (PORTAL-06); banner.
3. **Exam-api high latency** → detect: p95 latency / error-rate alert (PLAT-04). Mitigate: scale levers, extend check-in window, banner; on-call owns infra.
4. **Answer-save failures** → detect: autosave error rate / reconciliation-conflict spike (EXAM-03). Mitigate: confirm offline-buffer/flush is functioning, raise per-student exceptions, banner; never fabricate answers.
5. **WebSocket / timer issues** → detect: WS disconnect surge or auto-submit firing late vs `endsAt` (EXAM-04). Mitigate: timer correctness is BullMQ-durable and **does not depend on WS** — verify delayed-job queue health (Redis), fall back to poll/`endsAt` display, do **not** start untimed exams.
6. **Proctor worker backlog** → detect: proctor queue depth / frame-processing lag (PROCTOR-02/03). Mitigate: scale proctor-worker, degrade to deferred/async scoring of frames, ensure exam continues (proctoring observes, never blocks the attempt).
7. **SEB config failure** → detect: SEB launch/handshake failures (EXAM-06). Mitigate: reissue config, support-exception path, banner.
8. **DB / Redis degradation** → detect: connection/error/latency alerts (PLAT-04, PLAT-03). Mitigate: failover, throttle non-critical writes, protect timer/answer-save paths; on-call owns.
9. **Accidental bad paper / snapshot** → detect: signature-mismatch-on-consume alert (ADMIN-04) or content report. Mitigate: **pause result release** (FR-3.6), republish corrected snapshot as a new version for new attempts (live attempts pinned), governed remediation; banner.
10. **Suspected security incident** → detect: anomaly/abuse alerts, audit anomalies. Mitigate: contain, preserve PLAT-04 audit forensics, engage Security, banner, post-incident report.
- **Tabletop requirement:** each runbook is exercised in a **staging tabletop** and marked `tested` with date + participants before the first large live exam.

### FR-5 — Communications
1. **Student-facing incident banner** — set/clear from FR-3.7; scoped (global / exam / slot); rendered on student-portal-web + exam-web; localized; severity-styled; shows ETA/next-step when known.
2. **Templated SMS/email** for reschedule / cancellation / refund / "we're investigating" / "resolved" — reuse PORTAL-05 notification channels + MSG91; placeholders pre-approved (DLT-compliant).
3. **Admin internal incident notes** — timeline thread on the incident record (who did what, when).
4. **Post-incident report template** (links to FR-6).

### FR-6 — Post-incident report & review
- Every declared incident and every **dangerous control invocation** opens a **post-incident review** item.
- Report **auto-assembles** from existing sources: PLAT-04 **audit timeline** + metrics snapshots, the controls invoked (FR-3), affected-student counts (ADMIN-06 read-models), and comms sent (FR-5).
- Adds human fields: blameless RCA, contributing factors, integrity-impact assessment, action items + owners + due dates, sign-off by Incident Commander.
- Action items are trackable to closure; the integrity-impact assessment is **mandatory** before a paused result release may be resumed.

## 5. Non-Functional (perf, security, scale, DPDP)
- **Performance:** command-center tiles render < 1s p95 from read-models (inherits ADMIN-06 budget); live refresh ≤ 10s; support-lookup p95 < 500 ms; the cockpit **never queries hot transactional tables** during a live exam (read-models + metrics only).
- **Availability:** the command center and support tools must remain usable when an upstream dependency is degraded (they're a separate surface); they degrade gracefully with "as-of" staleness rather than failing.
- **Security / integrity:** all lookups and all controls are RBAC-gated **deny-by-default**; dangerous controls require **dual control** (two distinct human approvers) + reason; **no public route exposes any of this** (admin-strong auth, AUTH-04). Controls **fail closed** if audit is unavailable. No control can reveal answer keys, edit submitted answers, mutate a score, or alter a published snapshot.
- **Auditability:** **every** lookup, control invocation, approval, banner change, and report action emits a PLAT-04 audit record (actor, action, target, before/after, IP, reason, timestamp) — append-only/tamper-evident. OPS-01 **emits** audit events; it does not own the audit store.
- **Scale:** designed for a single national slot of tens of thousands of concurrent attempts; tile aggregation is O(read-model), independent of live concurrency.
- **DPDP / residency:** all ops data and audit in **India region**; support views minimize PII (need-to-know); no biometric data surfaced in OPS-01; elevated PII/proctor-frame access is separately permissioned, audited, and reason-bound; retention of incident records follows the platform policy (AUTH-03 / PROCTOR-05 own retention mechanics).

## 6. Flows, States & Edge Cases
- **Incident lifecycle:** `DETECTED → DECLARED → MITIGATING → RECOVERING → RESOLVED → POST_MORTEM → CLOSED`. Banner + comms attach at DECLARED; post-incident review opens at DECLARED/dangerous-control; CLOSED requires RCA + action items + (if applicable) integrity sign-off.
- **Dangerous-control approval flow:** initiator proposes (with reason) → action enters `PENDING_APPROVAL` → distinct second approver (Super-Admin) confirms → `EXECUTED` (idempotent) → audit + post-incident item. Self-approval is rejected; expiry on un-approved proposals.
- **Edge cases:**
  - **Read-model lag** during the incident → tiles show stale "as-of"; never present stale data as live; critical decisions cross-checked against PLAT-04 raw metrics.
  - **Audit path down** → all controls **refuse to execute** (fail-closed), command center read-only.
  - **Banner race** (two ops set conflicting banners) → last-write-wins with audit; banner record single-owner per scope.
  - **Refund control vs in-flight payment** → defer to PORTAL-04/06 idempotency (capture-after-seat-lost auto-refunds; duplicate webhooks no-op) — OPS-01 never double-refunds.
  - **Extend-check-in after some attempts started** → applies only to not-yet-checked-in students; in-flight attempts unaffected; EXAM-04 `endsAt` per attempt unchanged unless a separate timer control is invoked.
  - **Pause-result-release after some results released** → blocks further SCORE-02 publication only; already-released results handled via governed remediation (out of band), flagged in the report.
  - **Bad-snapshot mid-exam** → republish is a *new version for new attempts*; live attempts stay pinned (ADMIN-04) — runbook 9 makes this explicit so Ops don't expect retro-correction.
  - **Support exception abuse** → exceptions are rate-aware, audited, and reviewable in the post-incident report.

## 7. Data Model & Contracts (entities, named events, APIs)
- **Entities (OPS-01-owned):**
  - `Incident { id, slotId?, examId?, class, severity, status, declaredBy, declaredAt, resolvedAt }`
  - `IncidentAction { id, incidentId?, type, target, params, requestedBy, approvedBy?, status(PENDING_APPROVAL|EXECUTED|REJECTED), reason, executedAt }` (one per FR-3 control invocation)
  - `IncidentBanner { id, scope(GLOBAL|EXAM|SLOT), targetId?, message, severity, active, setBy, setAt, clearedBy?, clearedAt }`
  - `SupportException { id, attemptId|registrationId, type, reason, createdBy, createdAt }`
  - `SupportLookupLog` — every lookup (audited; may be realized purely as PLAT-04 `AuditLog` rows).
  - `PostIncidentReport { id, incidentId, rca, integrityImpact, actionItems[], signedOffBy }`
- **Consumed read-models (ADMIN-06, do not redefine):** `RegistrationStats`, `AttemptStats`, `ScoreDistribution`, `ProctorFlagStats`, `SeatFill`, `BookingRevenue`.
- **Consumed signals (PLAT-04, do not redefine):** metrics (exam-start rate, auto-submit lag, payment success rate, seat-hold contention, **proctor queue depth**, **answer-save error rate**, exam-api p95), alert rules, and the `AuditLog` write path.
- **Cross-repo events (reference catalog — OPS-01 reacts to / surfaces, does not originate the domain ones):**
  - Inbound visibility: `RegistrationConfirmed` / `RegistrationCancelled` / `RefundProcessed` (portal→core), `ExamSlotPublished` / `ExamSnapshotPublished` (admin→portal/exam), `ProctorEventRaised` / `RiskScoreChanged` (proctor→core), `attempt.started` / `attempt.submitted` / `attempt.scored` (core internal). These feed the tiles via ADMIN-06 read-models.
  - OPS-01 **may emit** operational/audit events for its own controls (e.g., `ops.incident.declared`, `ops.banner.changed`, `ops.control.executed`) — naming finalized with PLAT-04/codex; these are operational, not domain events.
- **APIs (`admin-api`, in/http — admin-strong auth, deny-by-default):**
  - `GET /ops/command-center?slotId=` (tiles), `GET /ops/support/lookup?key=&value=` (safe view), 
  - `POST /ops/controls/{resend-admit-card|support-exception|extend-checkin|cancel-refund|pause-results|banner|timer-adjust}` (dangerous ones require an approval token / second-approver flow), 
  - `POST /ops/incidents`, `PATCH /ops/incidents/:id`, `POST /ops/incidents/:id/report`.
  - Cross-repo controls (refund) call PORTAL-06; proctor-frame elevation deep-links PROCTOR-04 — OPS-01 orchestrates via existing service contracts rather than reaching into other repos' data stores.

## 8. Out of Scope
- **Building** the analytics read-models, KPI dashboards, or the live exam-day *analytics* view — owned by **ADMIN-06** (OPS-01 consumes them).
- **Building** the observability stack, metrics emission, tracing, alert-rule plumbing, or the audit store/interceptor — owned by **PLAT-04** (OPS-01 consumes/emits into them).
- Proctor **review actions / adjudication** — owned by PROCTOR-04 (OPS-01 only deep-links in).
- The refund *money movement* mechanics, gateway integration, and reconciliation engine — owned by PORTAL-04/06 (OPS-01 initiates the governed flow).
- Result scoring/ranking/certificate issuance — SCORE-01/02 (OPS-01 only pauses/resumes release).
- The OTP provider, payment gateway, timer engine, autosave, SEB internals — owned by their respective PRDs (OPS-01 references their failure modes in runbooks).
- General (non-exam-day) admin user/school management — ADMIN-05.

## 9. Acceptance Criteria
- [ ] Ops can see a single slot's health (registrations, check-in, attempts/active, answer-save error rate, WS count, timer/auto-submit backlog, proctor queue depth, open tickets, banner, dependency roll-up) in one command-center view, each tile with an "as-of" timestamp.
- [ ] A breached metric surfaces the matching runbook inline and a "declare incident" action.
- [ ] Support can find a student by **mobile, registration code, payment receipt, and attempt id**; the safe view shows status/readiness/attempt/heartbeat/payment-summary.
- [ ] Support **cannot** see answer keys (403) or raw proctor frames/biometrics; every lookup is audited.
- [ ] Safe controls (resend admit card, support exception, raise ticket) work with single-actor audit.
- [ ] Dangerous controls (extend check-in, cancel/refund, pause result release, banner, timer adjust) **require a second distinct approver + reason**, are idempotent, are audited, and open a post-incident review item.
- [ ] Any control **fails closed** if the audit write path is unavailable (verified by test).
- [ ] Incident banner can be enabled/disabled with audit and renders on student-portal-web + exam-web; templated reschedule/cancel/refund comms send via the PORTAL-05/MSG91 channels.
- [ ] **At least five** runbooks are present and exercised in a staging tabletop (target: all ten before first large live exam); each has detection signal, mitigation, controls, comms, escalation, recovery, rollback.
- [ ] A post-incident report auto-assembles the audit timeline, controls invoked, impact counts, and comms; resuming a paused result release requires a completed integrity-impact assessment.
- [ ] No OPS-01 surface or control can reveal keys, edit a submitted answer, mutate a score, or alter a published snapshot (verified).

## 10. Dependencies & Open Decisions
- **Depends on:** ADMIN-06 (read-models + live exam-day view) · PLAT-04 (metrics, alerts, audit trail) · AUTH-04 (admin-strong auth/RBAC + dual-control roles) · Phases 1-6 for the underlying flows whose failures the runbooks address (AUTH-01 OTP/`SmsSenderPort`, PORTAL-04/06 payments/refunds, PORTAL-05 notifications, PORTAL-07 entitlement sync, EXAM-01/03/04/06 device/autosave/timer/SEB, ADMIN-04 publish-snapshot, PROCTOR-02/03/04).
- **Boundary with ADMIN-06 (for codex):** ADMIN-06 = the *analytics/read-model layer* (KPIs, funnels, score distributions, the near-real-time exam-day metric view). OPS-01 = the *operational cockpit + action + playbook layer* that **reads ADMIN-06 tiles** and **adds controls, runbooks, comms, incidents**. Recommendation: keep all read-model definitions in ADMIN-06; OPS-01 composes them plus PLAT-04 signals into the command center. **Decide:** does the "live exam-day view" UI live in ADMIN-06 and OPS-01 embeds it, or does OPS-01 own the exam-day cockpit and ADMIN-06 stays KPI-only? (Recommend: ADMIN-06 owns generic dashboards/KPIs; **OPS-01 owns the per-slot command center surface** and embeds ADMIN-06 read-models — single ownership of the action layer.)
- **Boundary with PLAT-04 (for codex):** PLAT-04 = audit store + interceptor, metric emission, alert *rules*, tracing. OPS-01 = a **consumer/emitter** — it reads metrics/alerts to drive tiles and runbook detection, and writes audit records for its controls. Recommendation: the **detection thresholds** for runbooks are defined as PLAT-04 alert rules (single source of truth), and OPS-01 references them; OPS-01 must **not** re-define alerting. The `ops.*` operational event names should be ratified in the PLAT-02/PLAT-04 catalog.
- **Open decisions:**
  1. **Ticketing system** — build-in vs integrate (Zendesk/Freshdesk/etc.); affects FR-3 ticket flow and support-lookup linkage.
  2. **Dual-control mechanics** — in-app two-person approval vs break-glass with after-the-fact review; approval-token TTL; which exact controls require Incident-Commander (not just any second Super-Admin).
  3. **Banner transport** — config flag polled by clients vs pushed via exam-ws; v1 stance (recommend: durable config + short poll, consistent with EXAM-04 timer stance).
  4. **Refund initiation contract** — sync call to PORTAL-06 vs emit a governed `refund.requested` event; cross-repo transport ties into the §11 README open decision on event transport.
  5. **Exam-day-view ownership** — see ADMIN-06 boundary above.
  6. **Incident-record store** — within bio-admin admin DB vs a dedicated ops store; residency-compliant either way.

## 11. Success Metrics
- **Time to detect** an incident (alert → acknowledged in command center).
- **Time to first student communication** (incident declared → banner/comms live).
- **Recovery Time Objective (RTO) per incident class** (MSG91, Razorpay, exam-api latency, answer-save, WS/timer, proctor backlog, SEB, DB/Redis, bad snapshot, security) — measured against runbook targets.
- **Support ticket volume by issue class** + median support-lookup-to-resolution time.
- **% of dangerous controls with complete dual-control + audit** (target 100%).
- **% of runbooks tabletop-tested before the first large live exam** (target 100%).
- **0 integrity-harming manual interventions** (no key exposure, no answer/score tampering, no silent snapshot change) — hard gate.
- **0 "paid but couldn't sit"** and **0 "results released during a paused window"** incidents traced to the ops layer.

## 12. Risks & Mitigations
- **Manual ops controls harm result integrity** (prior-audit fix) → permission gates + **dual control** on dangerous actions + full audit + **mandatory post-incident integrity review**; controls structurally barred from keys/answers/scores/snapshots; fail-closed on audit outage.
- **Command center duplicates ADMIN-06/PLAT-04** and drifts → strict consume-only boundary; tiles bind to ADMIN-06 read-models, detection to PLAT-04 alert rules; no new metric/read-model defined here.
- **Cockpit is itself unavailable during the incident it's meant to manage** → separate surface, degrades to stale "as-of" rather than failing; runbooks include an out-of-band comms path (templates) usable even if a sub-tile is down.
- **Untested runbooks fail under real pressure** → staging tabletop gate with `tested` flag + participants before first large live exam; runbooks versioned in-repo.
- **Dangerous control mis-fires at national scale** (e.g., wrong slot extended, double refund) → idempotency, explicit scope confirmation, second-approver reason, reversible/compensating design, and PORTAL-04/06 idempotency for money paths.
- **Support over-exposure of PII / proctor data** → deny-by-default safe view, hard exclusions, separately-permissioned + reason-bound elevation, India residency, audited lookups.
- **Stale read-models drive a wrong decision** → "as-of" timestamps everywhere; critical calls cross-checked against PLAT-04 raw metrics; lag surfaced, never hidden.

---

## 13. Final Codex Augmentation — Ops Boundary Locked

- OPS-01 owns live exam-day command center and incident controls.
- ADMIN-06 owns business/content analytics and historical reporting; PLAT-04 owns telemetry/audit substrate.
- Cross-repo ops events graduating in v1: `OpsIncidentDeclared`, `OpsBannerChanged`, `OpsControlExecuted`.
- Any ops control that affects student experience must be audited, reversible where possible, scoped to exam/slot/cohort, and visible in portal/runtime status surfaces.
