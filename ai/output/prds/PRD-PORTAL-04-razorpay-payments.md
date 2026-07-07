# PRD-PORTAL-04: Razorpay Payments (Checkout, Verify, Webhooks, Reconciliation)
- **Final primary project:** bio-portal | **Impacted projects:** bio-admin, bio-exam | **Phase:** P3 Portal/Commerce | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-PORTAL-04-razorpay-payments.md + docs/prds/phase-1-growth-commerce/PRD-07-razorpay-payments.md

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-portal
- **Impacted projects:** bio-admin, bio-exam
- **Deploy cadence:** always-on
- **Final boundary note:** Portal owns payment/order/webhook/reconciliation; admin reads revenue, exam receives paid entitlement only.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Collect exam fees securely via **Razorpay**, confirming the held reservation **only on backend-verified, captured payment**. Frontend payment success is **never trusted alone**. Goal: a robust, idempotent, webhook-driven flow with server-side signature verification and reconciliation — no confirmed registration without verified payment, no double-charge, no double-confirm.

## 2. Users & Personas
- **Student/parent** (payer).
- **Finance/Ops** (reconciliation, refunds eligibility — see PORTAL-06).
- **System** (webhooks, reconciliation worker).

## 3. User Stories
- As a student, I pay the fee via Razorpay Checkout (UPI/card/netbanking) and my seat confirms.
- As a student, if payment fails/cancels, I get retry/change-slot options within the hold TTL, or my hold releases.
- As finance, every payment reconciles to a reservation/registration with an auditable trail.
- As the platform, I never confirm on an unverified client callback alone; the captured webhook is the source of truth.

## 4. Official Vendor Facts (embed — verified)
- **Razorpay CLI** supports orders, payments, refunds, payment links, structured output, test/live credentials — used in dev/stage ops for inspection/automation: https://razorpay.com/cli/
- **Standard Checkout** (web integration) returns `razorpay_payment_id`, `razorpay_order_id`, `razorpay_signature`; **server must verify the signature**: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
- **Orders API** creates orders with `amount` (smallest currency subunit = paise), `currency`, `receipt`, `notes`: https://razorpay.com/docs/api/orders/create/
- **Webhooks** notify payment-flow events asynchronously; signature validation uses **`X-Razorpay-Signature` = HMAC-SHA256 over the raw request body**: https://razorpay.com/docs/webhooks/

## 5. Functional Requirements
- **FR-1 Create payment order (server-side):** `POST /student/reservations/:reservationId/payment-order`. Require reservation belongs to current student and is active/not-expired. Create internal `PaymentOrder` with idempotency key; call Razorpay **Orders API** with `amount` (server-computed final price in paise, PORTAL-08), `currency=INR`, `receipt=reservationId`/registration receipt, `notes`. Store `razorpayOrderId`; mark reservation `PAYMENT_INITIATED` (PORTAL-03). Return checkout config (public key id + order id, amount, exam title, slot time, student name).
- **FR-2 Checkout (frontend):** load Razorpay Checkout script **only on the payment step**; show amount/exam/slot/student. On success → send `razorpay_payment_id`/`razorpay_order_id`/`razorpay_signature` to backend. On failure/cancel → retry / change-slot. **Never mark registration confirmed in the frontend.**
- **FR-3 Verify checkout success (server):** `POST /student/payments/verify-checkout`. Fetch internal `PaymentOrder` by server-side order id; **verify HMAC signature** with the secret; optionally fetch payment/order from Razorpay for immediate confirmation. If captured/authorized per capture policy → mark payment success and **confirm registration idempotently**; **emit `PaymentCaptured`** (and trigger `RegistrationConfirmed` via PORTAL-05/07).
- **FR-4 Webhook receiver (authoritative):** `POST /webhooks/razorpay`. Use **raw body** for signature; validate `X-Razorpay-Signature`; store webhook `eventId` for dedupe; process **idempotently**; update payment state; confirm/reconcile registration whether the webhook arrives **before or after** the checkout-verify callback. Minimum events: `order.paid`, `payment.authorized`, `payment.captured`, `payment.failed`, `refund.processed` (refunds → PORTAL-06).
- **FR-5 Idempotency:** order/payment keyed to reservation; duplicate webhooks/callbacks are safe → **one confirmation per reservation, no double-charge, no double-confirm**.
- **FR-6 Confirm-on-verified-capture:** on verified capture within hold TTL (or grace) → `SeatReservation: HELD/PAYMENT_INITIATED → CONFIRMED` (PORTAL-03) → registration confirmed → entitlement issued (PORTAL-07) → receipts/notifications/admit card (PORTAL-05).
- **FR-7 Reconciliation worker (`commerce-worker`):** periodically find stale `PaymentOrder`s in uncertain states; fetch Razorpay order/payments; update internal status; **release expired reservation if unpaid**; flag mismatches for finance/admin review (`RECONCILIATION_REQUIRED`).
- **FR-8 Edge handling:** payment captured **after** hold expired but seat still free → confirm; **seat lost** (taken by another) → **auto-refund (PORTAL-06)**; partial/failed capture → not confirmed.
- **FR-9 Webhook endpoint authenticated** (Razorpay signature); use **Razorpay CLI** for local/staging webhook testing and order/payment/refund inspection. **Never store live key secret in shell history/run logs.**

## 6. Non-Functional / Security
- **Keys server-side only** — Razorpay key secret never exposed client-side; only public key id reaches the browser.
- **Webhook signature verified over raw body**; reject on mismatch (fail-closed).
- **PCI handled by Razorpay** — no card data stored.
- **Idempotency under retries** everywhere; **frontend success never trusted alone**.
- **India entity/settlement**; everything **audited**.

## 7. Flows, States & Edge Cases
- **Order → checkout → webhook captured → confirm.**
- **Payment states:** `ORDER_CREATED → CHECKOUT_OPENED → PAYMENT_AUTHORIZED → PAYMENT_CAPTURED | PAYMENT_FAILED | PAYMENT_CANCELLED`; `REFUND_INITIATED → REFUND_PROCESSED` (PORTAL-06); `RECONCILIATION_REQUIRED`.
- **Edge:** client says success but webhook never arrives → API verify for user-facing confirmation + webhook as source of truth + reconciliation; webhook arrives **before** client returns → confirm regardless; `order.paid` webhook arrives but checkout callback missed → still confirms registration; duplicate webhook → idempotent no-op; capture-after-seat-lost → auto-refund (no oversell); seat hold expires while payment authorized late → grace state + reconciliation policy; live-mode domain/KYC issues → go-live checklist + live-key smoke before launch.

## 8. Data Model & Contracts
- **`PaymentOrder { id, reservationId, studentId, razorpayOrderId, receipt, amountPaise, currency=INR, status, idempotencyKey, createdAt, updatedAt }`**
- **`PaymentAttempt { id, paymentOrderId, razorpayPaymentId, razorpaySignatureVerifiedAt, status, rawStatus, failureCode, failureDescription }`**
- **`RazorpayWebhookEvent { eventId, eventType, signatureValid, processedAt, rawPayloadRef? }`** (dedupe store)
- **`Refund { … }`** — defined in PORTAL-06.
- **Emits (bio-portal → bio-admin (revenue/audit) and bio-exam via PORTAL-07 entitlement):** `PaymentCaptured` (and triggers `RegistrationConfirmed` via PORTAL-05/07). Internal: `payment.failed`, `booking.confirmed`, `entitlement.issue`.
- **APIs:** `POST /student/reservations/:reservationId/payment-order`, `POST /student/payments/verify-checkout`, `POST /webhooks/razorpay`.

## 9. Out of Scope
- Seat-hold mechanics + oversell prevention (PORTAL-03); refund processing + cancellation policy (PORTAL-06); confirmation page + admit card + notifications (PORTAL-05); entitlement sync (PORTAL-07); coupon/pricing calc (PORTAL-08); subscriptions / EMI / affiliate coupons / marketplace split settlements (non-goals).

## 10. Acceptance Criteria
- [ ] Registration confirms **only on server-verified, captured payment** (signature + webhook), never client-callback alone.
- [ ] Payment order cannot be created for an expired reservation.
- [ ] Checkout success **without a valid signature** does not confirm registration.
- [ ] Duplicate webhooks/callbacks are idempotent — one confirmation, no double-charge, no double-confirm.
- [ ] `order.paid` webhook confirms registration if the checkout callback is missed.
- [ ] Reconciliation resolves stale payment state and releases unpaid expired reservations.
- [ ] Capture-after-seat-lost triggers auto-refund (PORTAL-06); no oversell.
- [ ] Razorpay key secret never exposed client-side; webhook signature enforced over raw body.
- [ ] Razorpay test-mode flow documented (CLI inspection); reconciliation report matches orders↔payments↔reservations/registrations.

## 11. Dependencies & Open Decisions
- Razorpay account (India), webhook secret, settlement entity; PORTAL-08 final price; PORTAL-03 reservation state; PORTAL-05/07 confirmation + entitlement.
- **Open:** payment methods enabled; capture policy (auto-capture vs authorize-then-capture); precise pay-after-expiry handling; partial-refund policy (PORTAL-06).

## 12. Risks & Mitigations
- **Webhook delayed** → immediate API verification for user-facing confirmation + webhook as source of truth + reconciliation.
- **Seat hold expires while payment authorized late** → reservation grace state + reconciliation policy.
- **Live-mode domain/KYC issues** → go-live checklist + live-key smoke test before launch.
- **Key/secret leakage** → server-only secret, never in logs/shell history; rotate on suspicion.
- **Double-charge / double-confirm** → idempotency keys + webhook eventId dedupe.

---

## 13. Final Codex Augmentation — Payment/Event Boundary

- Razorpay webhooks remain signed external vendor inputs; internal commerce→core propagation uses O4 outbox transport.
- `PaymentCaptured` may be internal commerce event; the cross-repo launch-critical contract is `RegistrationConfirmed` after payment, reservation, profile, and consent are valid.
- Late capture after seat loss auto-refunds through PORTAL-06 and must not emit `RegistrationConfirmed`.
- Local/stage test harness must include Razorpay CLI webhook replay, duplicate webhook, out-of-order webhook, and raw-body signature failure cases.
