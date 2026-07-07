# PRD-PORTAL-05: Registration Confirmation, Admit Card & Notifications
- **Final primary project:** bio-portal | **Impacted projects:** bio-admin, bio-exam | **Phase:** P3 Portal/Commerce | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-PORTAL-05-booking-lifecycle-notifications.md + docs/prds/phase-1-growth-commerce/PRD-08-confirmation-admit-card-notifications.md

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-portal
- **Impacted projects:** bio-admin, bio-exam
- **Deploy cadence:** always-on
- **Final boundary note:** Portal owns confirmations/admit-card notifications; exam validates admit/check-in data.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
After backend-verified payment, students need clear, durable proof of registration: a confirmation page, a downloadable **admit card (PDF/QR)**, a receipt/invoice, timely transactional notifications (confirmation + exam reminders) via **MSG91 SMS** (+ optional email/WhatsApp-ready hooks), and a "My Exams" portal view to re-download anytime. The confirmed paid **Registration** is the record of truth and the trigger to emit `RegistrationConfirmed` to `bio-exam` (exam runtime) and `bio-admin` read models. Goal: a trustworthy "My Exams" experience + reliable, idempotent transactional messaging + a secure admit card.

## 2. Users & Personas
- **Student/parent** (manage registrations, download admit card/receipt, get reminders).
- **Support** (resend confirmation/receipt; assist with lost confirmation).
- **System** (`commerce-worker` for notifications/admit-card generation; emits `RegistrationConfirmed`).

## 3. User Stories
- As a student, immediately after verified payment I see a confirmation page (exam, class, slot date/time IST, registration code, receipt ref, instructions, what-happens-next, support).
- As a student, I download my admit card (PDF/printable) with BIO branding, my details, registration code/QR, slot, rules, and SEB/device/proctor requirements.
- As a student, I get an SMS confirmation after payment and reminders before exam day (T-7d, T-1d, T-1h).
- As a student, I see "My Exams" listing my registrations with status and can **re-download** admit card/receipt if I lose the page.
- As support, I can resend a confirmation/receipt.

## 4. Functional Requirements
- **FR-1 Confirm registration:** on verified/captured payment (PORTAL-04) → mark reservation `CONFIRMED`; create `Registration`; assign unique **registration code**; link student, slot, exam series, payment order/reservation; **emit `RegistrationConfirmed`** (exactly once — dedupe under webhook retries). Idempotent: a duplicate payment webhook does **not** create a duplicate registration.
- **FR-2 Confirmation page:** show student name, exam title, class, slot date/time **IST**, registration code, payment receipt reference, exam-instructions summary, "what happens next", support contact.
- **FR-3 Admit card (PDF / printable):** BIO branding; student details; **registration code + QR**; exam slot; rules; **SEB/device/proctor requirements if applicable**; support contact. The **QR resolves to an authenticated portal page, not public sensitive data**. Re-downloadable from "My Exams".
- **FR-4 Notifications (MSG91 SMS, DLT-compliant):** booking/registration confirmation SMS to the verified mobile; **optional** email receipt (if email available) and WhatsApp-ready hooks; **reminder schedule T-7 days, T-1 day, T-1 hour**; optional hold-expiry warning (pre-confirmation). Notification **templates versioned** and DLT-compliant; failed notifications retried via worker; **delivery tracked**.
- **FR-5 Receipt / invoice:** generate receipt and GST invoice (GST fields from ADMIN-03) with **sequential invoice numbers**; PDF download from "My Exams". Invoice correction → credit note (coordinate with PORTAL-06 refund math).
- **FR-6 "My Exams" portal view:** list + detail of registrations with status (`CONFIRMED | CANCELLED | REFUNDED | EXAM_COMPLETED`), slot/date, amount, payment ref, downloadable admit card + receipt/invoice. Mitigates lost confirmation pages.
- **FR-7 Runtime-handoff trigger:** `RegistrationConfirmed` is the event that PORTAL-07 issues durably to `bio-exam`; admit-card availability and the runtime import are kept consistent (see §10 source-of-truth note).
- **FR-8 Link to exam access:** registration → entitlement (PORTAL-07) → exam-access instructions / readiness (EXAM-01); cancelled registrations suppress reminders.

## 5. Non-Functional
- **Idempotent notifications** — exactly one confirmation SMS per confirmed registration even under webhook retries; no duplicate spam.
- **Delivery tracked + retried**; SMS failure → retry + optional email fallback.
- **Admit-card QR** is non-guessable and resolves only to an authenticated page (no PII in the QR payload).
- **Localized** (Hindi/English). **India residency.** Audited.

## 6. Flows, States & Edge Cases
- **Verified payment → confirm → confirmation page + admit card + receipt → SMS confirmation → reminders (T-7d/T-1d/T-1h) → exam day.**
- **Edge:** webhook retry → single confirmation SMS + single `RegistrationConfirmed` (dedupe); SMS failure → retry + fallback email; reminder for a cancelled/refunded registration **suppressed**; invoice correction → credit note; student loses confirmation page → re-download from "My Exams"; admit card requested before snapshot ready → still issued (registration is confirmed), runtime launch gated separately (EXAM-00).

## 7. Data Model & Contracts
- **`Registration { id, code(unique), studentId, slotId, reservationId, paymentOrderId, status(CONFIRMED|CANCELLED|REFUNDED|EXAM_COMPLETED), confirmedAt }`**
- **`NotificationJob { id, registrationId, channel(SMS|EMAIL|WHATSAPP), templateKey, status, scheduledAt, attempts }`** (versioned templates; T-7d/T-1d/T-1h reminders scheduled here)
- **`Invoice { id, registrationId/bookingId, number(sequential), amount, gst, pdfRef }`**
- **`AdmitCard { registrationId, pdfRef, qrToken }`** (qrToken → authenticated portal page)
- **Emits (bio-portal → bio-exam (with bio-admin audit/read-model copy)):** `RegistrationConfirmed` (payload defined here + carried by PORTAL-07): `{ registrationId, studentId, examSlotId, examSeriesId, classBand, profileSnapshot (runtime-needed fields only), paymentConfirmedAt }` — **no payment secrets**.
- **Consumes:** PORTAL-04 verified-payment signal; entitlement state from PORTAL-07.
- **Shared port:** MSG91 `SmsSenderPort` (same provider/port as AUTH-01 OTP).

## 8. Out of Scope
- Payment capture + signature/webhook verification (PORTAL-04); refund flows + cancellation policy (PORTAL-06); OTP SMS (AUTH-01, same MSG91 port); pricing/coupons (PORTAL-08); the durable cross-repo issuance/replay of `RegistrationConfirmed` and entitlement revocation (PORTAL-07); runtime dashboard + launch gating (EXAM-00).

## 9. Acceptance Criteria
- [ ] Paid student sees the confirmation page immediately after verified payment.
- [ ] `RegistrationConfirmed` emitted **once** per confirmed registration (dedupe under duplicate webhook); duplicate webhook does not duplicate registration.
- [ ] Admit card can be downloaded (PDF/printable) with code/QR; QR resolves only to an authenticated portal page (no public sensitive data).
- [ ] Confirmation SMS sent **once** per confirmed registration; NotificationJob created.
- [ ] Reminders fire on schedule (T-7d, T-1d, T-1h); cancelled/refunded registrations suppressed.
- [ ] "My Exams" shows accurate statuses + re-downloadable admit card + receipt/invoice.
- [ ] Invoices carry sequential numbers + GST fields.

## 10. Dependencies & Open Decisions
- Shares MSG91 `SmsSenderPort` with AUTH-01; depends on ADMIN-03 GST fields; PORTAL-07 entitlement.
- **Open:** reminder cadence finalization (T-7d/T-1d/T-1h is the union default); email/WhatsApp channels for v1; invoice/GST legal format.
- **SOURCE-OF-TRUTH (for codex, README §11 #5):** the **admit card** (portal artifact) and the **runtime registration import** (EXAM-00 `ExamRegistration`) both reference the same confirmed registration. **Decision to confirm:** the *authorization to sit* is the **imported entitlement/`ExamRegistration` in `bio-exam`** (gated by EXAM-00/02), **not** the admit-card PDF; the admit card is human-facing proof + check-in convenience only. PORTAL-07 owns the durable issuance of `RegistrationConfirmed`; this PRD owns the admit-card artifact and the human-facing confirmation. Keep them consistent (same registration code/QR token referenceable by both).

## 11. Success Metrics
- Confirmation generation latency; notification delivery success rate; `RegistrationConfirmed` delivery latency to `bio-exam`; receipt/admit-card download usage; support contacts about "did my booking go through?" → near 0.

## 12. Risks & Mitigations
- **Students lose the confirmation page** → "My Exams" with admit-card + receipt re-download.
- **Duplicate webhook double-sends SMS / duplicates registration** → idempotent confirm + `RegistrationConfirmed` dedupe + NotificationJob dedupe.
- **SMS delivery failure** → retry + email fallback; delivery tracking.
- **Admit-card QR leaks PII** → token-only QR → authenticated page; no PII in payload.
- **Admit card vs runtime import diverge as authorization** → §10 decision: runtime entitlement is the gate; admit card is proof only.
