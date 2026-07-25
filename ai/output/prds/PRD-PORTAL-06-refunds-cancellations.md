# PRD-PORTAL-06: Refunds & Cancellations
- **Final primary project:** bio-portal | **Impacted projects:** bio-admin, bio-exam | **Phase:** P3 Portal/Commerce | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-PORTAL-06-refunds-cancellations.md + docs/prds/phase-1-growth-commerce/PRD-07-razorpay-payments.md (refunds portion)

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-portal
- **Impacted projects:** bio-admin, bio-exam
- **Deploy cadence:** always-on
- **Final boundary note:** Portal owns refund/cancellation money flows and entitlement revocation events.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Handle money-back scenarios fairly and automatically where required: **oversell-loss auto-refunds**, admin/support-initiated cancellations (e.g. slot scrapped), and policy-based student cancellations. Goal: a reliable, **idempotent**, auditable refund flow via the **Razorpay Refunds API** that keeps seat inventory consistent, revokes the entitlement, and reconciles to settlement.

## 2. Users & Personas
- **Student** (request cancellation per published policy).
- **Ops/Finance/Support** (initiate/oversee refunds, bulk slot cancellation, reconciliation).
- **System** (auto-refunds on seat-loss; refund status tracking via webhook).

## 3. User Stories
- As a student whose payment succeeded but seat was lost to a race, I'm **auto-refunded fully** with notice (seat already returned).
- As a student, I can cancel per the published refund policy and get the eligible amount back.
- As ops/support, I can cancel a slot/booking (slot scrapped) and trigger refunds in bulk, releasing seats + notifying.
- As finance, every refund is auditable, has a required reason, and reconciles with Razorpay.

## 4. Functional Requirements
- **FR-1 Auto-refund (capture-after-seat-lost):** for the PORTAL-03/04 edge where payment captured but the seat was already taken → **full-amount, immediate** refund; seat already returned to inventory. No oversell.
- **FR-2 Policy-based student cancellation:** refund tiers by **time-to-exam** (configurable per exam policy); compute the eligible amount; account for applied discounts/coupons (PORTAL-08) in the refund math.
- **FR-3 Admin/support-initiated cancellation:** cancel a slot/booking → **bulk refunds** + **seat release** + notifications. Refund **reason required**.
- **FR-4 Razorpay Refunds API integration:** initiate refund, track status via Razorpay API + `refund.processed` webhook (PORTAL-04) to settlement; **idempotent** (no double-refund); use **Razorpay CLI** to inspect refunds in dev/stage.
- **FR-5 On any cancellation/refund:** release seat (if applicable, PORTAL-03), **revoke entitlement** (PORTAL-07), notify (PORTAL-05), and **audit**; update `Registration.status → CANCELLED`/`REFUNDED`.
- **FR-6 Reconciliation incl. refunds:** refunds included in the reconciliation report (orders ↔ payments ↔ refunds ↔ registrations); refund failure at Razorpay → retry + alert finance.
- **FR-7 Emit events:** **`RefundProcessed`** and **`RegistrationCancelled`** (bio-portal → bio-exam (revocation) + bio-admin (audit/revenue)) so the entitlement/`ExamRegistration` is revoked downstream.

## 5. Non-Functional
- **Idempotent refunds** (no double-refund); duplicate refund request → idempotent no-op.
- **Auditable** (reason + actor + trail). **Refund SLA visibility** to the user.
- **India settlement.** Entitlement revoke is **guarded** if the exam has already started (see edge cases).

## 6. Flows, States & Edge Cases
- **Trigger → refund (Razorpay) → seat/entitlement update → notify → reconcile.**
- **Refund/payment states (shared with PORTAL-04):** `REFUND_INITIATED → REFUND_PROCESSED`; `RECONCILIATION_REQUIRED` on mismatch.
- **Edge:** refund of an **already-attempted** exam → block or limit per policy (guarded); **partial refund** by policy tier; duplicate refund request → idempotent; refund failure at Razorpay → retry + alert; **entitlement revoke after exam started** → guarded (do not revoke an in-progress/completed attempt without explicit ops override); coupon/discounted booking → refund computed on the actual paid amount.

## 7. Data Model & Contracts
- **`Refund { id, registrationId, paymentId/paymentOrderId, razorpayRefundId, amountPaise, reason, status, createdAt }`**
- **Updates:** `Registration.status (CANCELLED | REFUNDED)`; `SeatReservation`/slot ledger seat release.
- **Emits (bio-portal → bio-exam (revocation) + bio-admin (audit/revenue)):** `RefundProcessed`, `RegistrationCancelled`. Internal: `entitlement.revoked` (drives PORTAL-07 revoke sync).
- **Consumes:** Razorpay `refund.processed` webhook (PORTAL-04); PORTAL-03 seat ledger; PORTAL-08 paid-amount/coupon context.

## 8. Out of Scope
- Payment capture + order/checkout (PORTAL-04); notification templates/admit card (PORTAL-05); coupon/pricing definition (PORTAL-08); the durable entitlement-revoke replay/reconciliation mechanics (PORTAL-07 owns the cross-repo sync).

## 9. Acceptance Criteria
- [ ] Capture-after-seat-lost auto-refunds **fully**; seat consistent; no oversell.
- [ ] Policy cancellation computes the correct eligible amount by time-to-exam (and respects coupon/discount math).
- [ ] Admin/support bulk slot cancellation refunds + releases seats + notifies; reason recorded.
- [ ] Refunds **idempotent** (no double-refund); duplicate refund request is a no-op.
- [ ] Entitlement revoked on cancellation/refund (`RegistrationCancelled` + `RefundProcessed` emitted); guarded for already-started/attempted exams.
- [ ] All refunds audited; refund reconciliation matches Razorpay 100%.

## 10. Dependencies & Open Decisions
- Depends on PORTAL-04 refund webhook + Razorpay account; PORTAL-03 seat ledger; PORTAL-07 revoke sync; PORTAL-08 paid-amount context.
- **Open:** refund policy tiers (legal/business); refund-after-attempt rules; partial-refund math with coupons; whether students get self-service cancellation in v1 or support-only.

## 11. Success Metrics
- Auto-refund correctness 100%; refund reconciliation 100%; refund volume; refund-related complaints low; signature/refund-failure retry success rate.

## 12. Risks & Mitigations
- **Double-refund** → idempotency keys + Razorpay refund-id dedupe.
- **Revoking an in-progress attempt** → guard revoke when exam started; require ops override.
- **Refund failure at Razorpay** → retry + finance alert + `RECONCILIATION_REQUIRED`.
- **Coupon/partial-refund miscalculation** → compute on actual paid amount; audit discount lineage from PORTAL-08.
