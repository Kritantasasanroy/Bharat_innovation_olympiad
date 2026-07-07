# bio-repos-mirror

A mirror of the whole Bharat Innovation Olympiad project, split into functional chunks the way the
org's 9 repos are (`github.com/bharat-innovation-olympiad`). Each subfolder holds the current working
implementation of that repo's function, distributed from this monolith. This is additive and for
reference; the canonical copies live in the org repos and in this repo's `backend/`, `frontend/`,
`admin-frontend/`, and the `services/`+`packages/`+`apps/` workspace.

## The 9 repos and what each owns

| Repo | Function | Mirrored here | Live branch in the org repo |
|---|---|---|---|
| `bio-exam` | Exam-window runtime: attempt, timer, exam player | `bio-exam/lemon-current-impl/` | `lemon/current-impl` (chunk) + `lemon/exam-runtime-port` (target-stack port) |
| `bio-admin` | Authoring, scoring, analytics, admin console | `bio-admin/lemon-current-impl/` | `lemon/current-impl` |
| `bio-portal` | Auth, booking, payments, student app | `bio-portal/lemon-current-impl/` | `lemon/current-impl` |
| `bio-contracts` | Shared platform, data model, types | `bio-contracts/lemon-current-impl/` | `lemon/current-impl` |
| `bio-proctor` | Proctoring (face-api.js client + NestJS module) | `bio-proctor/lemon-current-impl/` | `lemon/current-proctor-implementation` |
| `workbench-bio-exam-admin` | Specs (exam/admin/contracts) | `workbench-bio-exam-admin/eng-artifacts/` (SPEC/TDD/ERD-004) | `exam-02-eng-artifacts` |
| `workbench-bio-portal` | Specs (portal) | reference only (planning repo, no code chunk) | - |
| `bio-po` | Golden PRDs (read-only) | reference only (source of truth PRDs) | - |
| `Bharat_innovation_olympiad` | The whole project | this repo (monolith + workspace + this mirror) | `bio-workspace-rearch` |

## Two tracks

1. **Distribute now (this mirror + the `lemon/current-impl` branches):** the real working code of each
   function, preserved in its repo, so all repos together contain the entire project.
2. **Port over time:** each chunk is rewritten to the org's target stack (Bun/Elysia/Drizzle hexagonal
   for exam/admin/portal, Python for proctor, shared `@bio/*` packages for contracts) via the workbench
   PRD to eng-spec to ralph flow. The exam-runtime slice is already ported under `services/exam-api`.

Nothing here is deleted from any repo; every push is an additive branch.
