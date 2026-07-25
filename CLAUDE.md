# Bharat Innovation Olympiad - Claude Code Configuration
This file contains development commands, coding style guidelines, and token utilization strategies for this project.
## Development Commands
### Startup & Services
There is no local Postgres — the app connects directly to a shared Neon Postgres DB via `DATABASE_URL`. `docker-compose.yml` only runs Redis + the three app services; Postgres is not one of them.
* **Docker Compose (Redis + apps only):** `docker-compose up -d`
* **Stop Docker Services:** `docker-compose down`
* **Required env files (not committed):** `backend/.env` (`DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`, `RAZORPAY_*` — `PaymentService` fails to boot without at least dummy Razorpay values), `frontend/.env.local` (`NEXT_PUBLIC_API_URL=http://localhost:4000`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_NEON_AUTH_URL` for student OTP login/registration). admin-frontend needs no `.env` — it defaults `NEXT_PUBLIC_API_URL` to `localhost:4000`.
### Frontend (admin-frontend or frontend)
* **Install Dependencies:** `cd frontend && npm install` or `cd admin-frontend && npm install`
* **Run in Dev Mode:** `npm run dev`
* **Build App:** `npm run build`
* **Start Production App:** `npm run start`
### Backend
* **Install Dependencies:** `cd backend && npm install`
* **Sync Database Schema:** `cd backend && npx prisma db push` — this project has no `prisma/migrations/` history, so use `db push`, not `migrate dev`. (`migrate dev` refuses to run non-interactively on Prisma 5.22+ and will error with "environment is non-interactive.")
* **Run Backend (Dev):** `npm run start:dev`
* **Build Backend:** `npm run build`
* **Start Backend (Prod):** `npm run start:prod`
## Coding Style & Standards
* **Frameworks:** React, Next.js (TypeScript). admin-frontend has no Tailwind config — style admin-frontend pages with the existing CSS-variable/`glass-card` design system (see any page under `admin-frontend/src/app/`), not Tailwind utility classes, or they'll render unstyled.
* **Formatting:** Prettier/ESLint default configs. Keep code files modular and fully typed.
* **Database:** Prisma ORM with PostgreSQL (Neon-hosted, shared between local dev and whatever else points at the same `DATABASE_URL`). Always verify models before assuming a field exists.
* **Proctoring:** Client-side only via face-api.js (`frontend/src/hooks/useFaceProctor.ts`) — no Python proctor-service, no Meazure/ProctorU. Model weights live in `frontend/public/models/`; the face-recognition model needs **two** shard files (shard1 + shard2), not one — check a model's `-weights_manifest.json` `paths` array before assuming a single shard is enough.
## Token Utilization Strategy & Custom Skill
This workspace is integrated with the `savethetokens` custom skill to optimize context window size and reduce cost.
### Activation & Guidelines
1. **Always Use the Skill:** When performing large edits, debugging sessions, or running benchmarks, refer to the custom skill:
   `savethetokens` (loaded automatically by description or invoked on demand).
2. **Session Hygiene:** Keep conversations task-scoped. Run `/clear` frequently between separate tasks to purge stale context.
3. **Compaction:** Run `/compact` manually before reaching 80% context capacity. Create a checkpoint file describing files modified and next steps before compacting.
4. **Lean Communication:** Prefer concise updates. Avoid printing massive logs or raw command outputs directly into the chat.

## Integrated Design Skills & Custom Commands
This repository has integrated top-tier design guidelines to ensure visual excellence and technical correctness in our frontends.

### Integrated Skills
1. **`frontend-design`** ([SKILL.md](file:///d:/lemon%20ideas%20work%20stuff/bharat%20Innovation%20Olympiad/.claude/skills/frontend-design/SKILL.md)): Aesthetic guidance for visual excellence. Creates premium typography, gradients, layouts, and animations, avoiding generic "AI slop" styles.
2. **`web-design-guidelines`** ([SKILL.md](file:///d:/lemon%20ideas%20work%20stuff/bharat%20Innovation%20Olympiad/.claude/skills/web-design-guidelines/SKILL.md)): Compliance checks for technical design quality (accessibility, keyboard navigation, focus states, inputs, animations, performance).

### Custom Slash Commands
You can run these commands directly inside your Claude Code session:
* **`/project:beautify <path-to-file>`**: Upgrades a component or page to a high-end, premium aesthetic.
* **`/project:design-audit <path-to-file-or-dir>`**: Audits the specified frontend files against Vercel's Web Interface Guidelines.

## BIO pnpm Workspace (re-architecture to match the org repos)
This repo now also contains a **pnpm workspace** that mirrors the five-repo BIO system at
`github.com/bharat-innovation-olympiad` (`bio-contracts`, `bio-exam`, `bio-admin`, `bio-portal`, `bio-proctor`).

* **Read first:** `AGENTS.md`, then `BIO-REPOS.md` before any cross-service work. PRD source of truth is `ai/output/prds/`; agent working rules are in `ai/steering/`.
* **Layout:** `packages/*` (shared `@bio/*` contracts), `services/*` (Bun/Elysia + Drizzle, hexagonal `core`/`adapters`/`infra`), `apps/*` (Vite/React + Next.js). Folder = package name minus `@bio/`.
* **Stack (new services):** Bun, Elysia, Drizzle ORM, Redis (ioredis), pino, zod, Biome (tabs, width 100, double quotes), Lefthook, `tsc`/`bun test`. **Not** NestJS/Prisma/ESLint.
* **Boundaries:** `services/*/src/core` must not import framework/adapter code — enforced by `pnpm boundaries`.
* **Legacy vs new:** `backend/` (NestJS+Prisma), `frontend/`, `admin-frontend/` are the **current production** apps and stay on npm — excluded from the workspace. New `services/*`/`apps/*` replace them PRD-by-PRD; retire a legacy app only once its replacement is at parity.
* **Proctoring exception:** stays as the current client-side face-api.js implementation in `frontend/`. Do **not** build the Python `bio-proctor`.
* **Verify workspace:** `pnpm install && pnpm verify` (typecheck + lint + test + contract + boundaries).

