# Execution Sequence & Status — Final Golden PRDs

Rule: execute in dependency order. Parallelize only when the upstream contract gate is satisfied. Status values: `Not Started`, `In Progress`, `Blocked`, `Ready for Review`, `Done`.

| Seq | Wave | PRD(s) | Project(s) | Gate / exit criteria | Status |
|---:|---|---|---|---|---|
| 00 | Decision Gate | PLAT-01/02 final repo + contract distribution | all four | Four repos accepted; contract package/version strategy chosen; no bio-core target remains. | Not Started |
| 01 | P0 Foundation | PLAT-01 | all four | Repos scaffolded with CI, boundaries, env validation, health checks. | Not Started |
| 02 | P0 Foundation | PLAT-02 | all four | Contracts/events/auth-kit fixtures published and version-gated. | Not Started |
| 03 | P0 Foundation | PLAT-03 + PLAT-04 + PLAT-05 | all four | Infra, observability/audit, security baseline, secret scanning, threat gates pass. | Not Started |
| 04 | P1 Student/Auth | AUTH-01 + AUTH-02 + AUTH-03 + AUTH-05 | bio-portal + bio-admin + consumers | OTP/profile/consent/session model usable by portal; exam/proctor/admin can validate claims. | Not Started |
| 05 | P1 Admin Auth | AUTH-04 + ADMIN-05 | bio-admin | Invite-only admin auth/RBAC, no public role mutation, schools/cohorts governed. | Not Started |
| 06 | P2 Authoring | ADMIN-01 + ADMIN-02 | bio-admin | Approved question/paper versions with keys isolated and key-stripped preview tests. | Not Started |
| 07 | P2 Scheduling/Publish | ADMIN-03 + ADMIN-04 | bio-admin → bio-portal/bio-exam | Slot catalog and immutable exam snapshot publish/import fixtures pass. | Not Started |
| 08 | P3 Portal Discovery | PORTAL-01 + PORTAL-02 + PORTAL-08 | bio-portal | Marketing/discovery, live slot catalog, server-side price calculation. | Not Started |
| 09 | P3 Portal Commerce | PORTAL-03 + PORTAL-04 | bio-portal | Atomic seat holds, Razorpay orders/webhooks/reconciliation, no oversell. | Not Started |
| 10 | P3 Entitlement | PORTAL-05 + PORTAL-06 + PORTAL-07 | bio-portal → bio-exam | Confirm/admit/refund/cancel flows emit idempotent entitlement events. | Not Started |
| 11 | P4 Runtime Readiness | EXAM-00 + EXAM-01 + EXAM-02 + EXAM-06 | bio-exam + bio-proctor | Runtime handoff, readiness, entitlement start gate, SEB fail-closed. | Not Started |
| 12 | P4 Runtime Core | EXAM-03 + EXAM-04 + EXAM-05 | bio-exam | Autosave, durable timer, auto-submit, submission restart/retry tests. | Not Started |
| 13 | P5 Scoring/Results | SCORE-01 + SCORE-02 | bio-admin | Answer-key-isolated scoring, result release/ranking/certs, proctor holds respected. | Not Started |
| 14 | P6 Proctoring Core | PROCTOR-01 + PROCTOR-02 + PROCTOR-03 | bio-proctor + bio-exam | Enrollment, frame analysis, risk events; no raw frame storage in prod. | Not Started |
| 15 | P6 Proctor Review/Retention | PROCTOR-04 + PROCTOR-05 | bio-proctor + bio-admin | Review workflow and biometric deletion proof jobs pass. | Not Started |
| 16 | P7 Ops | ADMIN-06 + OPS-01 | bio-admin + all signals | Command center, dashboards, runbooks, incidents, audited controls. | Not Started |
| 17 | Release Gate | All P0/P1/P2/P3/P4 launch-critical PRDs | all four | Contract/e2e/load/recovery/security/compliance gates pass before first large exam. | Not Started |

## Spin-up / spin-down gates

- `bio-portal`: remains always-on.
- `bio-admin`: remains available for curation/support/results/ops; can scale low outside curation/result windows.
- `bio-exam`: scales from zero/low baseline only after published snapshot import, entitlement import, Redis/BullMQ health, DB readiness, SEB/proctor config, and load-test smoke pass. It scales down only after all attempts are submitted/exported, scoring jobs queued/acked, and audit/ops checks close.
- `bio-proctor`: scales for enrollment/check-in/exam frames and post-exam review. Retention/deletion workers must still run on schedule even when inference workers are downscaled.

## Weekly status-check template

```markdown
### Status check — Wave <seq> / <date>
- PRD(s):
- Current status:
- Gate evidence:
- Contract/event fixtures updated:
- Tests run:
- Security/DPDP checks:
- Open blockers:
- Next owner/action/date:
```
