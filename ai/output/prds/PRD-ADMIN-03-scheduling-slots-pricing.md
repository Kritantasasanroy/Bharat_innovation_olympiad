# PRD-ADMIN-03: Exam Scheduling, Slots, Seats & Pricing
- **Final primary project:** bio-admin | **Impacted projects:** bio-portal, bio-exam | **Phase:** P2 Admin/Curator | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-ADMIN-03-scheduling-slots-pricing.md + docs/prds/phase-2-admin-ops/PRD-12-admin-slot-schedule-management.md

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-admin
- **Impacted projects:** bio-portal, bio-exam
- **Deploy cadence:** admin/curation/results/ops; low baseline outside exams, scale for authoring/results/ops
- **Final boundary note:** Admin owns schedule/slot/pricing source of truth; portal consumes catalog, exam consumes runtime windows.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Admins open **seat-limited slots** (sittings) for an APPROVED exam, configure registration windows and exam policies, and set **price per exam by class-band tier** (free + paid both supported). Goal: define the schedule + seat inventory + pricing + policy that the portal catalog consumes (via ADMIN-04 publish), that gates bookings (PORTAL-03) and attempts (EXAM-02), and that **prevents dangerous changes after registrations begin**. A "slot" (`ExamInstance`) = an exam sitting: a date/time window + seat capacity + registration window. Commerce (bio-portal) receives a **public/student-safe projection** only.

## 2. Users & Personas
- **Scheduler** — creates/manages slots, sets capacity, registration windows, fees, policies.
- **Super Admin** — overrides (e.g., capacity decrease below held), governance.
- **Analyst** — monitors seat fill and revenue.

## 3. User Stories
- As a scheduler, I create one or many slots (date/time windows, IST/`Asia/Kolkata`) for an APPROVED exam/paper version, each with a seat capacity and a registration open/close window.
- As a scheduler, I set the exam **price by class-band tier** (or mark free), in INR/paise, with GST/tax fields and early-bird/coupon hooks (PORTAL-08).
- As a scheduler, I configure SEB-required, proctor-required, duration, allowed cohorts/schools (optional), and refund/cancellation policy per slot.
- As a scheduler, I can increase capacity anytime before the exam, but cannot decrease it below confirmed registrations; decreasing below held+confirmed warns/requires super admin.
- As a scheduler, I can close registration early without cancelling paid registrations.
- As an analyst, I see seat fill (capacity vs held vs confirmed) and revenue per slot in near-real-time.

## 4. Functional Requirements
- **FR-1 (Create slot):** Slot/`ExamInstance` CRUD with fields: exam series, **paper version** (must be APPROVED), class band(s), `startsAt`/`endsAt` + timezone `Asia/Kolkata` (IST), duration minutes, registration opens/closes, **seatCapacity**, fee amount (paise) + currency INR, SEB-required, proctor-required, refund/cancellation policy, allowed cohorts/schools (optional), `requireSeb` + BEK/configKey for SEB.
- **FR-2 (Pricing on the exam/offering):** base price + **class-band tiers**; `isFree`; INR currency; tax/GST fields. Early-bird/coupon hooks delegated to PORTAL-08. Price change after bookings applies **only to new bookings** (existing honored).
- **FR-3 (Capacity management):** initial capacity set by scheduler; **capacity may be increased** anytime before the exam; **decrease below confirmed registrations is blocked**; decrease below held+confirmed warns and requires super admin. Seat capacity is the published max; actual atomic allocation is owned by the portal (PORTAL-03) and reconciles back. **Every capacity change is audited** and emits `ExamSlotCapacityChanged`.
- **FR-4 (Eligibility/booking constraints):** only APPROVED exams are schedulable; **one active booking per student per exam** is enforced downstream (PORTAL-03) — admin sets the rule flag here; class eligibility and cohort/school restriction expressed on the slot.
- **FR-5 (Slot lifecycle & publish to commerce):** lifecycle `DRAFT → OPEN → CLOSED → COMPLETED`. Slot publish emits **`ExamSlotPublished`** with the public projection; commerce stores it for discovery/booking; later updates emit **`ExamSlotCapacityChanged`** / **`ExamSlotClosed`**. Slot is **visible to public only after publish**; bookable only within the registration window and while seats available. (Exam-package publish/snapshot is ADMIN-04.)
- **FR-6 (Registration window rules):** admin can close registration early; **closing registration does not cancel paid registrations**; closing a slot mid-window stops new bookings but leaves existing attempts/entitlements unaffected.
- **FR-7 (Conflict detection):** warn on overlapping slots for same paper/class (distinct sittings still allowed); warn if start time is too soon for reminder/proctor setup; warn/block if the paper is not APPROVED.
- **FR-8 (Bulk slot creation):** create recurring windows in bulk.

## 5. Non-Functional (perf, security, scale, DPDP)
- Capacity/price/policy changes audited (PLAT-04). IST/`Asia/Kolkata` handling correct (DST n/a for India). Near-real-time fill/revenue metrics from read-models (ADMIN-06).
- **Security:** deny-by-default RBAC; only SCHEDULER/SUPER_ADMIN mutate; capacity reduction is a dangerous action requiring fresh-session/re-auth (AUTH-04). Commerce receives **only the student-safe projection** (no keys, no internal-only fields).
- Strict post-registration edit rules + notification workflows for changes affecting paid students.

## 6. Flows, States & Edge Cases
- **Flow:** create slots → set price/policy → publish (`ExamSlotPublished`) → OPEN → monitor fill → CLOSE (`ExamSlotClosed`) → COMPLETED.
- **Edges:** lower capacity below confirmed → blocked; below held+confirmed → super-admin-gated warning; overlapping slots same exam → allowed (distinct sittings) with a warning; price change after bookings → new bookings only; closing a slot mid-window → no new bookings, existing attempts unaffected; slot cannot publish without capacity, fee, and registration window set.

## 7. Data Model & Contracts (entities, named events, APIs)
- **Entities:**
  - `ExamInstance`/`Slot { id, examId, paperVersionId, bands[], startsAt, endsAt, timezone, durationMinutes, registrationOpensAt, registrationClosesAt, seatCapacity, feeAmountPaise, currency, requireSeb, bek, configKey, requireProctor, refundPolicy, allowedCohorts?, status }`
  - `ExamPricing { examId, band, amountPaise, isFree, earlyBird?, gst? }`
- **Named events (bio-admin admin → bio-portal, verbatim):** `ExamSlotPublished` (public projection: slot window, capacity, fee/tier, registration window, policy flags), `ExamSlotCapacityChanged`, `ExamSlotClosed`. Pricing tiers travel inside the published projection / `SlotCatalog` (ADMIN-04). The exam **snapshot** publish (`ExamSnapshotPublished`) is ADMIN-04.
- **APIs (`admin-api`):** `POST/PATCH/GET /slots`, `POST /slots/:id/publish`, `POST /slots/:id/close`, `PATCH /slots/:id/capacity`, `POST /slots/bulk`, `GET/PATCH /exams/:id/pricing`.

## 8. Out of Scope
- Booking/seat-allocation atomicity + 10-min hold (PORTAL-03). Payment (PORTAL-04). Coupon mechanics/early-bird math (PORTAL-08). Exam-package snapshot publish (ADMIN-04).

## 9. Acceptance Criteria
- [ ] Slots created with capacity + window + registration window + SEB/proctor config for an **APPROVED** exam/paper version only.
- [ ] Exam price set by band (or free) in INR/paise; reflected in the published catalog projection.
- [ ] Slot cannot publish without capacity, fee, and registration window.
- [ ] Published slot appears in the commerce projection fixture; `ExamSlotPublished` emitted on publish.
- [ ] **Capacity cannot be lowered below current confirmed count**; below held+confirmed requires super admin; every capacity change audited and emits `ExamSlotCapacityChanged`.
- [ ] Slot lifecycle transitions publish/close catalog entries (`ExamSlotPublished`/`ExamSlotClosed`); closing registration does not cancel paid registrations.
- [ ] All schedule mutations audited.

## 10. Dependencies & Open Decisions
- Depends on ADMIN-02 (approved paper), AUTH-04 (RBAC), PLAT-02 (event contracts), event transport (see README §11.4).
- **Open:** GST/tax handling specifics; recurring-slot rules; per-slot vs per-exam price override; concrete event transport (outbox→consumer vs signed webhook vs shared bus) for the slot-catalog seam; exact public-projection field list.
- **Note (theirs adds):** registration open/close windows, refund/cancellation policy on slot, allowed cohorts/schools, conflict detection (overlap/too-soon/not-approved), held-vs-confirmed capacity tiering with super-admin gate, the verbatim `ExamSlotPublished/CapacityChanged/Closed` events, fee in paise. **Mine adds:** explicit class-band price tiers + free, IST correctness, bulk recurring slots, one-booking-per-student flag, SEB BEK/configKey carriage.

## 11. Success Metrics
- Seat fill rate (confirmed/capacity); registration-window conversion; time to open a slot set.
- Slots by status; capacity vs confirmed/held.
- 0 capacity/booking inconsistencies; 0 post-publish leaks of internal fields.

## 12. Risks & Mitigations
- **Admin changes a slot after students pay** → strict post-registration edit rules, super-admin gate on capacity decrease, mandatory notification workflows, audit.
- **Oversell via capacity edits** → portal owns atomic allocation; admin capacity is a ceiling that cannot drop below booked; reconciliation job.
- **Timezone/DST errors** → fixed `Asia/Kolkata`, store UTC + IST display, validation on windows.
- **Stale/over-broad projection to commerce** → student-safe projection only; capacity/close changes propagate via the named events.

---

## 13. Final Codex Augmentation — Slot Catalog Source of Truth

- ADMIN-03 owns authoritative slot/schedule/capacity state and emits `ExamSlotPublished`, `ExamSlotCapacityChanged`, and `ExamSlotClosed` through O4 outbox transport.
- Portal may use stub slot-catalog fixtures during parallel development only; production booking must consume ADMIN-03/04-produced projections.
- Slot cannot become exam-start-ready until ADMIN-04 snapshot publish/import succeeds and the runtime import status projection is healthy.
- Capacity changes after portal holds exist must produce idempotent reconciliation jobs, not direct cross-DB mutation.
