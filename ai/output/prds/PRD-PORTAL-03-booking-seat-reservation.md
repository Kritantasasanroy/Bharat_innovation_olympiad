# PRD-PORTAL-03: Slot Booking & Seat Reservation (Atomic Holds)
- **Final primary project:** bio-portal | **Impacted projects:** bio-admin, bio-exam | **Phase:** P3 Portal/Commerce | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-PORTAL-03-booking-seat-reservation.md + docs/prds/phase-1-growth-commerce/PRD-06-exam-slot-seat-reservations.md (reservation/hold portion)

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-portal
- **Impacted projects:** bio-admin, bio-exam
- **Deploy cadence:** always-on
- **Final boundary note:** Portal owns atomic holds/booking; confirmed bookings become exam entitlements.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Reserve a seat in a chosen slot with **strong oversell prevention** while the student pays. This is the ticketing/inventory core of the portal: an **atomic seat-hold (10-min TTL)** that guarantees a paid booking gets a seat and releases unpaid holds idempotently. Seats must not oversell under concurrent booking spikes; a confirmed seat exists **only after** backend/webhook-verified payment (PORTAL-04). No waitlist in v1; a student picks **one slot at a time** and holds **one active reservation**.

## 2. Users & Personas
- **Student/parent** booking a seat.
- **System** enforcing capacity invariants and releasing expired holds (`commerce-worker`).

## 3. User Stories
- As a student, when I click "Book", a seat is held for me for 10 minutes while I pay.
- As a student, if I don't pay in time, my hold releases and the seat returns to inventory.
- As a student, I can cancel my active hold before payment and pick another slot (seat released immediately).
- As the platform, confirmed + held seats never exceed capacity (no oversell), even under 1000 concurrent hold attempts on the last seat.
- As a student, I can only hold one slot at a time and have one confirmed booking per exam/series.

## 4. Functional Requirements
- **FR-1 Seat hold (atomic):** `POST /student/slots/:slotId/reservations`. Require complete profile + consent; validate slot `PUBLISHED` and registration window open. **Atomically** decrement available seat / increment `heldCount` under a DB transaction with **row-level lock (`SELECT … FOR UPDATE`)** or atomic conditional update (or atomic Redis token + DB). Create `SeatReservation { status: HELD, expiresAt: now+10m }`. Return reservation id + payment amount (server-computed price, PORTAL-08). **Emit `SeatReservationHeld`.**
- **FR-2 Idempotency / re-entrancy:** a **reservation idempotency key** prevents double-click duplicate holds; re-clicking returns the existing HELD reservation (idempotent), never stacks.
- **FR-3 Invariants:** `confirmedCount + heldCount ≤ capacity` (no oversell); **one active hold per student** (no duplicate active reservation for same student/series); **one confirmed booking per student per exam/series**.
- **FR-4 Hold expiry (worker):** `commerce-worker` finds `HELD` or `PAYMENT_INITIATED` reservations past `expiresAt` **without captured payment**, marks `EXPIRED` **idempotently**, releases the seat, and **emits `SeatReservationExpired`**. Durable job (BullMQ) — survives server restart/crash; TTL still releases.
- **FR-5 State transitions:** `HELD → PAYMENT_INITIATED` (order created, PORTAL-04) → `CONFIRMED` **only via verified/captured payment**; `HELD/PAYMENT_INITIATED → EXPIRED` on timeout; `→ CANCELLED` on user cancel before payment; `→ FAILED` on payment failure. Confirmation (`RegistrationConfirmed`) is owned by PORTAL-04/05/07, not here.
- **FR-6 Change slot before payment:** student cancels active hold → seat released immediately → may hold another slot. **Post-payment self-service slot change is NOT allowed in Phase 1** (support/admin workflow later).
- **FR-7 Capacity reconcile with admin (`ExamSlotCapacityChanged`):** raising capacity adds seats; lowering is blocked below `confirmedCount + heldCount` (cannot strand booked seats).
- **FR-8 Payment grace:** reservation may extend to `PAYMENT_INITIATED` with a defined grace window so a late-but-captured payment can still confirm — but **never confirm without captured payment** (reconciliation policy, PORTAL-04).

## 5. Non-Functional
- **No oversell under concurrency** — load-tested with ≥1000 simultaneous reservations on the last seat; exactly one HELD wins.
- **Hold release reliable + idempotent**; durable worker survives restart.
- **Lock contention** bounded and observable (metric).
- **Security:** ownership checks (reservation belongs to current student) on every reservation path; deny-by-default.
- **India residency.** Audited (all booking/reservation actions).

## 6. Flows, States & Edge Cases
- **Reserve → pay → confirm.**
- **Slot states (mirrored from catalog):** `DRAFT(admin) → PUBLISHED → FULL → CLOSED → CANCELLED → COMPLETED`.
- **Reservation states:** `HELD → PAYMENT_INITIATED → CONFIRMED | EXPIRED | CANCELLED | FAILED`.
- **Edge:** two students race for the last seat → exactly one HELD, other gets "sold out" + alternatives; payment succeeds **after** hold expired but seat still free → confirm; payment succeeds after seat taken by another → **no oversell → auto-refund (PORTAL-06)** + apology; user abandons → auto-release at TTL; server crash mid-hold → durable TTL job still releases; duplicate hold request with same idempotency key → same reservation; hold on closed/full slot → rejected; hold without profile/consent → rejected; payment authorized late while hold near-TTL → `PAYMENT_INITIATED` grace + reconciliation.

## 7. Data Model & Contracts
- **`SeatReservation { id, studentId, slotId, status(HELD|PAYMENT_INITIATED|CONFIRMED|EXPIRED|CANCELLED|FAILED), amountPaise, currency=INR, idempotencyKey, expiresAt, createdAt }`**
- **Seat ledger / atomic counters per slot:** `ExamSlotProjection.{capacity, heldCount, confirmedCount}` (authoritative inventory; shared read with PORTAL-02).
- **Emits (bio-portal internal + bio-admin audit/read-model):** `SeatReservationHeld`, `SeatReservationExpired`. (Internal portal signals: `booking.held`, `booking.released`.)
- **APIs:** `POST /student/slots/:slotId/reservations` (hold), cancel-hold endpoint. Contracts in `domain-contracts`.

## 8. Out of Scope
- Payment execution + signature/webhook verification (PORTAL-04), refund mechanics (PORTAL-06), registration confirmation + admit card + notifications (PORTAL-05), entitlement issuance/sync (PORTAL-07), pricing/coupon calc (PORTAL-08), slot creation (ADMIN-03).

## 9. Acceptance Criteria
- [ ] Concurrent last-seat reservations never oversell (load test ≥1000 concurrent; oversell count = 0).
- [ ] Two students cannot claim the same final seat beyond capacity.
- [ ] Hold expires in 10 min and returns the seat automatically (durable, survives restart); `SeatReservationExpired` emitted idempotently.
- [ ] Duplicate hold request with same idempotency key returns the same reservation (no stacking).
- [ ] One active hold per student; one confirmed booking per student per exam/series.
- [ ] HELD→CONFIRMED only via verified/captured payment; never confirmed without captured payment.
- [ ] Student cannot hold a closed/full slot or hold without profile/consent.
- [ ] Cancelling an active hold before payment releases the seat immediately.
- [ ] `SeatReservationHeld` emitted on successful hold.

## 10. Dependencies & Open Decisions
- Depends on PORTAL-02 catalog/ledger; PORTAL-08 price; PORTAL-04 confirmation trigger.
- **Open:** locking strategy (DB row-lock vs Redis token + DB) for v1; final hold TTL value (10 min default); precise `PAYMENT_INITIATED` grace duration and pay-after-expiry behavior; event transport for `SeatReservation*` (outbox→consumer vs bus) — see README §11.

## 11. Success Metrics
- **Oversell count = 0** (hard gate); hold→payment (and hold→confirm) conversion; expired-hold / abandoned-hold rate; active holds; reservation lock contention.

## 12. Risks & Mitigations
- **Payment takes longer than hold TTL** → `PAYMENT_INITIATED` grace state + reconciliation; never confirm without captured payment.
- **Race oversell under concurrency** → atomic row-lock / conditional update; invariant `confirmed+held ≤ capacity`; load test gate.
- **Server crash strands a hold** → durable BullMQ TTL release (idempotent).
- **Double-click duplicate holds** → idempotency key returns existing reservation.
- **Admin lowers capacity below booked** → block below `confirmed+held`.
