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

## Render deployment (current account)

The production backend runs on the Render team **"bio"** (`tea-dain7gfqj5pc73aqjh3g`),
recreated 2026-09-14 from the suspended "sih" team's layout (see `.render-migration/`):

| Service | Id | URL |
| --- | --- | --- |
| `olympiad-backend` (NestJS, `backend/`) | `srv-dajv5d3m8hqs739re19g` | https://olympiad-backend-mok0.onrender.com |
| `bio-portal-api` (Bun/Elysia) | `srv-dajv5c942hec739188k0` | https://bio-portal-api-56ja.onrender.com |
| `bio-admin-api` (Bun/Elysia) | `srv-dajv5bh5efls73afduog` | https://bio-admin-api-myog.onrender.com |
| `bio-admin-redis` (free KV) | `red-dajv5alg1s2s73ca4nd0` | internal only |

All three are free-plan, region singapore, repo `Kritantasasanroy/Bharat_innovation_olympiad`
branch `main`, autoDeploy on. `olympiad-backend` runs `prisma db push` on boot and
health-checks at `/api/health`; the Elysia services expose `/health/live` and
`/health/ready`. Env vars (Neon `DATABASE_URL`, Razorpay, WATI, Cloudinary, …)
were copied verbatim from the previous account; `REDIS_URL` and `ADMIN_API_URL`
point at the new in-account resources. `render.yaml` at the repo root is an
aspirational blueprint (exam-api + workers) that is **not** deployed anywhere yet.

The four Vercel frontends (student, admin, school, partner) were repointed to the
new URLs on 2026-09-14 (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`,
`NEXT_PUBLIC_PORTAL_API_URL`) and redeployed; their baked bundles reference the
new backend with no stale references. Custom domains (www / school /
partner.innovationolympiad.in) serve the same deployments.

