# exam-api — ported exam-runtime slice

This service is the `bio-exam` scaffold with the **exam-window runtime vertical slice**
ported from the legacy NestJS backend (`backend/src/attempt`, `backend/src/timer`) onto the
hexagonal Bun + Elysia + Drizzle stack.

## Use cases implemented

| PRD | Route | Flow |
|---|---|---|
| EXAM-02 | `POST /exams/:instanceId/start` | Entitlement gate (face enrollment + confirmed-slot window) → deterministic per-student question set → create/resume attempt |
| EXAM-03 | `POST /attempts/:id/answer` | Idempotent autosave (upsert) |
| EXAM-03 | `GET /attempts/:id` | Ownership-checked attempt + ordered items |
| EXAM-04 | `GET /attempts/:id/timer` | Server-authoritative remaining time (Redis deadline, recomputed from DB on miss); auto-submits on expiry |
| EXAM-05 | `POST /attempts/:id/submit` | Per-question-type scoring → finalize |

## Hexagonal map

```text
core/
  domain/     enums, models, scoring (pure), question-set (FNV-1a seeded, pure)
  errors/     DomainError hierarchy (+ Forbidden/Entitlement/FaceEnrollment/AttemptState)
  ports/in/   StartAttempt / SaveAnswer / SubmitAttempt / GetAttempt / GetTimer
  ports/out/  AttemptRepository, ExamSnapshotRepository, EntitlementGate, TimerStore, Clock, IdGenerator
  services/   AttemptService, TimerService (orchestrate ports only — no framework)
adapters/
  in/http/    auth.plugin (HS256 verify vs shared JWT_SECRET), attempt.routes, timer.routes
  out/persistence/  Drizzle schema + repositories + entitlement gate (shared Postgres)
  out/cache/  Redis client + durable TimerStore
infra/        config, logger, shutdown
container.ts  composition root (the only wiring of core -> adapters)
```

`core/**` imports no framework/adapter code — enforced by `pnpm --filter @bio/exam-api lint:boundaries`.

## Boundary rules honoured

- **Answer keys stay in the domain.** `ExamSnapshotRepository` returns `ScoredQuestion` (with
  `correctAnswer` / option `isCorrect`) used only for building the set and scoring; the HTTP layer
  only ever sees `QuestionView` (keys stripped by `toQuestionView`). `bio-admin` remains the owner
  of authoring/answer keys.
- Entitlements (slot booking / face enrollment) are read via the gate; `bio-portal` remains the
  owner of issuing them.

## Assumptions to confirm before running

1. **Shared DB, Prisma-default naming.** The Drizzle schema targets the existing tables
   (`"Attempt"`, `"AttemptItem"`, `"Question"`, …) with camelCase columns and enum types named
   after the enum. If production pinned `@db.Uuid`, change `text("id")` → `uuid("id")` in
   `src/adapters/out/persistence/schema/schema.ts`.
2. **JWT** is HS256 with `JWT_SECRET` shared with the NestJS backend; payload carries `sub` or `id`.
3. `DEMO_EXAM_IDS` (comma-separated) enables demo-exam unlimited-retake behaviour.

## Verify

```bash
# from the workspace root
pnpm install
pnpm --filter @bio/exam-api typecheck
pnpm --filter @bio/exam-api lint:boundaries
DATABASE_URL=... REDIS_URL=... JWT_SECRET=... pnpm --filter @bio/exam-api dev
```

## Not yet ported (follow-up passes)

Results/ranking (SCORE-02, currently in `getResults`), admin attempt report, SEB lockdown
(EXAM-06), device identity (EXAM-01), and a WS/SSE push channel for timer ticks (this slice uses
GET polling). The legacy `backend/` remains the production implementation until parity.
