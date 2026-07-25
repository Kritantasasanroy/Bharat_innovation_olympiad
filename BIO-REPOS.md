# BIO Repository Map (consolidated workspace)

This repo is a **single pnpm workspace** that mirrors the five-repo BIO system from
`https://github.com/bharat-innovation-olympiad`. Treat each area as a service with its own
deploy/release boundary even though they live in one workspace.

## Org repo → workspace path mapping

| Org repo | Responsibility | Workspace paths |
|---|---|---|
| `bio-contracts` | Shared contracts: domain contracts, auth-kit, shared types, UI kit, fixtures | `packages/{domain-contracts,shared-types,auth-kit,ui-kit,contract-fixtures}` |
| `bio-exam` | Exam-window runtime: entitlement gate, player, autosave, durable timer, submission, SEB | `services/exam-api`, `apps/exam-web`, `packages/exam-*` |
| `bio-admin` | Trusted admin: curation, scheduling, publishing, scoring, results, analytics, ops | `services/{admin-api,*-worker}`, `apps/admin-web`, `packages/admin-*` |
| `bio-portal` | Always-on student portal: marketing, auth, booking, payments, entitlement, admit/results | `services/portal-api`, `apps/{marketing-web,student-portal-web}`, `packages/portal-*` |
| `bio-proctor` | Proctoring: face enrollment, frame analysis, risk, review, biometric retention | **Not ported.** Kept as existing client-side face-api.js in `frontend/` |

Package folders are named after the `@bio/*` package name minus the `@bio/` prefix
(e.g. `@bio/exam-shared-types` → `packages/exam-shared-types`), so distinct names never collide.

## Legacy (pre-workspace) apps — kept until parity, then retired

`backend/` (NestJS + Prisma), `frontend/` (Next.js student), `admin-frontend/` (Next.js admin)
remain on their own npm toolchains and are **excluded** from the pnpm workspace globs. They are
the current production implementation; the `services/*` + `apps/*` above progressively replace
them PRD-by-PRD.

## Cross-repo rules (unchanged from org)

- Cross-service DTOs/events come from `packages/domain-contracts` (`@bio/domain-contracts`), never duplicated by hand.
- `admin-api` owns answer keys and scoring. `exam-api` consumes only key-stripped snapshots.
- `portal-api` owns paid registration/entitlement issuance. `exam-api` consumes entitlements for attempt start.
- Proctoring owns biometric data and risk/report events (currently the face-api.js client).
- PRD source of truth: `ai/output/prds/` (the golden PRD set copied from `bio-po`).

## Stacks

- `exam-api`, `admin-api`, workers: Bun + Elysia + Drizzle + Redis, hexagonal (`core`/`adapters`/`infra`).
- `portal-api`: Bun/Elysia API seam; `apps/{marketing,student-portal}-web`: Next.js App Router.
- `apps/{exam-web,admin-web}`: React + Vite.
- Tooling everywhere: pnpm, Biome, Lefthook, TypeScript strict.
