# lemon-current-impl (bio-exam chunk)

Working exam-window runtime code from the Bharat Innovation Olympiad monolith (NestJS + Next.js), preserved here as the current implementation of this repo's function: attempt lifecycle, durable timer, and the exam player UI.

- `api/attempt`, `api/timer` - NestJS attempt + server-authoritative timer.
- `web/app/exams`, `web/hooks` - Next.js exam player pages + hooks (session, timer, socket, fullscreen, device check).

The target-stack port (Bun/Elysia/Drizzle, hexagonal) lands under `services/exam-api` via the workbench/ralph flow. See branch `lemon/exam-runtime-port` for the started port.
