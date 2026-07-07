# lemon-current-impl (bio-admin chunk)

Working admin code from the monolith: exam authoring/question-bank/publishing/analytics (NestJS `exam` module) and the full admin console (Next.js `admin-frontend`).

- `api/exam` - NestJS authoring + analytics (owns answer keys).
- `web` - admin console (exams, questions, slots, payments, proctor, analytics, students).

The target-stack port lands under `services/admin-api` (+ workers) via the workbench/ralph flow.
