# Bharat Innovation Olympiad — Complete Technical Documentation

> Last updated: June 2026 (media questions · question pool system · S3 service)  
> Stack: NestJS · Next.js · PostgreSQL (Neon) · Redis · Socket.IO · Python FastAPI · Razorpay · AWS S3 · Vercel · Render  
> Architecture reference: `prd-reference/docs/all-prds-re-arch-pass-2/` — bio-core · bio-portal · bio-proctor

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Structure](#2-repository-structure)
3. [Architecture Diagram](#3-architecture-diagram)
4. [Environment Variables](#4-environment-variables)
5. [Database Schema](#5-database-schema)
6. [Backend — NestJS API](#6-backend--nestjs-api)
7. [WebSocket Gateway](#7-websocket-gateway)
8. [Python Proctor Service](#8-python-proctor-service)
9. [Student Frontend](#9-student-frontend)
10. [Admin Frontend](#10-admin-frontend)
11. [Frontend Hooks](#11-frontend-hooks)
12. [Authentication Flow](#12-authentication-flow)
13. [Exam Flow End-to-End](#13-exam-flow-end-to-end)
14. [Proctoring System](#14-proctoring-system)
15. [Deployment](#15-deployment)

---

## 1. Project Overview

Bharat Innovation Olympiad is a **national online competitive examination platform** for Indian school students (classes 6–12). It provides:

- Secure fullscreen exam delivery with anti-cheat enforcement
- Real-time server-authoritative countdown timer via WebSocket
- Webcam-based AI proctoring (face detection via ONNX model)
- Admin portal for exam/question bank management and analytics
- Student portal for registration, exam-taking, and results

**Current scale:** Designed for individual use; AWS migration required before 5,000 concurrent users.

---

## 2. Repository Structure

```
bharat Innovation Olympiad/
│
├── backend/                        # NestJS REST API + WebSocket
│   ├── prisma/
│   │   ├── schema.prisma           # Single source of truth for DB schema
│   │   └── migrations/             # All Prisma migration files (auto-generated)
│   ├── scripts/
│   │   ├── seed-admin.js           # Seeds the ADMIN user from env vars
│   │   └── seed-schools.js         # Seeds Indian schools into School table
│   ├── src/
│   │   ├── main.ts                 # App entry point (port 4000)
│   │   ├── bootstrap.ts            # CORS, validation pipe, helmet setup
│   │   ├── app.module.ts           # Root module — imports all feature modules
│   │   ├── health.controller.ts    # GET /health — uptime probe
│   │   │
│   │   ├── auth/                   # Authentication module
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts  # POST /auth/admin-login, /auth/sync, /auth/login-sync, GET/PUT /auth/me
│   │   │   ├── auth.service.ts     # syncUser, loginSync, getOrCreateAdmin, updateProfile
│   │   │   ├── dto/auth.dto.ts     # SyncUserDto, LoginSyncDto, UpdateProfileDto
│   │   │   └── strategies/
│   │   │       └── jwt.strategy.ts # Passport JWT strategy — validates Bearer tokens
│   │   │
│   │   ├── user/                   # User profile module
│   │   │   ├── user.module.ts
│   │   │   ├── user.controller.ts  # GET/PUT /users/profile
│   │   │   └── user.service.ts     # findById, updateProfile
│   │   │
│   │   ├── exam/                   # Exam + Question Bank module
│   │   │   ├── exam.module.ts
│   │   │   ├── exam.controller.ts  # All /exams and /admin/exams routes
│   │   │   └── exam.service.ts     # Full CRUD + analytics + question bank
│   │   │
│   │   ├── attempt/                # Exam attempt module
│   │   │   ├── attempt.module.ts
│   │   │   ├── attempt.controller.ts # POST start/answer/submit, GET results/report
│   │   │   └── attempt.service.ts  # startAttempt (slot-gated), saveAnswer, submitAttempt, scoring
│   │   │
│   │   ├── slot/                   # Slot booking module
│   │   │   ├── slot.module.ts
│   │   │   ├── slot.controller.ts  # GET /slots, POST /slots/:id/book, admin CRUD
│   │   │   ├── slot.service.ts     # createSlot, listSlots, bookSlot ($transaction), cancelBooking
│   │   │   └── dto/slot.dto.ts     # CreateSlotDto, BookSlotDto
│   │   │
│   │   ├── exam/
│   │   │   ├── seb-config.service.ts # ★ SEB config generation (PRD EXAM-06)
│   │   │
│   │   ├── common/
│   │   │   ├── guards/
│   │   │   │   ├── seb.guard.ts    # ★ SEB HMAC validation (PRD EXAM-06)
│   │   │   ├── services/
│   │   │   │   ├── s3.service.ts   # ★ AWS S3 — presigned PUT/GET URLs, uploadBuffer, deleteObject
│   │   │   │   └── s3.module.ts    # ★ @Global() module — S3Service injected anywhere
│   │   │
│   │   ├── payment/                # Razorpay payment module
│   │   │   ├── payment.module.ts
│   │   │   ├── payment.controller.ts # POST create-order, verify, webhook; coupon CRUD
│   │   │   └── payment.service.ts  # createOrder, verifyWebhookSignature, handleWebhookEvent
│   │   │
│   │   ├── proctor/                # AI Proctoring module
│   │   │   ├── proctor.module.ts
│   │   │   ├── proctor.controller.ts # POST analyze-frame, enroll, events; GET report
│   │   │   └── proctor.service.ts  # analyzeFrame, enrollFace, createEvent, getReport
│   │   │
│   │   ├── timer/                  # Real-time timer module
│   │   │   ├── timer.module.ts
│   │   │   ├── timer.gateway.ts    # WebSocket gateway (Socket.IO)
│   │   │   └── timer.service.ts    # Server-authoritative countdown + auto-submit
│   │   │
│   │   ├── prisma/                 # Prisma singleton
│   │   │   ├── prisma.module.ts    # Global module — injected everywhere
│   │   │   └── prisma.service.ts   # Extends PrismaClient, handles onModuleInit/Destroy
│   │   │
│   │   └── common/
│   │       ├── decorators/
│   │       │   ├── current-user.decorator.ts  # @CurrentUser() — extracts from JWT payload
│   │       │   └── roles.decorator.ts         # @Roles(Role.ADMIN) metadata decorator
│   │       ├── guards/
│   │       │   ├── jwt-auth.guard.ts           # Extends AuthGuard('jwt') — validates Bearer token
│   │       │   └── roles.guard.ts              # Reads @Roles() metadata, checks user.role
│   │       ├── interceptors/
│   │       │   └── audit-log.interceptor.ts    # Writes every mutating request to AuditLog table
│   │       └── demo-exams.ts                   # Sample exam seed data
│   │
│   ├── .env                        # Runtime environment variables (never committed)
│   ├── .env.example                # Template for env vars
│   ├── nest-cli.json
│   ├── tsconfig.json               # strict: true
│   └── package.json
│
├── frontend/                       # Student-facing Next.js app (port 3000)
│   └── src/
│       ├── app/
│       │   ├── layout.tsx          # Root layout — ThemeProvider + fonts
│       │   ├── page.tsx            # Landing page
│       │   ├── globals.css         # Global CSS variables + design tokens
│       │   ├── login/page.tsx      # Neon Auth OTP login
│       │   ├── register/page.tsx   # Registration — calls POST /auth/sync
│       │   ├── dashboard/page.tsx  # Student dashboard — exam list + results summary
│       │   ├── profile/page.tsx    # Profile view/edit
│       │   ├── exams/page.tsx      # Available exams list
│       │   ├── exams/[id]/
│       │   │   ├── instructions/page.tsx  # Pre-exam instructions + "Start Exam" button
│       │   │   ├── slots/page.tsx         # Slot selection grid + booking flow
│       │   │   └── play/page.tsx          # MAIN EXAM PLAYER — fullscreen + timer + proctoring
│       │   ├── payment/
│       │   │   ├── [bookingId]/page.tsx   # Razorpay checkout — coupon + payment modal
│       │   │   └── success/page.tsx       # Post-payment confirmation screen
│       │   ├── results/page.tsx    # Post-exam results view
│       │   └── api/                # Next.js route handlers — use Prisma directly
│       │       ├── auth/login/route.ts
│       │       ├── auth/me/route.ts
│       │       ├── auth/refresh/route.ts
│       │       ├── exams/route.ts
│       │       ├── exams/upcoming/route.ts
│       │       ├── exams/[id]/route.ts
│       │       ├── exams/[id]/start/route.ts
│       │       ├── attempts/recent/route.ts
│       │       ├── attempts/results/route.ts
│       │       ├── attempts/[id]/answer/route.ts
│       │       ├── attempts/[id]/submit/route.ts
│       │       ├── slots/route.ts                    # GET slots by examId/instanceId
│       │       ├── slots/[id]/book/route.ts          # POST atomic slot booking ($transaction)
│       │       ├── bookings/me/route.ts              # GET user's active booking for exam
│       │       ├── bookings/[id]/route.ts            # GET booking by id (ownership check)
│       │       ├── bookings/[id]/cancel/route.ts     # POST cancel booking + decrement
│       │       ├── payments/create-order/route.ts    # POST create Razorpay order (idempotent)
│       │       ├── payments/verify/route.ts          # POST HMAC verify + confirm booking
│       │       ├── payments/webhook/route.ts         # POST Razorpay webhook (raw body)
│       │       ├── payments/my-payments/route.ts     # GET payment history
│       │       ├── coupons/validate/route.ts         # GET validate coupon code
│       │       ├── admin/exams/[id]/sections/route.ts
│       │       ├── admin/questions/[id]/route.ts
│       │       └── admin/sections/[id]/questions/route.ts
│       ├── components/
│       │   ├── layout/
│       │   │   ├── AuthGuard.tsx   # Wraps pages — redirects if not authenticated or wrong role
│       │   │   └── Navbar.tsx      # Top navigation bar
│       │   └── ThemeProvider.tsx   # Dark/light mode context
│       ├── hooks/                  # See Section 11
│       ├── lib/
│       │   ├── api.ts              # Axios instance — baseURL + JWT interceptor + refresh logic
│       │   └── constants.ts        # TIMER_WARNING_THRESHOLD, TIMER_DANGER_THRESHOLD
│       ├── store/
│       │   └── examStore.ts        # Zustand store — exam session state
│       └── types/
│           └── exam.ts             # TypeScript types for Exam, Attempt, Question, etc.
│
├── admin-frontend/                 # Admin-facing Next.js app (port 3001)
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx            # Redirects to /dashboard
│       │   ├── login/page.tsx      # Admin login — calls POST /auth/admin-login
│       │   ├── dashboard/page.tsx  # Stats overview — exams, students, attempts + quick actions
│       │   ├── exams/page.tsx      # Exam list + create/edit/delete + question bank
│       │   ├── questions/page.tsx  # Global question bank management
│       │   ├── slots/page.tsx      # ★ Slot management — create/edit/delete slots + view bookings per slot
│       │   ├── payments/page.tsx   # ★ Payments dashboard — revenue summary, transactions, refunds, coupon CRUD
│       │   ├── analytics/
│       │   │   ├── page.tsx        # Exam analytics — score distribution, completion rate
│       │   │   └── attempt/[attemptId]/page.tsx  # Per-student attempt detail + proctor events
│       │   └── unauthorized/page.tsx
│       ├── components/
│       │   ├── layout/AuthGuard.tsx
│       │   ├── layout/Navbar.tsx
│       │   └── ThemeProvider.tsx
│       ├── hooks/
│       ├── lib/
│       ├── store/
│       └── types/
│
├── proctor-service/                # Python FastAPI AI proctoring service
│   ├── main.py                     # FastAPI app — /analyze, /enroll, /health
│   └── requirements.txt            # fastapi, uvicorn, onnxruntime, numpy, Pillow, sqlalchemy
│
├── docker-compose.yml              # Local dev: PostgreSQL (5432) + Redis (6379)
├── render.yaml                     # Render.com deployment config for backend
├── CLAUDE.md                       # Claude Code project instructions
├── DOCUMENTATION.md                # ← this file
└── ROADMAP_CHECKLIST.md            # Upcoming tasks checklist
```

---

## 3. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTS                               │
│                                                              │
│  ┌──────────────────┐        ┌──────────────────────────┐   │
│  │  Student Browser  │        │     Admin Browser         │   │
│  │  (Next.js :3000)  │        │  (Next.js :3001)          │   │
│  └────────┬─────────┘        └──────────┬───────────────┘   │
└───────────┼──────────────────────────────┼───────────────────┘
            │ HTTPS REST + WebSocket        │ HTTPS REST
            ▼                              ▼
┌───────────────────────────────────────────────────────────────┐
│                  NestJS Backend (:4000)                        │
│                                                               │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │  Auth   │  │   Exam   │  │ Attempt  │  │   Proctor   │  │
│  │ Module  │  │  Module  │  │  Module  │  │   Module    │  │
│  └────┬────┘  └────┬─────┘  └────┬─────┘  └──────┬──────┘  │
│       │             │              │                │          │
│  ┌────┴─────────────┴──────────────┴────────────────┴──────┐ │
│  │                    PrismaService                          │ │
│  └─────────────────────────┬────────────────────────────────┘ │
│                             │                                  │
│  ┌──────────────────────────┼────────────────────────────┐   │
│  │  Timer Module (WebSocket) │                            │   │
│  │  TimerGateway (Socket.IO) │                            │   │
│  └───────────────────────────────────────────────────────┘   │
└───────────────────────────┬───────────────────────────────────┘
                            │
            ┌───────────────┴──────────────┐
            ▼                              ▼
┌───────────────────┐          ┌──────────────────────┐
│  PostgreSQL (Neon) │          │    Redis (Docker/     │
│  Primary DB        │          │    ElastiCache)       │
│                    │          │    Timer state cache  │
└───────────────────┘          └──────────────────────┘
            │
            ▼
┌───────────────────┐
│  Python Proctor   │
│  Service (:5000)  │
│  FastAPI + ONNX   │
└───────────────────┘
```

**Data flow during an exam:**
```
Student Browser
  → POST /exams/:instanceId/start      → creates Attempt row
  → WS join-exam (attemptId)           → starts server timer
  ← WS timer-tick (every second)       → updates countdown UI
  → POST /attempts/:id/answer          → saves answer to AttemptItem
  → POST /proctor/analyze-frame        → sends webcam snapshot
  → POST /proctor/events               → logs fullscreen/tab violations
  → POST /attempts/:id/submit          → scores + marks SUBMITTED
  ← WS timer-expired                   → triggers auto-submit
```

---

## 4. Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | Neon PostgreSQL pooled connection string | `postgresql://user:pass@host/db?pgbouncer=true` |
| `DIRECT_URL` | Neon direct connection (for migrations) | `postgresql://user:pass@host/db` |
| `JWT_SECRET` | HS256 signing key for access tokens | 64-char hex string |
| `JWT_REFRESH_SECRET` | Signing key for refresh tokens | 64-char hex string |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `ADMIN_EMAIL` | Hardcoded admin account email | `admin@olympiad.in` |
| `ADMIN_PASSWORD` | Hardcoded admin password | strong password |
| `FRONTEND_URL` | Student frontend origin (CORS) | `https://exam.bharatolympiad.in` |
| `ADMIN_FRONTEND_URL` | Admin frontend origin (CORS) | `https://admin.bharatolympiad.in` |
| `ALLOWED_ORIGINS` | Comma-separated additional CORS origins | — |
| `PROCTOR_SERVICE_URL` | Python proctor service URL | `http://localhost:5000` |
| `PROCTOR_API_KEY` | Shared secret for proctor service auth | random string |
| `PORT` | Backend listen port | `4000` |
| `RAZORPAY_KEY_ID` | Razorpay API key ID (test: `rzp_test_...`) | from Razorpay dashboard |
| `RAZORPAY_KEY_SECRET` | Razorpay API key secret | from Razorpay dashboard |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook signing secret | from Razorpay dashboard |
| `AWS_REGION` | AWS region for S3 and other services | `ap-south-1` |
| `AWS_ACCESS_KEY_ID` | IAM access key ID | from AWS console |
| `AWS_SECRET_ACCESS_KEY` | IAM secret access key | from AWS console |
| `AWS_S3_BUCKET` | S3 bucket name | `bio-olympiad-prod` |

### Student Frontend (`frontend/.env`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend base URL e.g. `https://api.bharatolympiad.in` |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL e.g. `wss://api.bharatolympiad.in` |
| `DATABASE_URL` | Neon PostgreSQL connection string (used by Next.js API routes via Prisma) |
| `JWT_SECRET` | Same secret as backend — used to verify tokens in Next.js API routes |
| `RAZORPAY_KEY_ID` | Razorpay key ID — also passed to client as `key` in order response |
| `RAZORPAY_KEY_SECRET` | Razorpay key secret — used server-side only for HMAC verification |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook signing secret — used in `/api/payments/webhook` |

### Admin Frontend (`admin-frontend/.env`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Same backend base URL |
| `NEXT_PUBLIC_WS_URL` | Same WebSocket URL |

---

## 5. Database Schema

### Models

#### `User`
Primary account table for all user types.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Auto-generated |
| `email` | String UNIQUE | Login identifier |
| `passwordHash` | String? | Null for OTP-only accounts |
| `firstName` | String | — |
| `lastName` | String | — |
| `role` | Enum Role | STUDENT / PARENT / ADMIN / SUPER_ADMIN |
| `classBand` | Int? | School class (6–12) — used to filter relevant exams |
| `schoolId` | FK → School? | Optional school linkage |
| `faceEmbedding` | Bytes? | Stored face vector from proctor enrollment |
| `profileImageUrl` | String? | URL of profile photo |
| `isActive` | Boolean | Soft-delete flag |
| `createdAt` | DateTime | — |
| `updatedAt` | DateTime | Auto-updated |

**Relations:** `bookings[]` (Booking), `payments[]` (Payment)  
**Indexes:** `email`, `schoolId`, `role`

---

#### `School`
Registry of Indian schools.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `name` | String | Full school name |
| `code` | String UNIQUE | Short code for lookup |
| `city` | String | — |
| `state` | String | — |
| `createdAt` | DateTime | — |

**Indexes:** `code`

---

#### `Exam`
Master exam definition (not tied to a specific date/time).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `title` | String | — |
| `description` | String? | — |
| `classBands` | Int[] | Which classes can take this exam |
| `totalMarks` | Int | Sum of all question marks |
| `durationMinutes` | Int | Exam duration |
| `isPublished` | Boolean | False = draft, True = visible to students |
| `isResultReleased` | Boolean | Controls result visibility |
| `feeAmount` | Int? | Registration fee **in paise** (null or 0 = free exam) |

**Relations:** `sections[]` (ExamSection), `instances[]` (ExamInstance)

---

#### `ExamSection`
Logical sections within an exam (e.g. Physics, Chemistry, Math).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `examId` | FK → Exam | — |
| `title` | String | Section name |
| `sortOrder` | Int | Display order |
| `questionsToAssign` | Int | Questions each student receives from this section's pool (0 = all) |

**Relations:** `sectionQuestions[]` (SectionQuestion)

---

#### `Question`
Global question bank — questions exist independently of exams.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `type` | Enum QuestionType | MCQ / MULTI_SELECT / TRUE_FALSE / SHORT_ANSWER / NUMERIC |
| `difficulty` | Enum Difficulty | EASY / MEDIUM / HARD |
| `text` | String | Question body |
| `options` | Json? | Array of `{id, text}` objects |
| `correctAnswer` | String? | Option id of correct answer |
| `marks` | Int | Points for correct answer (default 1) |
| `negativeMarks` | Float | Deduction for wrong answer (default 0) |
| `timeLimitSecs` | Int? | Per-question time limit if set |
| `mediaUrl` | String? | S3 URL or public URL of attached media (image/video/audio) |
| `mediaType` | Enum MediaType? | `IMAGE` / `VIDEO` / `AUDIO` / `DIAGRAM` |
| `tags` | String[] | Searchable tags |
| `explanation` | String? | Post-exam explanation text |

---

#### `SectionQuestion`
Junction table linking Questions to ExamSections (many-to-many).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `sectionId` | FK → ExamSection | — |
| `questionId` | FK → Question | — |
| `sortOrder` | Int | Display order within section |

**Unique constraint:** `(sectionId, questionId)` — same question cannot appear twice in a section.

---

#### `ExamInstance`
A scheduled occurrence of an exam (specific start/end time window).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `examId` | FK → Exam | Parent exam |
| `startsAt` | DateTime | When students can enter |
| `endsAt` | DateTime | Hard cutoff — auto-submits remaining |
| `requireSeb` | Boolean | Safe Exam Browser enforcement flag |
| `browserExamKey` | String? | SEB config hash |
| `configKey` | String? | SEB config key |
| `quitUrl` | String? | SEB quit URL |
| `maxAttempts` | Int | Max attempts per student (default 1) |

**Relations:** `slots[]` (ExamSlot)

---

#### `ExamSlot`
A time window within an ExamInstance that students can book.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `examInstanceId` | FK → ExamInstance | Parent instance |
| `label` | String? | Human-readable label e.g. "Morning Batch" |
| `startsAt` | DateTime | Slot start time |
| `endsAt` | DateTime | Slot end time |
| `capacity` | Int | Max students allowed in this slot |
| `booked` | Int | Current booking count (default 0, incremented atomically) |

**Relations:** `bookings[]` (Booking)

---

#### `Booking`
A student's reservation for a specific ExamSlot.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `userId` | FK → User | Student who booked |
| `slotId` | FK → ExamSlot | Which slot was booked |
| `paymentId` | FK → Payment? | Linked payment (null for free exams) |
| `status` | Enum BookingStatus | PENDING / CONFIRMED / CANCELLED |
| `createdAt` | DateTime | — |

**Unique constraint:** `(userId, slotId)` — one booking per student per slot.  
**Note:** PENDING = paid exam awaiting payment; CONFIRMED = active (free exam or payment received); CANCELLED = refunded or cancelled.

---

#### `Payment`
Razorpay payment record linked to a booking.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `userId` | FK → User | — |
| `razorpayOrderId` | String UNIQUE | Order ID from `razorpay.orders.create()` |
| `razorpayPaymentId` | String? UNIQUE | Payment ID after checkout success |
| `razorpaySignature` | String? | HMAC signature stored for audit |
| `amount` | Int | Amount charged **in paise** |
| `currency` | String | Always `INR` |
| `status` | Enum PaymentStatus | CREATED / PAID / FAILED / REFUNDED |
| `couponId` | FK → Coupon? | Applied coupon (if any) |
| `createdAt` | DateTime | — |

---

#### `Coupon`
Discount codes for exam fee reduction.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `code` | String UNIQUE | Promo code (case-sensitive) |
| `discountPct` | Int | Percentage discount (1–100) |
| `maxUses` | Int | Total allowed uses |
| `usedCount` | Int | Times applied so far (default 0) |
| `expiresAt` | DateTime? | Optional expiry |

---

#### `Attempt`
One student's attempt at one ExamInstance.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `userId` | FK → User | — |
| `examInstanceId` | FK → ExamInstance | — |
| `status` | Enum AttemptStatus | NOT_STARTED / IN_PROGRESS / SUBMITTED / AUTO_SUBMITTED / EXPIRED |
| `startedAt` | DateTime? | Set on first answer/start |
| `submittedAt` | DateTime? | Set on submit |
| `totalScore` | Float? | Calculated on submit |
| `maxScore` | Float? | Max possible score |
| `ipAddress` | String? | Logged at start |
| `deviceFingerprint` | String? | Browser fingerprint |
| `riskScore` | Float | Proctor risk score (0–100) |

**Unique constraint:** `(userId, examInstanceId)` — one attempt per student per instance.

---

#### `AttemptItem`
Individual question response within an attempt.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `attemptId` | FK → Attempt | — |
| `questionId` | FK → Question | — |
| `answer` | Json? | Selected option id |
| `isCorrect` | Boolean? | Computed on submit |
| `score` | Float? | Marks awarded |
| `answeredAt` | DateTime? | Timestamp of last answer |

**Unique constraint:** `(attemptId, questionId)` — one response per question per attempt.  
**Used for:** answer restoration on page refresh (frontend reads `attempt.items` on load).

---

#### `ProctorEvent`
Timestamped proctoring violation/event log.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `attemptId` | FK → Attempt | — |
| `type` | Enum ProctorEventType | See enum below |
| `severity` | Int | 1 = low, 2 = medium, 3 = high |
| `details` | Json? | Extra data (violationCount, source, etc.) |
| `timestamp` | DateTime | Event time |

**ProctorEventType values:**  
`NO_FACE` `MULTIPLE_FACES` `FACE_MISMATCH` `TAB_SWITCH` `EXIT_FULLSCREEN` `SCREEN_CAPTURE` `NETWORK_DISCONNECT` `IP_CHANGE`

---

#### `AuditLog`
Immutable log of all admin/mutating API actions.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `userId` | String? | Who performed the action |
| `action` | String | e.g. `CREATE`, `UPDATE`, `DELETE` |
| `resource` | String | e.g. `exam`, `question`, `attempt` |
| `details` | Json? | Request body snapshot |
| `ipAddress` | String? | Requester IP |
| `createdAt` | DateTime | — |

---

#### `RefreshToken`
Stores issued refresh tokens for rotation.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | — |
| `token` | String UNIQUE | Hashed refresh token |
| `userId` | FK → User | — |
| `expiresAt` | DateTime | TTL |

---

### Enums

```
Role:             STUDENT | PARENT | ADMIN | SUPER_ADMIN
QuestionType:     MCQ | MULTI_SELECT | TRUE_FALSE | SHORT_ANSWER | NUMERIC
Difficulty:       EASY | MEDIUM | HARD
MediaType:        IMAGE | VIDEO | AUDIO | DIAGRAM
AttemptStatus:    NOT_STARTED | IN_PROGRESS | SUBMITTED | AUTO_SUBMITTED | EXPIRED
ProctorEventType: NO_FACE | MULTIPLE_FACES | FACE_MISMATCH | TAB_SWITCH |
                  EXIT_FULLSCREEN | SCREEN_CAPTURE | NETWORK_DISCONNECT | SEB_VIOLATION | IP_CHANGE
BookingStatus:    PENDING | CONFIRMED | CANCELLED
PaymentStatus:    CREATED | PAID | FAILED | REFUNDED
```

---

## 6. Backend — NestJS API

**Base URL:** `https://api.bharatolympiad.in` (prod) / `http://localhost:4000` (dev)  
**Auth:** Bearer JWT in `Authorization` header for all protected routes.  
**Global interceptor:** `AuditLogInterceptor` — logs all POST/PUT/PATCH/DELETE to `AuditLog` table.

---

### Auth Routes (`/auth`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/admin-login` | Public | Admin login with hardcoded email/password → returns JWT |
| POST | `/auth/sync` | Public | Called after Neon OTP registration → creates User → returns JWT |
| POST | `/auth/login-sync` | Public | Called after Neon OTP login → looks up User → returns JWT |
| GET | `/auth/me` | JWT | Returns current user profile |
| PUT | `/auth/me` | JWT | Updates firstName, lastName, classBand |
| GET | `/auth/admin/users` | JWT + ADMIN | Returns all students with their exam scores |

**Request body — `POST /auth/sync`:**
```json
{
  "email": "student@example.com",
  "firstName": "Arjun",
  "lastName": "Sharma",
  "classBand": 10,
  "schoolCode": "DPS001"
}
```

**Response — all auth routes return:**
```json
{
  "accessToken": "<jwt>",
  "user": { "id": "...", "email": "...", "role": "STUDENT", ... }
}
```

---

### User Routes (`/users`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users/profile` | JWT | Get own user profile |
| PUT | `/users/profile` | JWT | Update firstName, lastName |

---

### Exam Routes (Student)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/exams` | JWT | List published exams matching student's classBand |
| GET | `/exams/upcoming` | JWT | Same as /exams (alias) |
| GET | `/exams/:id` | JWT | Get exam with sections + shuffled questions (shuffled for STUDENT role) |

**Note on `/exams/:id`:** When called by a STUDENT, `shuffleUserId` is passed to `exam.service.findExamById()` which shuffles question order using the userId as seed — ensuring the student sees a consistent (but student-specific) order.

---

### Admin Exam Routes (`/admin/exams`)

All require `JWT + ADMIN or SUPER_ADMIN role`.

| Method | Path | Description |
|---|---|---|
| GET | `/admin/exams` | List all exams (published + drafts) |
| POST | `/admin/exams` | Create exam |
| PUT | `/admin/exams/:id` | Update exam metadata |
| DELETE | `/admin/exams/:id` | Delete exam |
| POST | `/admin/exams/:id/publish` | Toggle isPublished = true |
| POST | `/admin/exams/:id/release-question-paper` | — |
| POST | `/admin/exams/:id/release-results` | Toggle isResultReleased = true |
| GET | `/admin/exams/:id/analytics` | Score distribution, completion rate, top scorers |
| GET | `/admin/exams/:id/instances` | List all instances of an exam |
| POST | `/admin/exams/:id/instances` | Create exam instance (schedule) |
| PUT | `/admin/instances/:id` | Update instance timing |
| DELETE | `/admin/instances/:id` | Delete instance |

**Create exam body:**
```json
{
  "title": "National Science Olympiad 2026",
  "description": "...",
  "classBands": [9, 10, 11, 12],
  "totalMarks": 100,
  "durationMinutes": 90
}
```

**Create instance body:**
```json
{
  "startsAt": "2026-06-15T09:00:00Z",
  "endsAt": "2026-06-15T10:30:00Z",
  "requireSeb": false,
  "maxAttempts": 1
}
```

---

### Admin Section Routes (`/admin/sections`)

All require `JWT + ADMIN`.

| Method | Path | Description |
|---|---|---|
| POST | `/admin/exams/:id/sections` | Create section in exam |
| PUT | `/admin/sections/:id` | Update section title/order |
| DELETE | `/admin/sections/:id` | Delete section + all its questions |
| GET | `/admin/sections/:id/questions` | List questions in section |
| POST | `/admin/sections/:id/questions` | Create new question directly in section |
| POST | `/admin/sections/:id/questions/bulk` | Bulk create questions in section |
| POST | `/admin/sections/:id/questions/attach` | Attach existing bank question to section |
| DELETE | `/admin/sections/:sectionId/questions/:questionId` | Detach question from section |
| PUT | `/admin/sections/:sectionId/questions/:questionId` | Reorder question within section |
| POST | `/admin/sections/:sectionId/questions/:questionId/move` | Move question to different section |

---

### Admin Question Bank Routes (`/admin/questions`)

| Method | Path | Description |
|---|---|---|
| GET | `/admin/questions` | Search global bank (`?q=keyword&difficulty=EASY&examId=`) |
| GET | `/admin/questions/media-upload-url` | Get presigned S3 PUT URL for question media upload |
| POST | `/admin/questions` | Create standalone bank question |
| POST | `/admin/questions/bulk` | Bulk create bank questions |
| PUT | `/admin/questions/:id` | Update question |
| DELETE | `/admin/questions/:id` | Delete question from bank |

**`GET /admin/questions/media-upload-url?filename=diagram.png&contentType=image/png` response:**
```json
{
  "uploadUrl": "https://bio-olympiad-prod.s3.ap-south-1.amazonaws.com/questions/uuid/diagram.png?X-Amz-...",
  "publicUrl": "https://bio-olympiad-prod.s3.ap-south-1.amazonaws.com/questions/uuid/diagram.png",
  "key": "questions/uuid/diagram.png"
}
```

**Workflow:** Admin calls `GET media-upload-url` → uploads file directly to S3 via `uploadUrl` → stores `publicUrl` as `mediaUrl` on the question body sent to `POST /admin/questions`.

**Question body (with optional media):**
```json
{
  "type": "MCQ",
  "difficulty": "MEDIUM",
  "text": "What is the speed of light?",
  "mediaUrl": "https://bio-olympiad-prod.s3.ap-south-1.amazonaws.com/questions/uuid/diagram.png",
  "mediaType": "IMAGE",
  "options": [
    {"id": "a", "text": "3×10⁸ m/s"},
    {"id": "b", "text": "3×10⁶ m/s"},
    {"id": "c", "text": "3×10¹⁰ m/s"},
    {"id": "d", "text": "3×10⁴ m/s"}
  ],
  "correctAnswer": "a",
  "marks": 2,
  "negativeMarks": 0.5,
  "tags": ["physics", "optics"],
  "explanation": "Speed of light in vacuum is approximately 3×10⁸ m/s"
}
```

**Supported `mediaType` values:** `IMAGE` · `VIDEO` · `AUDIO` · `DIAGRAM`

The student exam player renders each type automatically:
- `IMAGE` / `DIAGRAM` → `<img>` tag, max 400px height
- `VIDEO` → `<video controls>`, max 400px height
- `AUDIO` → `<audio controls>`, full width

---

### Attempt Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/exams/:instanceId/start` | JWT | Create/resume attempt for this instance |
| POST | `/attempts/:id/answer` | JWT | Save/update answer for a question |
| POST | `/attempts/:id/submit` | JWT | Submit exam → calculate score |
| GET | `/attempts/results` | JWT | All submitted attempts for current user |
| GET | `/attempts/recent` | JWT | Recent attempts (dashboard widget) |
| GET | `/attempts/:id` | JWT | Get full attempt with items |
| GET | `/admin/attempts/:id/report` | JWT + ADMIN | Detailed attempt report for admin |

**`POST /exams/:instanceId/start` response:**
```json
{
  "attempt": {
    "id": "attempt-uuid",
    "status": "IN_PROGRESS",
    "startedAt": "...",
    "items": [
      { "questionId": "q-uuid", "answer": null, "answeredAt": null }
    ]
  },
  "exam": { ... },
  "questions": [ ... ]
}
```

**`POST /attempts/:id/answer` body:**
```json
{ "questionId": "q-uuid", "answer": "option-id-a" }
```

**`POST /attempts/:id/submit` response:**
```json
{
  "attempt": { "status": "SUBMITTED", "totalScore": 72, "maxScore": 100 },
  "redirectUrl": "/results"
}
```

**Scoring strategies (PRD SCORE-01):**

| QuestionType | Correct condition | Score | Wrong score |
|---|---|---|---|
| `MCQ` | Selected option has `isCorrect: true` | `marks` | `-negativeMarks` |
| `TRUE_FALSE` | Answer matches `correctAnswer` string | `marks` | `-negativeMarks` |
| `MULTI_SELECT` | All correct options selected, no extras | `marks` | `-negativeMarks` |
| `SHORT_ANSWER` | Case-insensitive string match on `correctAnswer` | `marks` | `0` |
| `NUMERIC` | `abs(submitted - correctAnswer) ≤ tolerance` | `marks` | `0` |

---

### Question Pool System

Each `ExamSection` contains a **pool** of questions (e.g. 100). The field `questionsToAssign` (default 0 = all) controls how many each student receives from that pool (e.g. 50).

**Selection algorithm (`AttemptService.buildQuestionSet`):**

1. **Difficulty-bucket selection** — from the section pool, shuffle each bucket (EASY / MEDIUM / HARD) independently using a deterministic `FNV-1a + xorshift32` PRNG seeded with `userId:examId:sectionId:[e|m|h]`. Pick `easyPct%`, `mediumPct%`, `hardPct%` of `questionsToAssign` from each bucket.
2. **Deficit fill** — if any bucket is undersized (fewer questions than the percentage requires), the shortfall is filled from the remaining pool using a `seed:fill` shuffle.
3. **Cross-section order shuffle** — after assembling all sections, the final list is shuffled with seed `userId:examId:order`, ensuring no two students share the same question ordering even if they received identical subsets.
4. **Stability** — the resulting ordered list is pre-persisted as `AttemptItem` rows with `sortOrder`. All subsequent page refreshes read these rows — the question set never changes after attempt start.

**Properties:**
- Same student → identical subset on every resume (deterministic by userId + examId)
- Different students → statistically unique subsets from the same pool
- No two students share question order, even for identical subsets
- Question-bank edits after attempt start do not affect the student's assigned set

**Admin setup:**
```
POST /admin/exams/:id/sections  { title, sortOrder, questionsToAssign: 50 }
POST /admin/sections/:id/questions  ← add all 100 pool questions here
PUT  /admin/exams/:id           { easyPct: 30, mediumPct: 50, hardPct: 20 }
```

---

### Proctor Routes (`/proctor`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/proctor/analyze-frame` | JWT | Upload webcam frame (multipart) → face analysis |
| POST | `/proctor/enroll` | JWT | Enroll face for identity verification |
| POST | `/proctor/events` | JWT | Log client-side event (tab switch, fullscreen exit) |
| GET | `/proctor/report/:attemptId` | JWT + ADMIN | Full proctor event timeline |
| GET | `/proctor/health` | JWT | Service health check |

**`POST /proctor/events` body:**
```json
{
  "attemptId": "attempt-uuid",
  "type": "EXIT_FULLSCREEN",
  "details": { "violationCount": 1, "source": "exit_fullscreen" }
}
```

---

### SEB Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/seb/config/:instanceId` | Public | Download SEB JSON config for this instance (SEB fetches this before auth) |
| GET | `/seb/launch/:instanceId` | JWT + ADMIN | Returns `seb://` deep-link URL for QR-code distribution |

**SEB Guard (`SebGuard`):** Applied to `POST /exams/:instanceId/start`. For instances with `requireSeb = true`, validates:
1. `User-Agent` contains `SEB/` identifier
2. `x-safeexambrowser-requesthash` header matches `SHA-256(fullUrl + browserExamKey)`
3. `x-safeexambrowser-configkeyhash` header matches `SHA-256(fullUrl + configKey)` (if configKey set)

Instances with `requireSeb = false` pass through unchecked — no change to existing exam behavior.

---

### Slot Routes

Student slot endpoints require `JWT`. Admin slot endpoints require `JWT + ADMIN`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/slots` | JWT | List slots (`?examInstanceId=` or `?examId=`) |
| POST | `/slots/:id/book` | JWT | Atomically book a slot — checks capacity in `$transaction` |
| DELETE | `/bookings/:id` | JWT | Cancel own booking + decrement slot counter |
| GET | `/bookings/me` | JWT | Get own active booking for an exam (`?examId=`) |
| POST | `/admin/slots` | JWT + ADMIN | Create a new slot for an instance |
| PUT | `/admin/slots/:id` | JWT + ADMIN | Update slot label/timing/capacity |
| DELETE | `/admin/slots/:id` | JWT + ADMIN | Delete slot |
| GET | `/admin/slots` | JWT + ADMIN | List all slots (`?examInstanceId=`) |
| GET | `/admin/slots/:id/bookings` | JWT + ADMIN | List all bookings for a slot |

**`POST /slots/:id/book` response:**
```json
{
  "booking": { "id": "...", "status": "PENDING", "slot": { ... } },
  "requiresPayment": true,
  "amount": 50000
}
```
Free exams return `"status": "CONFIRMED"` and `"requiresPayment": false`.

**`POST /admin/slots` body:**
```json
{
  "examInstanceId": "instance-uuid",
  "startsAt": "2026-07-01T09:00:00Z",
  "endsAt": "2026-07-01T11:30:00Z",
  "capacity": 200,
  "label": "Morning Batch"
}
```

---

### Payment Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/payments/create-order` | JWT | Create Razorpay order for a booking (idempotent) |
| POST | `/payments/verify` | JWT | Verify Razorpay signature — marks Payment PAID + Booking CONFIRMED |
| POST | `/payments/webhook` | Public | Razorpay webhook — HMAC verified, handles captured/failed/refund events |
| GET | `/payments/my-payments` | JWT | Payment history for current user |
| GET | `/admin/payments` | JWT + ADMIN | All payments with booking details |
| POST | `/admin/payments/:id/refund` | JWT + ADMIN | Initiate Razorpay refund |
| POST | `/admin/coupons` | JWT + ADMIN | Create coupon code |
| GET | `/admin/coupons` | JWT + ADMIN | List all coupons |
| PUT | `/admin/coupons/:id` | JWT + ADMIN | Update coupon |
| DELETE | `/admin/coupons/:id` | JWT + ADMIN | Delete coupon |

**`POST /payments/create-order` body:**
```json
{ "bookingId": "booking-uuid", "couponCode": "OLYMPIAD20" }
```

**`POST /payments/create-order` response:**
```json
{
  "orderId": "order_XXXXXXXXXXXXXXXX",
  "amount": 40000,
  "currency": "INR",
  "key": "rzp_test_...",
  "bookingId": "booking-uuid",
  "paymentId": "internal-payment-uuid"
}
```

**`POST /payments/verify` body:**
```json
{
  "razorpayOrderId": "order_...",
  "razorpayPaymentId": "pay_...",
  "razorpaySignature": "hmac-hex-string"
}
```

**Webhook flow:** Razorpay sends raw JSON to `/payments/webhook`. The handler verifies the `x-razorpay-signature` header via HMAC-SHA256 using `RAZORPAY_WEBHOOK_SECRET`. Handles events:
- `payment.captured` → Payment.status = PAID, Booking.status = CONFIRMED
- `payment.failed` → Payment.status = FAILED
- `refund.processed` → Payment.status = REFUNDED

**Important — raw body requirement:** The NestJS `main.ts` registers `express.raw({ type: 'application/json' })` middleware on `/payments/webhook` **before** the global JSON parser, so Razorpay's raw body is available for HMAC computation.

---

### Health Route

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | Public | Returns `{ status: "ok" }` |

---

## 7. WebSocket Gateway

**URL:** `wss://api.bharatolympiad.in` (same host as REST API)  
**Library:** Socket.IO  
**Auth:** JWT token passed in `handshake.auth.token` on connection.

### Connection

```javascript
// Client-side (useSocket.ts)
const socket = io(NEXT_PUBLIC_WS_URL, {
  auth: { token: accessToken }
});
```

### Events

**Client → Server:**

| Event | Payload | Description |
|---|---|---|
| `join-exam` | `{ attemptId: string }` | Join attempt room + start server-side timer |
| `heartbeat` | `{ attemptId: string }` | Keep-alive ping (records timestamp) |
| `leave-exam` | `{ attemptId: string }` | Leave room + stop timer |

**Server → Client:**

| Event | Payload | Description |
|---|---|---|
| `timer-tick` | `{ remaining: number }` | Countdown in seconds, emitted every second |
| `timer-expired` | `{}` | Timer hit zero — client must call submit |

### Timer Logic (TimerService)

- On `join-exam`, server reads attempt `startedAt` and `exam.durationMinutes` from DB.
- Calculates `remaining = (startedAt + durationMinutes*60) - now` in seconds.
- Starts `setInterval(1000)` emitting `timer-tick` to `attempt:<attemptId>` room.
- On expiry, calls `attemptService.autoSubmit()` directly then emits `timer-expired`.
- Timer persists even if client disconnects — reconnecting client gets correct remaining time.
- Redis used to store `timerStart` so timer survives backend restarts.

---

## 8. Python Proctor Service

**Location:** `proctor-service/`  
**URL:** `http://localhost:5000` (dev) / configured via `PROCTOR_SERVICE_URL`  
**Framework:** FastAPI + Uvicorn  
**AI:** ONNX Runtime for face detection model

### Routes

| Method | Path | Description |
|---|---|---|
| POST | `/analyze` | Accepts image buffer → detects faces → returns count + embedding |
| POST | `/enroll` | Accepts image → stores face embedding for user |
| GET | `/health` | Service health check |

**Note:** The NestJS `ProctorService` calls this service internally via HTTP. Frontend never calls the proctor service directly.

### Face Detection Flow
1. Student's webcam snapshot sent to `POST /proctor/analyze-frame` (NestJS)
2. NestJS ProctorService forwards image buffer to Python service `POST /analyze`
3. ONNX model detects faces and returns count
4. NestJS creates `ProctorEvent` based on result (NO_FACE, MULTIPLE_FACES)
5. Risk score on Attempt updated

---

## 9. Student Frontend

### Key Pages

#### `/exams/[id]/slots` — Slot Selection
The entry point for paid exams. Shows a grid of available time slots with seat availability indicators (green/amber/red based on capacity).

**Key behavior:**
- Loads slots via `GET /api/slots?examId=` and existing booking via `GET /api/bookings/me?examId=` in parallel
- If student already has a booking: shows banner with "Go to Instructions" (CONFIRMED) or "Complete Payment" (PENDING) CTA
- On clicking a slot: calls `POST /api/slots/:id/book`
- Free exams (amount = 0): booking immediately CONFIRMED → redirects to `/exams/:id/instructions`
- Paid exams: booking set to PENDING → redirects to `/payment/:bookingId`

---

#### `/payment/[bookingId]` — Razorpay Checkout
Handles the payment step for paid slot bookings.

**Key behavior:**
- Loads booking details via `GET /api/bookings/:bookingId`
- Optional coupon input: calls `GET /api/coupons/validate?code=` → shows discount amount
- On "Pay Now": calls `POST /api/payments/create-order` → gets `{ orderId, amount, key }`
- Opens `window.Razorpay` modal (loaded via `next/script` from `checkout.razorpay.com`)
- On checkout success: calls `POST /api/payments/verify` → on success navigates to `/payment/success?bookingId=`
- Idempotent: refreshing the page does not create duplicate Razorpay orders

---

#### `/payment/success` — Payment Confirmation
Post-payment success screen with booking details. Uses `useSearchParams()` wrapped in `<Suspense>` to read `?bookingId=` param. Provides "Go to Exam Instructions" and "Back to Dashboard" buttons.

---

#### `/exams/[id]/play` — Exam Player
The most complex page. Orchestrates:
- **`useExamSession`** — loads exam + attempt, manages answers state
- **`useFullscreenMonitor`** — enforces fullscreen, counts violations
- **`useTimer`** — subscribes to WebSocket timer ticks
- **`useWebcam`** — captures webcam frames, sends to proctoring
- **Zustand `examStore`** — persists exam session state across renders

**Fullscreen gate overlay:** Shown on load and after each violation. Student must click "Enter Fullscreen" before interacting with exam. After 3 violations, exam auto-submits.

**Slot gate:** `startAttempt()` in the backend checks for a CONFIRMED booking within the current slot's time window before allowing exam entry. If no slots exist for the instance, the gate is bypassed (backward-compatible with existing exams).

#### `/register` — Registration
1. Student enters email → Neon Auth sends OTP
2. Student verifies OTP → Neon Auth confirms ownership
3. Frontend calls `POST /auth/sync` with email + profile data
4. Backend creates User → returns JWT → stored in localStorage

#### `/login` — Login
1. Student enters email → Neon Auth OTP
2. Frontend calls `POST /auth/login-sync`
3. Backend looks up user → returns JWT

### Zustand Store (`examStore.ts`)

```typescript
// Key state
exam: Exam | null
attempt: Attempt | null
questions: Question[]
currentIndex: number
answers: Record<string, any>     // questionId → selectedOptionId
flagged: Set<string>              // questionIds marked for review
remaining: number                 // seconds (from WebSocket)
isExpired: boolean

// Key actions
setExamSession(exam, attempt, questions)  // restores answers from attempt.items on refresh
saveAnswer(questionId, answer)
toggleFlag(questionId)
submitExam()
```

### API Client (`lib/api.ts`)

- Axios instance with `baseURL = NEXT_PUBLIC_API_URL`
- Request interceptor: attaches `Authorization: Bearer <token>` from localStorage
- Response interceptor: on 401, attempts token refresh via `POST /auth/refresh`, retries original request

---

## 10. Admin Frontend

### Key Pages

#### `/exams` — Exam Management
- Full CRUD for exams
- Exam instance (schedule) management
- Section management with drag-reorder
- Question bank: create, bulk import (JSON), attach from bank, edit, delete
- Publish/unpublish toggle
- Release results toggle

#### `/slots` — Slot Management ★ NEW
- Lists all exam slots grouped by exam title
- Filter by exam dropdown
- Per-slot: label, start/end time, capacity/booked progress bar, instance window
- Create slot: select exam → select instance → fill label/times/capacity
- Edit slot: update timing/capacity/label via `PUT /admin/slots/:id`
- Delete slot (blocked if any bookings exist)
- View bookings per slot: modal table with student name, email, booking status, payment amount

#### `/payments` — Payments & Revenue ★ NEW
- Revenue summary cards: total revenue (₹), paid count, pending count, refunded count
- Transactions table: student, exam/slot, amount, status badge, coupon applied, order ID, date
- Search by student name/email/exam title/order ID
- Status filter (Paid / Pending / Failed / Refunded)
- Refund button with confirmation → calls `POST /admin/payments/:id/refund`
- Coupon management section:
  - List all coupons with code, discount %, used/max progress bar, expiry, active/expired/exhausted status
  - Create coupon modal (code, discount %, max uses, optional expiry)

#### `/analytics` — Exam Analytics
- Score distribution chart (Recharts)
- Completion rate
- Average score
- Top performers table
- Per-attempt detail view with proctor event timeline

#### `/questions` — Global Question Bank
- Search by text, difficulty
- Create/edit/delete questions
- View which exams use each question

### Auth (Admin)
- Login calls `POST /auth/admin-login` with hardcoded credentials from env
- JWT stored in `js-cookie` (httpOnly not possible from Next.js client)
- `AuthGuard` component redirects to `/login` if no token or wrong role

---

## 11. Frontend Hooks

### `useFullscreenMonitor.ts`
Enforces fullscreen during exam. **Critical security component.**

**Module-level state (survives re-mounts):**
```typescript
let _violationLocked = false;    // Lock preventing duplicate violation events
let _lockTimer: ReturnType<typeof setTimeout> | null = null;
const LOCK_MS = 5000;            // 5s cooldown absorbs all duplicate browser events
```

**Key behavior:**
- On mount: attempts auto-fullscreen
- `acquireViolationLock()`: only first event in 5s window registers a violation
- `registerViolation()`: increments count → gates exam → starts 20s auto-submit timer
- `requestFullscreen()`: if already in fullscreen (Windows key case) → un-gates directly without API call
- `releaseViolationLock()`: called on fullscreen re-entry → allows next violation to count fresh
- Violations persisted to `sessionStorage` keyed by URL path → survive page refresh
- 3 violations → `onAutoSubmit` called → exam submitted

**Events monitored:** `fullscreenchange`, `webkitfullscreenchange`, `mozfullscreenchange`, `MSFullscreenChange`, `visibilitychange`, `window.blur`

---

### `useTimer.ts`
Subscribes to WebSocket timer ticks.

```typescript
// Connects to WS, joins exam room, updates examStore.remaining every second
useTimer(attemptId: string) → { remaining: number }
```

---

### `useWebcam.ts`
Manages webcam stream and proctoring snapshots.

```typescript
useWebcam(attemptId: string) → { videoRef, canvasRef, startWebcam, startProctoring }
```

- `startWebcam()`: requests `navigator.mediaDevices.getUserMedia({ video: true })`
- `startProctoring()`: starts interval — every 30s captures canvas frame → `POST /proctor/analyze-frame`

---

### `useExamSession.ts`
Orchestrates the full exam session lifecycle.

```typescript
useExamSession(examId: string) → {
  exam, attempt, questions, currentIndex, currentQuestion,
  answers, flagged, error,
  startExam, saveAnswer, submitExam,
  goToQuestion, nextQuestion, prevQuestion, toggleFlag
}
```

- `startExam()`: calls `POST /exams/:instanceId/start` → populates Zustand store
- `saveAnswer()`: calls `POST /attempts/:id/answer` + updates local store
- `submitExam()`: calls `POST /attempts/:id/submit` → returns `{ redirectUrl }`
- On `setExamSession`: restores `answers` from `attempt.items` so refresh doesn't lose progress

---

### `useAuth.ts`
Auth state management.

```typescript
useAuth() → { user, isLoading, isAuthenticated, login, logout, refreshToken }
```

---

### `useDeviceCheck.ts`
Pre-exam device compatibility check.

```typescript
useDeviceCheck() → { hasWebcam, hasFullscreenSupport, isMobile }
```

---

### `useSocket.ts`
Low-level Socket.IO connection wrapper.

```typescript
useSocket() → { socket, isConnected }
```

---

## 12. Authentication Flow

### Student Registration
```
1. Student enters email on /register
2. Neon Auth sends OTP to email
3. Student enters OTP → Neon Auth verifies
4. Frontend: POST /auth/sync { email, firstName, lastName, classBand, schoolCode }
5. Backend: finds or creates User with role=STUDENT
6. Backend: signs JWT { sub: userId, email, role } expiry 24h
7. Frontend: stores token in localStorage['auth_token']
8. AuthGuard: reads token, decodes, sets user context
```

### Admin Login
```
1. Admin enters email + password on /login (admin-frontend)
2. Frontend: POST /auth/admin-login { email, password }
3. Backend: compares against ADMIN_EMAIL/ADMIN_PASSWORD env vars
4. Backend: getOrCreateAdmin() → finds or creates ADMIN user
5. Backend: signs JWT expiry 8h
6. Admin frontend: stores in js-cookie 'admin_token'
```

### JWT Structure
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "role": "STUDENT",
  "iat": 1234567890,
  "exp": 1234654290
}
```

---

## 13. Exam Flow End-to-End

```
1. ADMIN creates Exam + Sections + Questions (question bank)
2. ADMIN creates ExamInstance (startsAt, endsAt window)
3. ADMIN creates ExamSlots for the instance (optional — if none, exam is open-access)
4. ADMIN sets Exam.feeAmount if paid (in paise, e.g. 50000 = ₹500)
5. ADMIN publishes exam (isPublished = true)

6. STUDENT logs in → dashboard shows available exams (filtered by classBand)
7. STUDENT opens exam → /exams/:id/slots (if slots exist)
   - Views slot grid with seat availability (green/amber/red)
   - Clicks a slot → POST /api/slots/:id/book
   - Free exam → Booking CONFIRMED → redirect to /exams/:id/instructions
   - Paid exam → Booking PENDING → redirect to /payment/:bookingId

8. STUDENT completes payment (paid exam):
   - Optional: enters coupon code for discount
   - Clicks "Pay Now" → POST /api/payments/create-order → Razorpay modal opens
   - Pays → Razorpay calls POST /api/payments/webhook (backup) + client calls POST /api/payments/verify
   - Booking status → CONFIRMED → redirect to /payment/success → then /exams/:id/instructions

9. STUDENT opens /exams/:id/instructions → clicks "Start Exam":
   - Page navigates to /exams/:id/play
   - useExamSession.startExam() → POST /exams/:instanceId/start
   - Backend slot gate: checks CONFIRMED booking within slot time window (skips if no slots)
   - Backend creates Attempt + AttemptItems (one per question)
   - Returns exam + questions (shuffled by userId seed) + attempt

10. Fullscreen gate appears → student clicks "Enter Fullscreen"
    - Browser enters fullscreen
    - fullscreenchange event fires → isGated = false → exam unlocked

11. useTimer connects WS → join-exam → server starts countdown
    - Every 1s: timer-tick → updates UI countdown

12. useWebcam starts → requests camera permission
    - Every 30s: snapshot → POST /proctor/analyze-frame
    - Results in ProctorEvent if anomaly detected

13. Student answers questions:
    - Click option → handleSelectOption() → saveAnswer() → POST /attempts/:id/answer
    - AttemptItem.answer updated in DB
    - Local Zustand store updated

14. Student navigates questions via Next/Previous/sidebar grid

15. Student clicks "Submit Exam" → confirmation modal
    - Confirm → POST /attempts/:id/submit
    - Backend calculates score: for each item, correctAnswer check → score + negativeMarks
    - Attempt.status = SUBMITTED, totalScore set
    - sessionStorage violations cleared
    - Redirect to /results

16. Auto-submit scenarios:
    a. Timer expired: WS timer-expired event → handleAutoSubmit()
    b. 3 violations: useFullscreenMonitor onAutoSubmit → handleAutoSubmit()
    c. 20s pause: violation timer → onAutoSubmit()
    Each auto-submit: clears sessionStorage, calls submitExam(), redirects

17. ADMIN releases results (isResultReleased = true)
18. STUDENT views score breakdown on /results
```

---

## 14. Proctoring System

### Three Layers of Anti-Cheat

**Layer 1 — Fullscreen Enforcement (`useFullscreenMonitor`)**
- Exam is gated behind a fullscreen overlay
- Browser fullscreen API enforced; cannot dismiss overlay without entering fullscreen
- Exit events (Escape, Windows key, Alt+Tab) trigger violations
- Module-level `_violationLocked` flag with 5s cooldown prevents one keypress = multiple violations
- 3 violations → auto-submit
- 20s grace timer after each violation → auto-submit if not restored

**Layer 2 — Tab/Window Monitoring**
- `visibilitychange` event: switching tabs → violation
- `window.blur` event: window losing focus → violation (suppressed for 2s after fullscreen transitions)

**Layer 3 — Webcam AI Proctoring**
- Webcam captures frame every 30 seconds
- Python ONNX service detects faces
- Events logged: NO_FACE, MULTIPLE_FACES, FACE_MISMATCH
- Admin can review full proctor timeline per attempt

### Violation Persistence
- Violations stored in `sessionStorage['violations_/exams/:id/play']`
- Survives page refresh (intentional — prevents cheat via refresh)
- Cleared only on exam submit or auto-submit

---

## 15. Deployment

### Current Deployment

| Service | Platform | URL |
|---|---|---|
| Backend (NestJS) | Render.com | `https://api.bharatolympiad.in` |
| Student Frontend | Vercel | `https://olympiad-student-frontend-*.vercel.app` |
| Admin Frontend | Vercel | `https://olympiad-admin-frontend-*.vercel.app` |
| Database | Neon.tech (PostgreSQL) | Managed connection string |
| Redis | Docker (local dev) | — |

### Deploy Commands

```bash
# Backend — push to main triggers Render auto-deploy
git push origin main

# Student frontend — force production deploy
cd frontend && vercel --prod --yes

# Admin frontend — force production deploy
cd admin-frontend && vercel --prod --yes

# Run DB migration after schema change
cd backend && npx prisma migrate deploy

# PENDING — Phase 2 Razorpay/slot schema migration (run before deploying payment feature)
cd backend && npx prisma migrate dev --name phase2_razorpay_slots

# After schema migration, regenerate frontend Prisma client
cd frontend && npx prisma generate
```

> **Before deploying the payment feature:** Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` in both `backend/.env` and `frontend/.env` (or Vercel/Render environment settings). Use `rzp_test_...` keys for development and `rzp_live_...` for production.

### Local Development

```bash
# Start PostgreSQL + Redis
docker-compose up -d

# Backend
cd backend && npm run start:dev

# Student frontend
cd frontend && npm run dev       # http://localhost:3000

# Admin frontend
cd admin-frontend && npm run dev  # http://localhost:3001

# Python proctor service
cd proctor-service
python -m venv venv && venv\Scripts\activate
pip install -r requirements.txt
python main.py                    # http://localhost:5000
```
