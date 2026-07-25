---
id: PRD-003
title: Repo Scaffold: bio-exam
status: approved
created: 2026-06-18
owner: amit-t
epic: EPIC-SCAFFOLD-bio-exam
epic_context_path: product/context-library/epics/EPIC-SCAFFOLD-bio-exam.md
source_prd_id: SCAFFOLD-bio-exam
source_path: repos/bio-contracts/ai/output/prds/REPO-SCAFFOLD-bio-exam.md
source_duplicate_paths: [repos/bio-exam/ai/output/prds/REPO-SCAFFOLD-bio-exam.md, repos/bio-contracts/ai/output/prds/REPO-SCAFFOLD-bio-exam.md]
source_dedupe_status: identical
source_primary_project: not specified
external_impacted: []
scope: service
target_repos: [bio-exam, bio-contracts]
precision_mode: on
grilled:
  date: 2026-06-18
  depth: deep
  passes:
    - mode: grill-me
      auto: true
      repo: null
      result: resolved
      open: 0
      parked: 0
      artifact: .grills/2026-06-18-1005-scaffold-prds-deep.md
---

# PRD-003: Repo Scaffold: bio-exam

## 1. Problem

`bio-exam` needs an exam-window runtime scaffold before attempt, autosave, timer, submission, and lockdown PRDs can land safely. The repo must spin up around exam slots, consume entitlement and exam snapshot contracts, protect against answer-key exposure, and keep runtime domain code separate from adapters, infra, vendor SDKs, ORM rows, and UI.

## 2. Goal

Create the `bio-exam` repo baseline with exam-web, runtime API/gateway/workers, snapshot and entitlement consumers, contract clients, readiness/SEB adapters, observability/testkit, required scripts, contract fixtures, and boundary gates. The scaffold must let downstream EXAM PRDs add runtime behavior without reshaping the repo.

## 3. Users and stakeholders

- Exam-runtime engineers building attempt start, player, autosave, timer, submission, and lockdown features.
- QA and integration engineers testing exam-window behavior and contract seams.
- Security reviewers checking key-stripping, entitlement gates, lockdown adapters, and audit defaults.
- Exam operations owners monitoring readiness during exam windows.

## 4. Acceptance criteria

- [ ] `exam-web` app scaffold exists with readiness, attempt, player, and post-submit route placeholders.
- [ ] Runtime service boundaries exist for `exam-api`, `exam-ws` or polling gateway, `exam-worker`, `timer-worker`, `snapshot-import-consumer`, and `entitlement-consumer`.
- [ ] Local modules exist for runtime domain, contract clients, SEB/readiness adapters, and observability/testkit.
- [ ] Required commands exist and pass locally or in CI: `dev`, `build`, `typecheck`, `lint`, `format:check`, `test`, `test:contract`, `security:audit`, and `boundaries`.
- [ ] Boundary checks prevent domain/core code importing adapters, infra, vendor SDKs, ORM rows, or UI.
- [ ] Cross-service payloads come from `domain-contracts`; no handwritten duplicate DTOs.
- [ ] Student-facing contracts and route placeholders never expose answer keys, correct-option flags, or explanations before result release.
- [ ] Production config fails closed on missing secrets or required provider credentials.
- [ ] Contract fixtures exist for every event consumed or emitted by the scaffolded repo boundary.
- [ ] Downstream EXAM PRDs are mapped to their owning app, service, worker, consumer, adapter, or local module.

## 5. Non-goals

- Implementing readiness checks, attempt lifecycle, player/autosave, timer, submission, SEB lockdown, scoring, or proctoring behavior.
- Defining final exam-attempt DB schemas.
- Building final exam UX screens beyond scaffold routes, state hooks, and design-system integration points.
- Storing or transporting answer keys in the runtime scaffold.
- Bypassing human approval before ralph planning or implementation.

## 6. Dependencies

- **Depends on:** PRD-001 contract package bridge and PLAT-01 repo scaffolding standards.
- **Platform dependencies:** PLAT-03 infrastructure, PLAT-04 observability/audit, and PLAT-05 security baseline.
- **Primary downstream PRDs:** EXAM-00 through EXAM-06.
- **Cross-repo dependencies:** PRD-001 for `domain-contracts`, `shared-types`, `auth-kit`, contract clients, and fixtures.
- **Producer dependencies:** admin snapshot publication and portal registration/entitlement events become real inputs when their approved PRDs land.
- **Sequencing decision:** run PRD-001 first, then this scaffold, then EXAM runtime feature PRDs.

## 7. Resolved questions for scaffold approval

No human direction is required for scaffold approval.

- **Owner:** `bio-exam` repo owner.
- **Cohort:** internal engineering and QA only until downstream EXAM PRDs pass.
- **Implementation sequence:** repo skeleton, scripts and gates, app/service/worker boundaries, consumers/adapters, contract fixtures, then downstream EXAM modules.
- **Design:** run `/design-draft` for downstream exam runtime workflows. This scaffold only needs route and state placeholders.

## 8. Risks

- **Answer-key exposure:** require key-stripped contracts from PRD-001 and add forbidden-field tests at scaffold level.
- **Runtime hot-path drift:** keep entitlement and snapshot imports behind consumers and contract clients, not ad hoc JSON parsing.
- **Exam-window instability:** scaffold workers and health checks separately so downstream PRDs can scale them around slots.
- **Boundary violations:** enforce `boundaries` gate before implementation PRs merge.
- **Lockdown adapter coupling:** keep SEB/readiness adapters outside runtime domain.

## 9. Metrics

- 100% of required commands exist and pass in CI for the scaffold.
- 0 boundary violations from domain/core into adapters, infra, vendor SDKs, ORM rows, or UI.
- 0 handwritten duplicate cross-service DTOs.
- 0 scaffold routes or fixtures expose answer keys, correct-option flags, or explanations before result release.
- 100% of declared consumed or emitted contract events have fixtures.
- All EXAM PRDs map to at least one app, service, worker, consumer, adapter, or module home.

## 10. NFRs

- **CI reliability:** required commands must be deterministic in local and CI environments.
- **Security:** deny-by-default access, key-stripped exam snapshots, entitlement-gated runtime seams, and fail-closed production config.
- **Data residency:** India data residency applies to student, exam, attempt, integrity, and proctor-adjacent runtime data.
- **Performance:** no endpoint p95 target is set at scaffold level. Downstream EXAM PRDs and the engineering spec set numeric targets once routes and workloads exist.
- **Scale:** scaffold must allow exam-window scale-up and scale-down of API, gateway, workers, timer worker, snapshot consumer, and entitlement consumer.
- **Test isolation:** unit and contract tests must not call external services unless the engineering spec explicitly defines a mocked adapter.

## 11. Rollout plan

- **Flag:** not applicable for scaffold-only work. Downstream EXAM PRDs own runtime flags.
- **Owner:** `bio-exam` repo owner. Release owner is named in the engineering spec.
- **Cohort:** engineering and QA in local/dev, then staging after CI gates pass.
- **Ramp:** no student-facing production ramp for scaffold-only work. Production deployment is allowed only as an inert baseline with routes disabled or non-public.
- **Monitoring:** CI gate status, boundary violations, contract-test failures, missing-secret startup failures, health checks, and forbidden-field test failures.
- **Rollback:** revert scaffold package version or disable deployment of the inert baseline if CI, startup, or forbidden-field checks fail.

## 12. Functional scope source mapping

- **Apps:** `exam-web`.
- **Services/workers:** `exam-api`, `exam-ws` or polling gateway, `exam-worker`, `timer-worker`, `snapshot-import-consumer`, `entitlement-consumer`.
- **Packages/local modules:** runtime domain, contract clients, SEB/readiness adapters, observability/testkit.
- **Primary PRD map:** EXAM-00 maps to readiness handoff surfaces; EXAM-01 maps to readiness and identity adapters; EXAM-02 maps to entitlement consumer and attempt gate; EXAM-03 maps to player/autosave modules; EXAM-04 maps to timer worker; EXAM-05 maps to submission and post-exam modules; EXAM-06 maps to SEB/readiness adapters.
- **Required gates:** `dev`, `build`, `typecheck`, `lint`, `format:check`, `test`, `test:contract`, `security:audit`, `boundaries`, secret scan, and production env validation.

## 13. Flows, states, edge cases

- **Scaffold flow:** create app shell, service/gateway/worker entrypoints, consumer entrypoints, module folders, shared config, script gates, test harness, contract fixtures, forbidden-field tests, and boundary rules.
- **Snapshot import edge:** missing or incompatible `ExamSnapshotPublished` contract fails contract tests and blocks deploy.
- **Entitlement edge:** missing or incompatible `RegistrationConfirmed` to `ExamRegistration` contract fails contract tests and blocks deploy.
- **Forbidden field edge:** any fixture or student-facing contract containing answer keys, correct-option flags, or explanations before result release fails tests.
- **Boundary edge:** a domain import from adapter, infra, vendor SDK, ORM row, or UI fails the `boundaries` gate.
- **Missing secret edge:** production startup fails closed with a clear missing-config error.

## 14. Data model and contracts

- No final attempt database schema is defined by this scaffold.
- Scaffolded module boundaries reserve homes for runtime domain, attempt gate, player/autosave, timer, submission, readiness, SEB, snapshot import, entitlement import, and observability/testkit.
- Cross-service contracts must be imported from `domain-contracts`.
- Contract fixtures represent events consumed or emitted by `bio-exam`, including `RegistrationConfirmed`, `RegistrationCancelled`, `ExamSnapshotPublished`, `ExamSlotRuntimeWindowChanged`, `ProctorSessionRequested`, `FrameAnalysisRequested`, `FaceEnrollmentCompleted`, `ProctorEventRaised`, `RiskScoreChanged`, attempt telemetry, answer-save telemetry, submission, auto-submission, and runtime integrity signals as downstream PRDs approve them.

## 15. Source and dedupe notes

- Canonical source: `repos/bio-contracts/ai/output/prds/REPO-SCAFFOLD-bio-exam.md`
- Source ID: `SCAFFOLD-bio-exam`
- Duplicate sources: `repos/bio-exam/ai/output/prds/REPO-SCAFFOLD-bio-exam.md`, `repos/bio-contracts/ai/output/prds/REPO-SCAFFOLD-bio-exam.md`
- Dedupe result: all duplicate source files are byte-identical
- External impacted services not registered in this workbench: none
