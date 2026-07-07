# lemon-current-impl (bio-portal chunk)

Working student portal + commerce code from the monolith.

- `api/auth`, `api/user`, `api/slot`, `api/payment` - NestJS auth, profile, slot booking, Razorpay payments.
- `web` - the student Next.js app (landing, login, register, dashboard, profile, payment, results). Includes the exam-player pages, which are owned by bio-exam.

The target-stack port lands under `services/portal-api` + `apps/*` via the workbench/ralph flow.
