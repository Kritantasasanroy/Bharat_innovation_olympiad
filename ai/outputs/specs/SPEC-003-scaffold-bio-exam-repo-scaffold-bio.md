---
id: SPEC-003
title: "Repo Scaffold: bio-exam"
status: approved
created: 2026-06-18
owner: amit-t
epic: EPIC-SCAFFOLD-bio-exam
prd: PRD-003
target_repos: [bio-exam, bio-contracts]
precision_mode: on
---

# SPEC-003: Repo Scaffold: bio-exam

## 1. Scope

Tied to PRD-003. Create the `bio-exam` exam-window runtime baseline so downstream EXAM PRDs add attempt, autosave, timer, submission, and lockdown behavior without reshaping the repo. Deliver `exam-web`, runtime API/gateway/worker boundaries, snapshot and entitlement consumers, contract clients, SEB/readiness adapters, observability/testkit, the required script and gate set, contract fixtures from `bio-contracts`, forbidden-field tests, and boundary rules. No readiness, attempt-lifecycle, player, timer, submission, lockdown, scoring, or proctoring behavior. No final attempt DB schema. Answer keys never stored or transported in the runtime scaffold.

## 2. Target repositories

| Repo | Role | Change summary |
|------|------|---------------|
| bio-exam | service | New repo skeleton: app shell, runtime service/gateway/worker boundaries, snapshot + entitlement consumers, contract clients, SEB/readiness adapters, fixtures, forbidden-field tests, boundary rules, fail-closed config. |
| bio-contracts | shared-lib | Consumed only. `domain-contracts`, `shared-types`, `auth-kit`, contract clients, and fixtures imported. No change authored here (defined in SPEC-001). |

## 3. Architecture impact

- **Services touched (new boundaries, internals empty):** `exam-api`, `exam-ws` or polling gateway, `exam-worker`, `timer-worker`, `snapshot-import-consumer`, `entitlement-consumer`.
- **Apps:** `exam-web` with readiness, attempt, player, and post-submit route placeholders.
- **Ports (hexagonal):**
  - Inbound: HTTP routes on `exam-api` (placeholders), WebSocket or polling gateway, event-consumer entrypoints (`snapshot-import-consumer`, `entitlement-consumer`), timer-worker scheduled entrypoint.
  - Outbound: `domain-contracts` imports, generated contract clients for slot-catalog/registration/entitlement seams, `auth-kit` entitlement and consent ports, SEB/readiness adapter ports, injected persistence, outbox writer for emitted runtime telemetry.
- **Cross-service contracts:** consumes `RegistrationConfirmed` (becomes `ExamRegistration`, gates attempt start), `RegistrationCancelled`, `ExamSnapshotPublished` (key-stripped), `ExamSlotRuntimeWindowChanged`, proctor signals; emits attempt/answer telemetry, submission, auto-submission, runtime integrity signals. All shapes from `domain-contracts`.
- **New components / module homes:** runtime domain, attempt gate, player/autosave, timer, submission, readiness, SEB, snapshot import, entitlement import, contract clients, observability/testkit.

## 4. API and contracts

Scaffold ships boundaries, placeholders, consumers, and adapters, not runtime behavior. Concrete routes, payloads, and numeric SLAs land in downstream EXAM SPECs.

### Inbound (placeholders, enumerated for boundary discipline)

| Surface | Method / trigger | Auth | Input schema | Errors |
|---------|------------------|------|--------------|--------|
| `exam-api` runtime routes | HTTP (placeholder) | `auth-kit`, entitlement-gated, deny-by-default | `domain-contracts` references, key-stripped | Canonical error codes from `shared-types`. |
| `exam-ws` / polling gateway | WS or HTTP poll (placeholder) | session token | runtime envelope | Reconnect/backoff owned by downstream EXAM PRD. |
| `snapshot-import-consumer` | event consume | service-internal | `ExamSnapshotPublished` | Missing/incompatible contract fails `test:contract`, blocks deploy. |
| `entitlement-consumer` | event consume | service-internal | `RegistrationConfirmed` | Missing/incompatible contract fails `test:contract`, blocks deploy. |

### Outbound

| Target | Protocol | Auth | Retry | Timeout | Fallback |
|--------|----------|------|-------|--------|----------|
| Outbox (attempt/answer telemetry, submission, integrity signals) | transactional outbox | service-internal | idempotent consumer checkpoint | n/a | Transport per PRD-001 section 14. |
| Contract clients (slot-catalog, registration/entitlement, proctor seams) | generated HTTP client | service token | downstream SPEC sets policy | downstream SPEC | Version gate blocks incompatible major. |
| SEB / readiness adapter | adapter port | vendor seam | downstream EXAM-06 owns policy | downstream | Adapter stays outside runtime domain. |

### Required gates (PRD-003 section 12)

`dev`, `build`, `typecheck`, `lint`, `format:check`, `test`, `test:contract`, `security:audit`, `boundaries`, secret scan, production env validation. Plus forbidden-field tests on student-facing contracts and fixtures.

## 5. Data model

### Schema changes

None. PRD-003 section 14 states no final attempt DB schema is defined by this scaffold. Module boundaries reserve homes for runtime domain, attempt gate, player/autosave, timer, submission, readiness, SEB, snapshot import, entitlement import, and observability/testkit. Attempt-state schema and its forward/rollback migration belong to the owning downstream EXAM SPEC.

### Cross-service contracts

Imported from `domain-contracts`. Snapshots are key-stripped: no `correctAnswer`, correct-option flag, or pre-release `explanation` may appear in any runtime contract or fixture. No handwritten duplicate DTOs.

### ERD

See ERD-003.

## 6. Rollout plan

- **Feature flag:** not applicable to scaffold-only work. Downstream EXAM PRDs own runtime flags.
- **Deploy order:** PRD-001 (bio-contracts) first, then this scaffold, then EXAM runtime feature PRDs.
- **Dark-launch:** production deployment allowed only as an inert baseline with routes disabled or non-public.
- **Backfill:** none.

## 7. Observability

- **Metrics:** CI gate status, boundary-violation count, contract-test failure count, missing-secret startup-failure count, forbidden-field test failure count, readiness health-check status.
- **Logs:** structured startup, config-validation, and consumer-checkpoint logs using the `shared-types` log envelope.
- **Traces:** trace envelope wired from `shared-types`; runtime spans added by downstream EXAM features.
- **Dashboards:** CI gate, boundary, and forbidden-field view, owned by PLAT-04; this scaffold emits the signals. Exam-window scaling dashboards belong to the owning EXAM SPEC.

## 8. Failure modes

| Failure | Blast radius | Detection | Mitigation |
|---------|--------------|-----------|------------|
| Answer key, correct-option flag, or pre-release explanation appears in a runtime contract or fixture | Exam integrity for every student | Forbidden-field test at scaffold level | Hard CI block; key-stripped contracts from SPEC-001 only. |
| Missing/incompatible `ExamSnapshotPublished` contract | snapshot import path | `test:contract` | Block deploy until contract matches. |
| Missing/incompatible `RegistrationConfirmed` to `ExamRegistration` contract | attempt-start gate | `test:contract` | Block deploy until contract matches. |
| Domain/core imports adapter, infra, vendor SDK, ORM row, or UI | Architecture integrity | `boundaries` gate | Block merge. |
| SEB/readiness adapter coupled into runtime domain | Lockdown maintainability | `boundaries` gate | Keep adapters outside runtime domain. |
| Production startup with missing secret | Service availability | Production env validation | Fail closed with a clear missing-config error. |

## 9. Rollback plan

Revert the scaffold package version or disable deployment of the inert baseline if CI, startup, or forbidden-field checks fail. No data migration involved; fully reversible.

## 10. Risks and open questions

- Runtime hot-path drift. Mitigation: entitlement and snapshot imports stay behind consumers and contract clients, never ad hoc JSON parsing.
- Exam-window instability. Mitigation: scaffold workers and health checks separately so downstream PRDs scale them around slots.
- Numeric p95 and scale targets are set by downstream EXAM SPECs once routes and workloads exist.

## 11. Dependencies

- **ADRs:** none. Event transport and contracts distribution are resolved in PRD-001; this scaffold consumes those decisions.
- **Other SPECs:** SPEC-001 (bio-contracts) must land first.
- **External teams:** security reviewers for key-stripping, entitlement gates, lockdown adapters, audit defaults.
- **Upstream PRDs:** PRD-001, PLAT-01, PLAT-03, PLAT-04, PLAT-05. Admin snapshot publication and portal registration/entitlement events become real inputs when their approved PRDs land.
