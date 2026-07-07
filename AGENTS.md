# AGENTS.md — BIO consolidated workspace

## What this is

A single pnpm workspace mirroring the five-repo BIO system. Read `BIO-REPOS.md` and
`.bio-repos.json` before any cross-service change. PRD source of truth lives in
`ai/output/prds/`; agent working rules live in `ai/steering/` (golden principles, roles,
artifact templates).

## Stacks

- Backend services (`services/exam-api`, `services/admin-api`, `services/*-worker`):
  PNPM workspace, Bun/Elysia API, Drizzle Postgres, Redis, Biome, Lefthook, Bun test. Hexagonal.
- `services/portal-api`: Bun/Elysia API seam. `apps/{marketing,student-portal}-web`: Next.js App Router.
- `apps/{exam-web,admin-web}`: React + Vite.
- Shared: `packages/*` (`@bio/*`), consumed via `workspace:*`.

## Architecture

Hexagonal backend: `core` defines ports/services/domain/errors; `adapters` implement
HTTP (`in`) and persistence/cache (`out`); `infra` handles config/logging/shutdown. The
`core` layer imports nothing framework-specific — enforced by `pnpm boundaries`
(`services/exam-api` `lint:boundaries`). UI is feature-based.

## Agent rules

- Preserve service boundaries from `BIO-REPOS.md` / `docs/PRD-OWNERSHIP.md`.
- Use `@bio/domain-contracts` for cross-service DTOs/events; never hand-duplicate them.
- Never copy answer keys, payment secrets, or biometric-sensitive fields into the wrong service.
- `admin-api` owns answer keys + scoring; `exam-api` consumes key-stripped snapshots only.
- Proctoring stays in the current client-side face-api.js implementation (`frontend/`); do NOT
  build the Python `bio-proctor`.
- Prefer small ports/adapters/domain changes with tests and docs updates. Plan before code.
- `backend/`, `frontend/`, `admin-frontend/` are the legacy production apps — do not fold them
  into the workspace; migrate their behavior into `services/*` + `apps/*` PRD-by-PRD.

## Verification

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm test:contract
pnpm boundaries
pnpm verify
```
