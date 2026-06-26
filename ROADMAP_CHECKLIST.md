# Bharat Innovation Olympiad — Implementation Roadmap & Checklist

> Work through phases IN ORDER. Each phase depends on the previous one.  
> Check off tasks as completed. Never skip Phase 1 — everything depends on it.

---

## Completion Log

| Date | What was done |
|---|---|
| 2026-06-10 | Phase 2.5 (Slot Booking Module) + Phase 2.6 (Payment/Razorpay Module) fully implemented. Frontend pages for slot selection, payment, and success added. Schema extended with ExamSlot, Booking, Payment, Coupon models + BookingStatus/PaymentStatus enums. `feeAmount` added to Exam. Slot booking gate added to `startAttempt()`. **Pending: run migration, add real Razorpay keys to .env, build admin slot UI.** |
| 2026-06-13 | PRD pass-2 alignment complete. Cloned `bharat-innovation-olympiad/Bharat_innovation_olympiad` reference repo. Read all architecture PRDs (bio-core, bio-portal, bio-proctor phases P0–P7). Implemented: `QuestionType` extended to MCQ/MULTI_SELECT/TRUE_FALSE/SHORT_ANSWER/NUMERIC; `ProctorEventType` extended with SEB_VIOLATION; `SebGuard` created (HMAC SHA-256 Browser Exam Key + Config Key validation); `SebConfigService` created (SEB JSON config generation + seb:// launch URL); `GET /seb/config/:instanceId` + `GET /seb/launch/:instanceId` endpoints added; SebGuard wired to `POST /exams/:instanceId/start`; multi-question-type scoring strategies added to `attempt.service.ts` (MULTI_SELECT, TRUE_FALSE, SHORT_ANSWER, NUMERIC); schema pushed to Neon DB + Prisma client regenerated in both backend and frontend. |
| 2026-06-13 | Admin frontend Phase 3.2 (partial) — built `admin-frontend/src/app/slots/page.tsx` (slot CRUD + bookings modal) and `admin-frontend/src/app/payments/page.tsx` (revenue dashboard + payments table + refund + coupon CRUD). Added Slots and Payments nav links to Navbar. Updated Dashboard quick-action cards. |
| 2026-06-13 | Step 2.7 — Unique Question Set Generation. Schema: added `easyPct/mediumPct/hardPct` to `Exam`, `sortOrder` to `AttemptItem`. Backend: FNV-1a seeded shuffle + difficulty-bucket selection in `attempt.service.ts`; `startAttempt` now pre-creates all `AttemptItem` rows with `sortOrder` and returns `{ attempt, questions }`. Frontend: `useExamSession.startExam` consumes new response (one fewer GET /exams/:id call). **Pending: run `npx prisma migrate dev --name add_question_set_selection` in backend.** |
| 2026-06-16 | Step 2.1 (S3 File Upload Service) + Step 2.X (Rich Media Questions + Question Pool System). Schema: added `MediaType` enum (`IMAGE/VIDEO/AUDIO/DIAGRAM`), `mediaUrl`/`mediaType` to `Question`, `questionsToAssign` to `ExamSection`. Backend: `S3Service` + `S3Module` created (`backend/src/common/services/`), registered globally in `AppModule`; `buildQuestionSet` fixed to use `questionsToAssign` as pool target (not section size), final cross-section seeded shuffle added for unique question ordering; `QUESTION_SELECT` updated to include media fields; `getQuestionMediaUploadUrl` endpoint added (`GET /admin/questions/media-upload-url`). Frontend: `MediaType` union type added, `ExamSection.questionsToAssign` typed, `Question.mediaType` narrowed. Student player already renders IMAGE/VIDEO/AUDIO. **Pending: run `npx prisma migrate dev --name add_media_questions_pool` in backend; set `AWS_*` env vars.** |
| 2026-06-26 | **Meazure Learning → face-api.js migration (fully free, client-side AI proctoring).** Removed: `proctor-service/` Python directory (Meazure Learning bridge), `PROCTOR_SERVICE_URL`/`PROCTOR_API_KEY` env vars, `POST /proctor/sessions`, `GET /proctor/sessions/:sessionId`, `POST /proctor/meazure-event` endpoints. Added: `useFaceProctor.ts` hook (TensorFlow.js browser inference via tinyFaceDetector + faceLandmark68TinyNet + faceRecognitionNet), `admin-frontend/src/app/proctor/page.tsx` (live monitoring dashboard, polls every 15s), `POST /proctor/enroll`, `GET /proctor/enrollment`, `POST /proctor/verify`, `GET /proctor/live` endpoints. Added `LOOKING_AWAY` to `ProctorEventType` enum + severity map. Identity verification via 128-D Euclidean distance (threshold 0.5) against `User.faceEmbedding`. Gaze detection via 68-point landmarks (nose deviation threshold 0.25, 2 consecutive ticks). Inference runs every 5s via `requestIdleCallback` — zero student lag. **Pending: run `npx prisma migrate dev --name add_looking_away_event`; `npm install face-api.js` in frontend; download model weights to `frontend/public/models/`.** |

---

---

## PRD Pass-2 Architecture Status
*Reference: `prd-reference/docs/all-prds-re-arch-pass-2/` — three sub-repos: bio-core · bio-portal · bio-proctor*

### P0 Foundation
- [x] PLAT-01 — Repo Scaffold ✅ (NestJS + Next.js monorepo in place)
- [x] PLAT-03 — Infrastructure ✅ (docker-compose for local Postgres + Redis)
- [x] PLAT-04 — Observability + Audit ✅ (AuditLogInterceptor on all mutating routes)
- [ ] PLAT-02 — Contracts + Events (outbox + event bus — Phase 5 blocker)
- [ ] PLAT-05 — Security Baseline (rate limiting, DPDP consent, KMS-encrypted PII)

### P1 Identity + Auth
- [x] AUTH-01 — Student login via Neon OTP (`POST /auth/sync`, `POST /auth/login-sync`) ✅
- [x] AUTH-02 — Registration Profile (firstName, lastName, classBand, schoolCode) ✅
- [x] AUTH-04 — Admin Auth RBAC (JwtAuthGuard + RolesGuard, ADMIN/SUPER_ADMIN roles) ✅
- [x] AUTH-05 — Sessions + Tokens (JWT access + refresh token rotation) ✅
- [ ] AUTH-03 — DPDP Consent (India data-protection consent capture + storage)

### P2 Admin Authoring + Scheduling
- [x] ADMIN-01 — Question Bank (create/edit/delete/bulk/search questions) ✅
- [x] ADMIN-02 — Paper Builder (sections, question attach/detach, sort order) ✅
- [x] ADMIN-03 — Slots + Pricing (ExamSlot CRUD, `feeAmount`, Coupon model) ✅
- [x] ADMIN-04 — Publishing Snapshots (isPublished toggle, isResultReleased toggle) ✅
- [ ] ADMIN-05 — User + School Mgmt (school approval workflow, SCHOOL_ADMIN role)
- [ ] ADMIN-06 — Dashboard Analytics (revenue, registrations, score distribution)

### P3 Portal + Commerce
- [x] PORTAL-02 — Slot Catalog (`GET /slots`, seat availability, color coding) ✅
- [x] PORTAL-04 — Razorpay Payments (create-order, verify, webhook, refund) ✅
- [x] PORTAL-06 — Refunds + Cancels (`POST /admin/payments/:id/refund`, cancel booking) ✅
- [x] PORTAL-08 — Pricing + Coupons (Coupon model, validate endpoint, discount apply) ✅
- [ ] PORTAL-01 — Marketing + Discovery (landing page, exam catalog for unauthenticated)
- [ ] PORTAL-03 — Booking Holds (time-limited seat lock before payment — prevent oversell)
- [ ] PORTAL-05 — Admit Card + Notify (PDF generation + email/SMS notification)
- [ ] PORTAL-07 — Entitlement Sync (outbox event → exam access grant on payment confirmed)

### P4 Exam Runtime
- [x] EXAM-00 — Dashboard Handoff (dashboard → exam list → instructions → play flow) ✅
- [x] EXAM-02 — Attempt Gate (slot booking check + time window enforcement) ✅
- [x] EXAM-03 — Player Autosave (`POST /attempts/:id/answer`, answer restoration on refresh) ✅
- [x] EXAM-04 — Durable Timer (server-authoritative WS timer, Redis-backed) ✅
- [x] EXAM-05 — Submission Flow (submit + auto-submit, score calc, quitUrl redirect) ✅
- [x] EXAM-06 — SEB Lockdown ✅ **Done 2026-06-13**
  - [x] `SebGuard` — HMAC SHA-256 Browser Exam Key + Config Key validation
  - [x] `SebConfigService` — JSON config generation + `seb://` launch URL
  - [x] `GET /seb/config/:instanceId` — SEB config download endpoint
  - [x] `GET /seb/launch/:instanceId` — Admin launch URL endpoint
  - [x] `SebGuard` applied to `POST /exams/:instanceId/start`
- [ ] EXAM-01 — Device Identity (fingerprint capture, device binding per attempt)

### P5 Scoring + Results
- [x] SCORE-01 — Scoring engine for MCQ, MULTI_SELECT, TRUE_FALSE, SHORT_ANSWER, NUMERIC ✅ **Done 2026-06-13**
- [x] SCORE-02 — Results + Ranking (score breakdown, section radar chart, rank out of 500) ✅
- [ ] SCORE-01 async — Decouple scoring from submit into background job (BullMQ)

### P6 Proctoring
- [x] PROCTOR-01 — Face Enrollment ✅ `POST /proctor/enroll` — stores 128-D descriptor (Float32Array → Buffer) in `User.faceEmbedding`; `GET /proctor/enrollment` checks status; identity verified at exam start via `POST /proctor/verify` (Euclidean distance < 0.5)
- [x] PROCTOR-02 — Client-Side Frame Analysis ✅ `useFaceProctor.ts` — face-api.js runs in browser (WebGL); detects NO_FACE, MULTIPLE_FACES, LOOKING_AWAY, FACE_MISMATCH every 5s via `requestIdleCallback`; zero server processing; models served from `frontend/public/models/` (~6.5 MB, browser-cached) *(replaces Python ONNX service — removed)*
- [x] PROCTOR-03 — Risk Events ✅ `POST /proctor/events`, riskScore aggregation (severity-weighted)
- [x] PROCTOR-04 — Review Console ✅ `GET /proctor/report/:attemptId` for admins; `GET /proctor/live` for live dashboard — all IN_PROGRESS attempts + recent events; admin-frontend `/proctor` page polls every 15s
- [ ] PROCTOR-05 — Biometric Retention (DPDP-compliant auto-delete of face embeddings after exam)

### P7 Ops + Analytics
- [ ] OPS-01 — Exam-Day Ops (live attempt monitoring, force-submit, slot override endpoints)

---

## Phase 1 — Database Schema Extension
**Why first:** Every backend module in Phase 2 needs these tables. Do this once, run migration, move on.

### Step 1.1 — Extend `backend/prisma/schema.prisma`

**Add these fields to existing `User` model:**
- [ ] `phone String?`
- [ ] `dateOfBirth DateTime?`
- [ ] `parentName String?`
- [ ] `parentPhone String?`
- [ ] `profileCompletedAt DateTime?`
- [ ] `profileLockedAt DateTime?` — set to `examDate - 48h` by admin
- [ ] `aadhaarVerified Boolean @default(false)`

**Add these fields to existing `School` model:**
- [ ] `udiseCode String? @unique` — govt school code
- [ ] `board String?` — CBSE / ICSE / State Board
- [ ] `verificationStatus VerifStatus @default(PENDING)`
- [ ] `adminUserId String?` — linked school admin user

**Add these fields to existing `Exam` model:**
- [x] `feeAmount Int?` — registration fee in paise (null = free) ✅ done 2026-06-10
- [x] `easyPct Int @default(30)` — % of easy questions per student set ✅ 2026-06-13
- [x] `mediumPct Int @default(50)` ✅ 2026-06-13
- [x] `hardPct Int @default(20)` ✅ 2026-06-13

**Add these NEW models:**
- [x] `ExamSlot` — scheduled slot for students to book ✅ done 2026-06-10
  ```
  id, examInstanceId (FK), label?, startsAt, endsAt, capacity, booked (default 0)
  ```
- [x] `Booking` — student's slot reservation ✅ done 2026-06-10
  ```
  id, userId (FK), slotId (FK), paymentId (FK? unique), status (BookingStatus)
  @@unique([userId, slotId])
  ```
- [x] `Payment` — Razorpay payment record ✅ done 2026-06-10
  ```
  id, userId (FK), razorpayOrderId (unique), razorpayPaymentId (unique?),
  razorpaySignature?, amount (paise), currency (INR), status (PaymentStatus), couponId (FK?)
  ```
- [ ] `Invoice` — PDF invoice record — ⚠️ PENDING (needs Puppeteer + S3)
  ```
  id, paymentId (unique FK), invoiceNo (unique), s3Key
  ```
- [x] `Coupon` — discount codes ✅ done 2026-06-10
  ```
  id, code (unique, uppercase), discountPct (0-100), maxUses, usedCount, expiresAt?
  ```
- [ ] `Parent` — parent accounts (separate from User)
  ```
  id, email (unique), phone?, firstName, lastName, passwordHash
  ```
- [ ] `ParentStudent` — parent ↔ student many-to-many
  ```
  parentId (FK), studentId (FK) — composite PK
  ```
- [ ] `StudentIdentity` — Aadhaar verification data
  ```
  id, userId (unique FK), maskedAadhaar, encryptedData, verificationStatus,
  aadhaarPhotoS3Key?, verifiedAt?
  ```
- [ ] `DocumentUpload` — uploaded proof documents
  ```
  id, userId (FK), type (DocType), s3Key, status (VerifStatus)
  ```
- [ ] `Notification` — in-app notifications
  ```
  id, userId (FK), title, body, isRead (default false)
  ```
- [ ] `NotificationTemplate` — admin-editable message templates
  ```
  id, name (unique), channel (NotifChannel), subject?, body
  ```
- [ ] `NotifPreference` — per-user notification opt-in settings
  ```
  userId (PK FK), email (default true), sms (default true), whatsapp (default false)
  ```
- [ ] `SchoolMessage` — school ↔ admin messaging
  ```
  id, schoolId (FK), fromAdmin (bool), body
  ```
- [ ] `AdmitCard` — generated admit card record
  ```
  id, userId (FK), slotId (FK), s3Key
  ```

**Add these NEW enums:**
- [x] `BookingStatus { PENDING CONFIRMED CANCELLED }` ✅ done 2026-06-10
- [x] `PaymentStatus { CREATED PAID FAILED REFUNDED }` ✅ done 2026-06-10
- [ ] `VerifStatus { PENDING VERIFIED REJECTED }`
- [ ] `DocType { SCHOOL_ID MARKSHEET PHOTO OTHER }`
- [ ] `NotifChannel { EMAIL SMS WHATSAPP IN_APP }`

**Add new relations to User model:**
- [x] `bookings Booking[]` ✅ done 2026-06-10
- [x] `payments Payment[]` ✅ done 2026-06-10
- [ ] `parentLinks ParentStudent[]`
- [ ] `identity StudentIdentity?`
- [ ] `documents DocumentUpload[]`
- [ ] `notifications Notification[]`
- [ ] `notifPreference NotifPreference?`
- [ ] `admitCards AdmitCard[]`

### Step 1.2 — Run migration
```bash
cd backend
npx prisma migrate dev --name "phase1_schema_extension"
npx prisma generate
```
- [ ] Migration ran without errors — ⚠️ **MUST DO BEFORE DEPLOY**: run `npx prisma migrate dev --name phase2_razorpay_slots` in backend
- [ ] `npx prisma studio` opened and new tables visible
- [x] `npx prisma generate` completed — Prisma client regenerated in both backend and frontend ✅ 2026-06-10

---

## Phase 2 — Backend Modules

### Step 2.1 — S3 File Upload Service ✅ COMPLETE (2026-06-16)
**File:** `backend/src/common/services/s3.service.ts`  
**File:** `backend/src/common/services/s3.module.ts`  

**Install:** ✅ `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` already in `package.json`

**Add to `.env`:** ✅ Added to `backend/.env.example`
```
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=bio-olympiad-prod
```

**Methods implemented:**
- [x] `getPresignedPutUrl(key, contentType, expiresIn?)` → string — for client direct uploads
- [x] `getPresignedGetUrl(key, expiresIn?)` → string — for time-limited downloads
- [x] `uploadBuffer(key, buffer, contentType)` → void — for server-side uploads (webcam frames, PDFs)
- [x] `deleteObject(key)` → void
- [x] `publicUrl(key)` → string — permanent public URL for question media

**Static key generators:**
- [x] `S3Service.profilePhotoKey(userId)`
- [x] `S3Service.documentKey(userId, docType, filename)`
- [x] `S3Service.proctorSnapshotKey(attemptId, timestamp)`
- [x] `S3Service.invoiceKey(paymentId)`
- [x] `S3Service.admitCardKey(userId, slotId)`
- [x] `S3Service.questionMediaKey(questionId, filename)` ← NEW for question media
- [x] `S3Service.exportKey(filename)`

**S3 bucket folder structure:**
```
bio-olympiad-prod/
  profiles/          → profile photos (profiles/{userId}.jpg)
  documents/         → student documents (documents/{userId}/{docType}/{filename})
  proctoring/        → webcam snapshots (proctoring/{attemptId}/{timestamp}.jpg)
  invoices/          → payment PDFs (invoices/{paymentId}.pdf)
  admit-cards/       → admit card PDFs (admit-cards/{userId}/{slotId}.pdf)
  questions/         → question media (questions/{questionId}/{filename}) ← NEW
  exports/           → merit lists, school reports
```

**Import `S3Module` in:**
- [x] `AppModule` (global: true) ✅

---

### Step 2.2 — Notification Service
**New module:** `backend/src/notification/`

**Files to create:**
- [ ] `notification.module.ts`
- [ ] `notification.service.ts`
- [ ] `notification.controller.ts` — admin CRUD for templates
- [ ] `dto/send-notification.dto.ts`

**Install:**
```bash
npm install @aws-sdk/client-ses @aws-sdk/client-sns @nestjs/schedule
```

**Add to `.env`:**
```
AWS_SES_FROM_EMAIL=noreply@yourdomain.in
AWS_SNS_SENDER_ID=BIOOLYM
WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_ID=
```

**Methods to implement:**
- [ ] `sendEmail(to, templateName, vars)` — fetches template from DB, interpolates `{{vars}}`, sends via SES
- [ ] `sendSms(to, templateName, vars)` — sends via AWS SNS
- [ ] `sendWhatsApp(to, templateId, vars[])` — sends via Meta Cloud API
- [ ] `createInApp(userId, title, body)` — inserts `Notification` row
- [ ] `markAsRead(notificationId, userId)` — updates isRead
- [ ] `broadcastToAll(templateName, filter?)` — bulk send via Bull queue to avoid rate limits

**Admin endpoints to add to `notification.controller.ts`:**
- [ ] `GET /admin/notification-templates` — list templates
- [ ] `PUT /admin/notification-templates/:id` — edit template body/subject
- [ ] `POST /admin/notifications/broadcast` — trigger bulk send
- [ ] `GET /notifications/me` — student's in-app notifications
- [ ] `PATCH /notifications/:id/read` — mark read

**Register Bull queue for bulk sends:**
```bash
npm install @nestjs/bull bull
```

---

### Step 2.3 — School Module (Full)
**Extend existing or create:** `backend/src/school/`

**New endpoints to add:**
- [ ] `POST /schools/register` — PUBLIC, school self-registration form
- [ ] `GET /schools/search?q=` — PUBLIC, search schools by name (for student registration dropdown)
- [ ] `GET /admin/schools` — ADMIN, list all schools with verificationStatus filter
- [ ] `PATCH /admin/schools/:id/approve` — ADMIN, set VERIFIED + auto-create school admin User
- [ ] `PATCH /admin/schools/:id/reject` — ADMIN, set REJECTED + send email
- [ ] `POST /admin/schools/import` — SUPER_ADMIN, bulk CSV import
- [ ] `GET /schools/:id/stats` — SCHOOL_ADMIN, own students count by status
- [ ] `GET /schools/:id/messages` — SCHOOL_ADMIN, message thread
- [ ] `POST /schools/:id/messages` — SCHOOL_ADMIN, send message to admin

**Auto-create school admin on approval:**
```typescript
// In approveSchool():
const adminUser = await this.prisma.user.create({
  data: {
    email: school.adminEmail,
    role: 'SCHOOL_ADMIN',  // add to Role enum
    firstName: school.contactName,
    lastName: '',
    schoolId: school.id
  }
});
// Send email invite with temporary password
```

**Add `SCHOOL_ADMIN` to `Role` enum in schema:**
- [ ] Add `SCHOOL_ADMIN` to `Role` enum
- [ ] Re-run migration

**Seed script for UDISE data:**
- [ ] `backend/scripts/import-udise.js` — reads `udise_schools.csv` → bulk insert into School table
- [ ] Download UDISE dataset from `udise.gov.in`

---

### Step 2.4 — Student Profile Module
**Extend:** `backend/src/user/user.controller.ts` and `user.service.ts`

**New endpoints:**
- [ ] `PATCH /users/me/profile` — update extended profile (phone, DOB, parentName, etc.)
- [ ] `GET /users/me/upload-url?type=photo` — return S3 presigned PUT URL for photo upload
- [ ] `POST /users/me/documents` — `{ type, s3Key }` — register uploaded document
- [ ] `GET /users/me/documents` — list user's documents
- [ ] `POST /users/me/admit-card` — generate admit card PDF + store in S3 + create AdmitCard row
- [ ] `GET /users/me/admit-card/:slotId` — get presigned URL for admit card PDF download
- [ ] `GET /admin/users/pending` — ADMIN, list students with PENDING verificationStatus
- [ ] `PATCH /admin/users/:id/verify` — ADMIN, approve/reject student + send email

**Profile lock guard:**
- [ ] Create `ProfileLockGuard` or add inline to `PATCH /users/me/profile`:
  ```typescript
  if (user.profileLockedAt && new Date() > user.profileLockedAt) {
    throw new ForbiddenException('Profile locked');
  }
  ```

**Admit card generation:**
```bash
npm install puppeteer
```
- [ ] Create `backend/src/common/services/pdf.service.ts`
- [ ] `generateAdmitCard(user, slot)` → HTML template → Puppeteer PDF → Buffer
- [ ] Upload to S3 `admit-cards/{userId}/{slotId}.pdf`

---

### Step 2.5 — Slot Booking Module ✅ COMPLETE (2026-06-10)
**New module:** `backend/src/slot/`

**Files created:**
- [x] `slot.module.ts`
- [x] `slot.controller.ts`
- [x] `slot.service.ts`
- [x] `dto/slot.dto.ts` (CreateSlotDto + BookSlotDto combined)

**Endpoints implemented:**
- [x] `POST /admin/slots` — ADMIN, create slot for examInstance
- [x] `PUT /admin/slots/:id` — ADMIN, update slot timing/capacity
- [x] `GET /slots?examId=&examInstanceId=` — JWT, list available slots with seat count
- [x] `POST /slots/:id/book` — STUDENT, atomic booking inside $transaction (race-condition safe)
  - Free exam (feeAmount=0 or null) → CONFIRMED immediately, returns `{ requiresPayment: false }`
  - Paid exam → PENDING booking, returns `{ requiresPayment: true, amount }` → caller calls create-order
- [x] `DELETE /bookings/:id` — STUDENT, cancel booking + decrement booked counter
- [x] `GET /admin/slots` — ADMIN, all slots with booking counts
- [x] `GET /admin/slots/:id/bookings` — ADMIN, who booked this slot
- [x] `GET /bookings/me?examId=` — STUDENT, own active booking for an exam

**Race condition prevention:** Implemented — capacity check + booked increment inside single `$transaction`.

**Slot access gate in `attempt.service.startAttempt()`:**
- [x] Gate added — checks CONFIRMED booking within slot window
- Skips demo exams (`isDemoExam()` check)
- Skips if exam instance has no slots (backward compatible with non-slot exams)

---

### Step 2.6 — Payment Module (Razorpay) ✅ LARGELY COMPLETE (2026-06-10)
**New module:** `backend/src/payment/`

**Installed:** `npm install razorpay` ✅

**Env vars added to `backend/.env.example` and `frontend/.env`:**
```
RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXXXXX   ← replace with real test key
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```
> ⚠️ Use `rzp_test_...` keys during development. Get live keys after Razorpay KYC approval.

**Files created:**
- [x] `payment.module.ts`
- [x] `payment.controller.ts`
- [x] `payment.service.ts`
- [ ] `invoice.service.ts` — ⚠️ PENDING (needs Puppeteer + S3, Phase 2.1 dependency)

**Endpoints implemented:**
- [x] `POST /payments/create-order` — STUDENT, creates Razorpay order (idempotent — returns existing order if already created), handles coupon discount, confirms free bookings directly
- [x] `POST /payments/verify` — STUDENT, client-side HMAC verification after Razorpay checkout success → marks Payment PAID + Booking CONFIRMED
- [x] `POST /payments/webhook` — PUBLIC, Razorpay webhook with HMAC verification (raw body via `express.raw` middleware in `main.ts`), handles `payment.captured`, `payment.failed`, `refund.processed`
- [x] `GET /payments/my-payments` — STUDENT, own payment history with booking details
- [x] `GET /coupons/validate?code=` — JWT, validate coupon before applying
- [x] `POST /admin/coupons` — ADMIN, create coupon code
- [x] `GET /admin/coupons` — ADMIN, list all coupons
- [x] `GET /admin/payments` — ADMIN, all payments with optional status filter
- [x] `POST /admin/payments/:id/refund` — ADMIN, trigger Razorpay refund
- [ ] `GET /payments/:id/invoice` — PENDING (needs S3 + invoice service)

**`main.ts`:** Raw body middleware added: `app.use('/payments/webhook', express.raw(...))` ✅

**Frontend API routes also implemented** (frontend uses Prisma directly):
- [x] `POST /api/payments/create-order`
- [x] `POST /api/payments/verify`
- [x] `POST /api/payments/webhook`
- [x] `GET /api/payments/my-payments`
- [x] `GET /api/coupons/validate`
- [x] `GET /api/bookings/:id`
- [x] `GET /api/bookings/me?examId=`
- [x] `POST /api/bookings/:id/cancel`
- [x] `GET /api/slots?examId=&examInstanceId=`
- [x] `POST /api/slots/:id/book`

**Invoice PDF generation:**
- [ ] `invoice.service.generateInvoice(payment)` → HTML template with GST breakdown → Puppeteer → S3 — S3 service now available; needs Puppeteer install + invoice template

---

### Step 2.7 — Unique Question Set Generation ✅ COMPLETE (2026-06-13)
**Modified:** `backend/src/attempt/attempt.service.ts`, `schema.prisma`, `frontend/src/hooks/useExamSession.ts`

- [x] Added `easyPct Int @default(30)`, `mediumPct Int @default(50)`, `hardPct Int @default(20)` to `Exam` model
- [x] Added `sortOrder Int @default(0)` to `AttemptItem` model
- [x] `fnvHash()` + xorshift32 `seededShuffle()` + `buildQuestionSet()` methods in `AttemptService`
  - Per-section: selects easyPct% easy / mediumPct% medium / hardPct% hard
  - Deficit fill: any unselected questions fill remaining slots from a seeded shuffle
  - Deterministic: same userId + examId + sectionId always produces the same selection
- [x] `initializeQuestionSet()` — fetches exam sections, runs selection, pre-creates `AttemptItem` rows with `sortOrder`
- [x] `startAttempt()` returns `{ attempt, questions }` — questions are the ordered student subset, correctAnswer excluded
- [x] Resume path: questions derived from existing `AttemptItem` rows (ordered by `sortOrder`) — stable across question-bank edits
- [x] Legacy attempt fallback: IN_PROGRESS attempt with no items gets initialized on resume
- [x] `startDemoAttempt()` updated to same `{ attempt, questions }` shape
- [x] `exam.service.createExam/updateExam` accept `easyPct/mediumPct/hardPct`
- [x] Frontend `useExamSession.startExam()` uses questions from `startAttempt` response (one fewer API call)
- [ ] **Migration pending:** `cd backend && npx prisma migrate dev --name add_question_set_selection`

---

### Step 2.X — Rich Media Questions + Question Pool System ✅ COMPLETE (2026-06-16)
**Modified:** `backend/prisma/schema.prisma`, `backend/src/attempt/attempt.service.ts`, `backend/src/exam/exam.service.ts`, `backend/src/exam/exam.controller.ts`, `frontend/src/types/exam.ts`

**Rich Media Questions:**
- [x] Added `mediaUrl String?` to `Question` — S3 URL or public URL for attached media
- [x] Added `mediaType MediaType?` to `Question` — enum: `IMAGE | VIDEO | AUDIO | DIAGRAM`
- [x] `QUESTION_SELECT` constant updated to include `mediaUrl` and `mediaType`
- [x] `findExamById` question select updated to include `mediaUrl` and `mediaType`
- [x] `GET /admin/questions/media-upload-url?filename=&contentType=` — returns presigned S3 PUT URL + permanent public URL
- [x] Student exam player renders all types: `IMAGE/DIAGRAM` → `<img>`, `VIDEO` → `<video controls>`, `AUDIO` → `<audio controls>`
- [x] Frontend `MediaType` union type added to `frontend/src/types/exam.ts`

**Question Pool System (per-section):**
- [x] Added `questionsToAssign Int @default(0)` to `ExamSection` — `0` = use all (backward-compatible)
- [x] `buildQuestionSet` fixed: uses `questionsToAssign` as pool selection target instead of section size
  - Example: 100 questions in pool, `questionsToAssign=50` → each student gets 50
- [x] Final cross-section seeded shuffle added (`seed: userId:examId:order`) — ensures unique ordering even when two students receive identical subsets
- [x] `POST /admin/exams/:id/sections` body accepts optional `questionsToAssign`
- [x] Frontend `ExamSection.questionsToAssign` typed
- [ ] **Migration pending:** `cd backend && npx prisma migrate dev --name add_media_questions_pool`

---

### Step 2.8 — Admin Role Expansion + 2FA
**Extend:** `backend/src/auth/`

**Install:**
```bash
npm install speakeasy qrcode
npm install @types/speakeasy -D
```

**Add to `User` model in schema:**
- [ ] `totpSecret String?`
- [ ] `totpEnabled Boolean @default(false)`

**Add `SCHOOL_ADMIN` and `PROCTOR` to `Role` enum** (if not done in 2.3)

**New endpoints:**
- [ ] `POST /auth/admin/2fa/setup` — ADMIN, generate TOTP secret + QR code (base64 PNG)
- [ ] `POST /auth/admin/2fa/activate` — ADMIN, verify first TOTP code + set totpEnabled=true
- [ ] `POST /auth/admin/2fa/validate` — called on login when totpEnabled=true
- [ ] `PATCH /admin/users/:id/role` — SUPER_ADMIN only, update user role
- [ ] `GET /admin/audit-logs` — paginated audit log

**Update `POST /auth/admin-login`:**
- [ ] After password check, if `user.totpEnabled`, return `{ requires2fa: true, tempToken }` instead of full JWT
- [ ] `POST /auth/admin/2fa/validate` accepts `tempToken` + TOTP code → returns full JWT

---

### Step 2.9 — Parent Module
**New module:** `backend/src/parent/`

- [ ] `parent.module.ts`
- [ ] `parent.controller.ts`
- [ ] `parent.service.ts`

**Endpoints:**
- [ ] `POST /parents/register` — PUBLIC, parent registration
- [ ] `POST /parents/login` — PUBLIC, parent login (email + password)
- [ ] `GET /parents/me` — PARENT, own profile
- [ ] `GET /parents/me/students` — PARENT, linked student profiles
- [ ] `POST /parents/me/link-student` — PARENT, link to student `{ studentEmail }`
- [ ] `GET /parents/me/students/:id/slot` — PARENT, student's booking + slot details
- [ ] `GET /parents/me/students/:id/results` — PARENT, student's results (if released)
- [ ] `GET /parents/me/students/:id/invoice` — PARENT, download payment receipt
- [ ] `PATCH /parents/me/preferences` — PARENT, update notification opt-ins

---

### ~~Step 2.10 — AWS Rekognition Integration~~ — SUPERSEDED

> **Removed 2026-06-26.** AWS Rekognition is no longer needed.
> Face detection, multi-face detection, gaze estimation, and identity matching are all handled
> client-side by face-api.js (`useFaceProctor.ts`) — free, no API costs, no server processing.
> Live admin monitoring is implemented via `GET /proctor/live` + admin-frontend `/proctor` page.

**What was implemented instead (2026-06-26):**
- [x] `POST /proctor/enroll` + `GET /proctor/enrollment` + `POST /proctor/verify` (face enrollment + identity)
- [x] `GET /proctor/live` — all IN_PROGRESS attempts with recent events (admin live monitoring)
- [x] `useFaceProctor.ts` — browser-side: NO_FACE, MULTIPLE_FACES, LOOKING_AWAY, FACE_MISMATCH
- [x] Admin live dashboard at `admin-frontend/src/app/proctor/page.tsx`

---

### Step 2.11 — Aadhaar Module (Shell — Full after UIDAI approval)
**New module:** `backend/src/aadhaar/`

- [ ] Build UI-ready shell with mock responses first
- [ ] Swap mock for real UIDAI API after AUA registration approved

**Install:**
```bash
npm install @aws-sdk/client-kms
```

**Endpoints:**
- [ ] `POST /aadhaar/send-otp` — STUDENT, trigger UIDAI OTP (mock: always succeeds in dev)
- [ ] `POST /aadhaar/verify-otp` — STUDENT, verify OTP + encrypt + store in StudentIdentity
- [ ] `GET /admin/aadhaar/pending` — ADMIN, students awaiting verification
- [ ] `POST /admin/aadhaar/:id/manual-verify` — ADMIN, manual approval fallback

**KMS encryption for Aadhaar data:**
```typescript
// aadhaar.service.ts
async encryptData(plaintext: string): Promise<string> {
  const cmd = new EncryptCommand({ KeyId: process.env.KMS_KEY_ID, Plaintext: Buffer.from(plaintext) });
  const { CiphertextBlob } = await this.kms.send(cmd);
  return Buffer.from(CiphertextBlob!).toString('base64');
}
```

---

## Phase 3 — Frontend Work

### Step 3.1 — Student Frontend New Pages

**Install:**
```bash
cd frontend
npm install react-dropzone
```

**Pages to create:**

- [x] `frontend/src/app/exams/[id]/slots/page.tsx` ✅ done 2026-06-10
  - Grid of available time slots with seat availability counter
  - Color-coded: green (seats available) → amber (≤5 left) → red (full)
  - Existing booking banner — "Go to Instructions" or "Complete Payment" CTA
  - "Book Slot" button triggers atomic booking; free exams skip payment entirely
  - `useEffect` loads slots + existing booking in parallel

- [x] `frontend/src/app/payment/[bookingId]/page.tsx` ✅ done 2026-06-10
  - Loads `next/script` Razorpay checkout.js
  - Coupon code input with live validation (`GET /api/coupons/validate`)
  - Amount breakdown (original / discount / total)
  - Opens Razorpay modal → on success calls `POST /api/payments/verify` → redirects to success page
  - Handles payment.failed and modal dismiss gracefully

- [x] `frontend/src/app/payment/success/page.tsx` ✅ done 2026-06-10
  - Bounce-in animation on checkmark
  - Loads booking details by bookingId query param
  - Shows exam title, slot date/time, duration, CONFIRMED status badge
  - "Go to Exam Instructions" + "Back to Dashboard" CTAs
  - Handles `?alreadyConfirmed=1` redirect from already-paid bookings
  - [ ] "Download Admit Card" button — ⚠️ PENDING (needs admit card PDF service)

- [ ] `frontend/src/app/profile/setup/page.tsx`
  - 4-step wizard:
    1. Personal info (name, phone, DOB)
    2. School selection (searchable dropdown → `GET /schools/search`)
    3. Photo upload (react-dropzone → S3 presigned URL)
    4. Document upload (school ID / marksheet)
  - Progress bar showing completion %

- [ ] `frontend/src/app/profile/documents/page.tsx`
  - List uploaded documents with status badges
  - Re-upload option

- [ ] `frontend/src/app/profile/admit-card/page.tsx`
  - PDF viewer (iframe with S3 presigned URL)
  - Download button

- [ ] `frontend/src/app/notifications/page.tsx`
  - Notification list with read/unread
  - Mark all read button
  - `GET /notifications/me` → paginated list

- [ ] Add notification bell to `components/layout/Navbar.tsx`
  - Badge with unread count
  - Dropdown preview of last 5 notifications

- [ ] `frontend/src/app/parent/login/page.tsx`
- [ ] `frontend/src/app/parent/dashboard/page.tsx`
- [ ] `frontend/src/app/parent/students/[id]/page.tsx`

**Update existing `AuthGuard.tsx`:**
- [ ] Support `PARENT` role in allowedRoles

---

### Step 3.2 — Admin Frontend New Pages

**Pages to create:**

- [ ] `admin-frontend/src/app/schools/page.tsx`
  - Table: all schools with verificationStatus filter tabs (Pending / Verified / Rejected)
  - Approve / Reject buttons with confirmation modal
  - View students for each school

- [ ] `admin-frontend/src/app/schools/[id]/page.tsx`
  - School detail: students list, messages thread, stats cards

- [x] `admin-frontend/src/app/slots/page.tsx` ✅ done 2026-06-13
  - All slots grouped by exam — calls `GET /admin/slots`
  - Create slot form (exam → instance → label/times/capacity) — calls `POST /admin/slots`
  - Edit slot — calls `PUT /admin/slots/:id`
  - Delete slot (blocked if booked > 0)
  - Booking count progress bar (green/amber/red) per slot
  - View bookings modal per slot — calls `GET /admin/slots/:id/bookings`

- [x] `admin-frontend/src/app/payments/page.tsx` ✅ done 2026-06-13
  - Revenue summary cards (total ₹, paid, pending, refunded)
  - Payments table: student, exam/slot, amount, status, coupon, order ID, date — calls `GET /admin/payments`
  - Search + status filter
  - Refund button → confirmation → `POST /admin/payments/:id/refund`
  - Coupon list with usage progress bar and active/expired/exhausted status
  - Coupon creation form — calls `POST /admin/coupons`

- [x] `admin-frontend/src/app/proctor/page.tsx` ✅ done 2026-06-26 — live monitoring
  - Summary bar: total active, high risk (≥50%), medium risk, low risk
  - Student card grid: name, email, exam, elapsed time, risk score bar (green/amber/red), event pills
  - "Full Report →" links to `/analytics/attempt/[attemptId]`
  - Auto-refreshes every 15s via `GET /proctor/live?since=10`
  - Linked from admin navbar ("Live Proctor")

- [ ] `admin-frontend/src/app/students/page.tsx`
  - Pending profile verifications queue
  - Approve / Reject with reason
  - View documents

- [ ] `admin-frontend/src/app/notifications/page.tsx`
  - Template editor (subject + body with `{{variable}}` syntax)
  - Broadcast send form (filter by school, class, etc.)
  - Send history

- [ ] `admin-frontend/src/app/roles/page.tsx`
  - User list with role badges
  - Change role dropdown (SUPER_ADMIN only)

- [ ] `admin-frontend/src/app/audit/page.tsx`
  - Paginated audit log table
  - Filter by action, resource, user, date range

---

### Step 3.3 — School Portal (Add to admin-frontend)

Add `SCHOOL_ADMIN` role check to `admin-frontend/src/components/layout/AuthGuard.tsx`

**Pages to create:**

- [ ] `admin-frontend/src/app/school/dashboard/page.tsx`
  - Stats: total students / verified / paid / slot booked
  - Upcoming exam slot for school

- [ ] `admin-frontend/src/app/school/students/page.tsx`
  - Student roster with status columns
  - Filter by status
  - "Invite by Email" button

- [ ] `admin-frontend/src/app/school/students/import/page.tsx`
  - CSV upload (react-dropzone)
  - Preview parsed data
  - Confirm → `POST /admin/schools/import`

- [ ] `admin-frontend/src/app/school/slots/page.tsx`
  - Book slots for all school students at once
  - Seat availability check

- [ ] `admin-frontend/src/app/school/analytics/page.tsx`
  - School's average score vs national average
  - Top performers from school
  - Recharts bar chart

- [ ] `admin-frontend/src/app/school/messages/page.tsx`
  - Message thread with Olympiad admin team
  - Send message form

- [ ] `admin-frontend/src/app/school/certificates/page.tsx`
  - Post-results: download merit list PDF
  - Individual certificates per student

---

## Phase 4 — Third-Party Service Applications
**Apply for these NOW — they have external wait times outside your control.**

- [ ] **Razorpay KYC** — Apply at razorpay.com → business verification → get live key/secret
  - Use test keys (`rzp_test_...`) until approved
  - ETA: 3–7 business days

- [ ] **AWS SES production access** — New accounts start in sandbox (can only send to verified emails)
  - Submit "Request Production Access" in AWS console
  - ETA: 1–3 business days

- [ ] **DLT SMS Sender ID registration** — Required for transactional SMS in India
  - Register at any telecom (Airtel/Jio/Vi) DLT portal
  - Register template + sender ID `BIOOLYM`
  - ETA: 2–4 weeks

- [ ] **WhatsApp Business API** — Apply at business.whatsapp.com
  - Create business account + get approved templates
  - ETA: 1–2 weeks

- [ ] **UIDAI AUA License** — Required for Aadhaar OTP authentication
  - Apply at resident.uidai.gov.in/aua-kua-license
  - ETA: 4–8 weeks (govt process)

- [x] ~~**AWS Rekognition**~~ — Not needed; replaced by face-api.js (free, client-side) ✅ 2026-06-26

- [ ] **Domain purchase** — Buy `bharatinnovationolympiad.in` or chosen name

---

## Phase 5 — AWS Infrastructure Migration
**Do before any exam with >500 concurrent students. Current Render/Neon cannot scale.**

### Step 5.1 — AWS Account Setup
- [ ] Create AWS production account (separate from any personal account)
- [ ] Enable MFA on root account
- [ ] Create IAM user with AdministratorAccess for deployment
- [ ] Install AWS CLI + configure with IAM credentials

### Step 5.2 — VPC & Networking
```bash
# Use AWS Console or Terraform
```
- [ ] Create VPC: `10.0.0.0/16`
- [ ] Public subnets (2 AZs): `10.0.1.0/24`, `10.0.2.0/24` — for ALB
- [ ] Private subnets (2 AZs): `10.0.3.0/24`, `10.0.4.0/24` — for ECS, RDS, Redis
- [ ] Internet Gateway + route tables for public subnets
- [ ] NAT Gateway in public subnet + route for private subnets
- [ ] Security groups:
  - `alb-sg`: inbound 443 from 0.0.0.0/0
  - `ecs-sg`: inbound 4000 from alb-sg only
  - `rds-sg`: inbound 5432 from ecs-sg only
  - `redis-sg`: inbound 6379 from ecs-sg only

### Step 5.3 — RDS PostgreSQL Migration
- [ ] Provision RDS PostgreSQL 15 Multi-AZ instance (`db.r6g.xlarge`, 500GB gp3)
- [ ] Enable automated backups (7-day retention)
- [ ] Dump current Neon DB: `pg_dump $NEON_DB_URL > backup_$(date +%Y%m%d).sql`
- [ ] Restore to RDS: `psql $RDS_URL < backup_*.sql`
- [ ] Run `npx prisma migrate deploy` against RDS
- [ ] Update `DATABASE_URL` + `DIRECT_URL` env vars
- [ ] Verify connection from local machine via bastion or RDS Proxy

### Step 5.4 — ElastiCache Redis
- [ ] Provision ElastiCache Redis 7 cluster (`cache.r7g.large`)
- [ ] Update `REDIS_URL` env var
- [ ] Test timer persistence with Redis (exam timer must survive backend restart)

### Step 5.5 — Dockerize Backend + ECS Fargate
- [ ] Create `backend/Dockerfile`:
  ```dockerfile
  FROM node:20-alpine AS builder
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci
  COPY . .
  RUN npx prisma generate && npm run build

  FROM node:20-alpine
  WORKDIR /app
  COPY --from=builder /app/dist ./dist
  COPY --from=builder /app/node_modules ./node_modules
  COPY --from=builder /app/prisma ./prisma
  EXPOSE 4000
  CMD ["node", "dist/main"]
  ```
- [ ] Create ECR repository: `bio-backend`
- [ ] Push first image to ECR
- [ ] Create ECS cluster + task definition (2 vCPU, 4GB RAM)
- [ ] Create ECS service with ALB target group
- [ ] Configure auto-scaling: min 5 tasks, max 20, scale on CPU > 70%
- [ ] Set all env vars in ECS task definition (use AWS Secrets Manager for secrets)

### Step 5.6 — GitHub Actions CI/CD
- [ ] Create `.github/workflows/deploy-backend.yml`:
  - On push to `main` → build Docker image → push to ECR → update ECS service
- [ ] Create `.github/workflows/deploy-frontend.yml`:
  - On push to `main` → `vercel --prod --yes` for student + admin frontends

### Step 5.7 — Domain + SSL + CloudFront
- [ ] Request ACM wildcard certificate for `*.yourdomain.in` in `ap-south-1`
- [ ] Create Route 53 hosted zone for `yourdomain.in`
- [ ] Add DNS records:
  - `api.yourdomain.in` → ALIAS to ALB
  - `exam.yourdomain.in` → CNAME to Vercel
  - `admin.yourdomain.in` → CNAME to Vercel
- [ ] Verify ACM certificate (DNS validation)
- [ ] Configure HTTPS listener on ALB with ACM cert
- [ ] Set up DKIM/SPF/DMARC for SES email sending

### Step 5.8 — Monitoring + Alerts
- [ ] Enable CloudWatch Container Insights for ECS
- [ ] Create alarms:
  - ECS CPU > 85% → SNS → admin email
  - RDS CPU > 80% → SNS → admin email
  - ALB 5xx rate > 1% → SNS → admin email
  - ECS task count < 3 → SNS → admin email
- [ ] Create CloudWatch dashboard with: ECS CPU/memory, RDS connections, ALB request count, error rate

---

## Phase 6 — Load Testing
**Do before exam day. Non-negotiable.**

### Step 6.1 — Install k6
```bash
# Windows
winget install k6
```

### Step 6.2 — Write load test script
- [ ] Create `load-test/exam-flow.js`:
  - VU setup: login → get exam → start attempt → join WS
  - Main loop: answer question every 4 minutes (simulating 60-question 4-hour exam)
  - Background: snapshot every 30s
  - Teardown: submit

### Step 6.3 — Run tests progressively
- [ ] 100 concurrent users — baseline
- [ ] 500 concurrent users
- [ ] 1,000 concurrent users
- [ ] 2,500 concurrent users
- [ ] 5,000 concurrent users

### Step 6.4 — Performance targets (must pass before go-live)
- [ ] API p99 latency < 500ms at 5,000 VUs
- [ ] WebSocket connections stable for 4h at 5,000 VUs
- [ ] RDS CPU < 80% at peak
- [ ] Zero lost answers (all `POST /attempts/:id/answer` return 200)
- [ ] ECS auto-scaling responds within 3 minutes of spike

---

## Apply These Immediately (Parallel with Phase 1)

These have external wait times — start today, code the UI while waiting for approvals.

| Action | Where | ETA |
|---|---|---|
| Apply for Razorpay business KYC | razorpay.com/dashboard | 3–7 days |
| Apply for AWS SES production access | AWS Console → SES → Account dashboard | 1–3 days |
| Register DLT SMS sender ID `BIOOLYM` | Telecom DLT portal (Airtel/Jio) | 2–4 weeks |
| Apply for WhatsApp Business API | business.whatsapp.com | 1–2 weeks |
| Apply for UIDAI AUA license | resident.uidai.gov.in | 4–8 weeks |
| Buy domain name | GoDaddy / Google Domains | Today |
| Create AWS production account | aws.amazon.com | Today |
| ~~Enable AWS Rekognition in ap-south-1~~ | Not needed — face-api.js replaces Rekognition | — |

---

## File Connection Map

```
Student books a slot (paid exam)
  → frontend /exams/:id/slots/page.tsx
  → GET /api/slots?examId=:id → lists ExamSlot rows
  → click "Book Slot" → POST /api/slots/:slotId/book
  → $transaction: check capacity → increment booked → create Booking(PENDING)
  → returns { requiresPayment: true, amount, booking }
  → redirect to /payment/:bookingId

Payment flow
  → frontend /payment/:bookingId/page.tsx
  → GET /api/bookings/:bookingId → load booking details
  → optional: GET /api/coupons/validate?code= → validate coupon
  → POST /api/payments/create-order { bookingId, couponCode? }
  → razorpay.orders.create() → Payment row created → linked to Booking
  → returns { orderId, amount, currency, key }
  → window.Razorpay(options).open() → student pays
  → on success: POST /api/payments/verify { razorpayOrderId, razorpayPaymentId, razorpaySignature }
  → HMAC verify → Payment.status=PAID → Booking.status=CONFIRMED
  → redirect to /payment/success?bookingId=:id

Razorpay webhook (parallel/backup path)
  → POST /api/payments/webhook (raw body)
  → HMAC verify with RAZORPAY_WEBHOOK_SECRET
  → payment.captured → Payment.status=PAID + Booking.status=CONFIRMED
  → payment.failed → Payment.status=FAILED
  → refund.processed → Payment.status=REFUNDED

Exam start (slot-gated)
  → frontend /exams/:id/play/page.tsx
  → POST /api/exams/:instanceId/start
  → attempt.service.startAttempt()
  → if hasSlots > 0 AND not demo exam:
      check Booking(CONFIRMED) within slot.startsAt..slot.endsAt
      throws ForbiddenException if missing or outside window
  → creates Attempt + AttemptItems in DB

User registers
  → frontend /register/page.tsx
  → POST /auth/sync
  → auth.controller.ts → auth.service.ts → prisma User.create
  → returns JWT

Student opens exam
  → frontend /exams/[id]/instructions/page.tsx
  → GET /exams/:id (shuffled questions)
  → exam.controller.ts → exam.service.findExamById(id, userId)

Student starts exam
  → frontend /exams/[id]/play/page.tsx
  → useExamSession.startExam()
  → POST /exams/:instanceId/start
  → attempt.controller.ts → attempt.service.startAttempt()
  → Creates Attempt + AttemptItems in DB
  → Returns { attempt, exam, questions }
  → examStore.setExamSession() — restores answers from attempt.items

Timer starts
  → useSocket.ts connects WS
  → useTimer.ts → socket.emit('join-exam', { attemptId })
  → timer.gateway.ts handleJoinExam()
  → timer.service.startTimer()
  → setInterval → socket.to('attempt:X').emit('timer-tick', { remaining })
  → useTimer updates examStore.remaining

Student answers
  → examStore.saveAnswer(questionId, answer)
  → POST /attempts/:id/answer
  → attempt.service.saveAnswer() → AttemptItem.upsert

Face proctoring (client-side, every 5s)
  → useFaceProctor setInterval → requestIdleCallback → runDetection()
  → face-api.js (WebGL): tinyFaceDetector + faceLandmark68TinyNet + faceRecognitionNet
  → NO_FACE / MULTIPLE_FACES / LOOKING_AWAY / FACE_MISMATCH detected
  → POST /proctor/events { attemptId, type, details }
  → proctor.service.createEvent() → ProctorEvent.create → updateRiskScore()

Violation detected
  → useFullscreenMonitor — fullscreenchange / blur / visibilitychange
  → acquireViolationLock() — module-level 5s lock
  → registerViolation() → POST /proctor/events
  → proctor.service.createEvent() → ProctorEvent.create

Submit exam
  → attempt.service.submitAttempt()
  → For each AttemptItem: compare answer to Question.correctAnswer
  → Calculate score with negativeMarks
  → Attempt.update { status: SUBMITTED, totalScore, submittedAt }
  → sessionStorage violations cleared
  → redirect to /results
```

---

## Quick Reference — Key File Locations

| What | File |
|---|---|
| Database schema | `backend/prisma/schema.prisma` |
| All API routes | `backend/src/*/**.controller.ts` |
| JWT strategy | `backend/src/auth/strategies/jwt.strategy.ts` |
| Role guard | `backend/src/common/guards/roles.guard.ts` |
| Audit log | `backend/src/common/interceptors/audit-log.interceptor.ts` |
| WebSocket gateway | `backend/src/timer/timer.gateway.ts` |
| Exam scoring | `backend/src/attempt/attempt.service.ts` |
| Fullscreen enforcement | `frontend/src/hooks/useFullscreenMonitor.ts` |
| Exam session state | `frontend/src/store/examStore.ts` |
| API client + refresh | `frontend/src/lib/api.ts` |
| Student types | `frontend/src/types/exam.ts` |
| Python proctor | `proctor-service/main.py` |
| Local dev startup | `docker-compose.yml` |
| Render deploy config | `render.yaml` |
