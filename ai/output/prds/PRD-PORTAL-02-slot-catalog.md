# PRD-PORTAL-02: Exam Slot Catalog & Discovery (Availability)
- **Final primary project:** bio-portal | **Impacted projects:** bio-admin, bio-exam | **Phase:** P3 Portal/Commerce | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-PORTAL-02-slot-catalog.md + docs/prds/phase-1-growth-commerce/PRD-06-exam-slot-seat-reservations.md (discovery/availability portion)

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-portal
- **Impacted projects:** bio-admin, bio-exam
- **Deploy cadence:** always-on
- **Final boundary note:** Portal lists admin-published slots and exposes availability for booking and exam handoff.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Authenticated, eligible students browse open exam slots with **live seat availability** and price, scoped to their class band, then proceed to book. The catalog is an accurate, fast read-model of the admin-published slots (consuming `ExamSlotPublished` / `ExamSlotCapacityChanged` / `ExamSlotClosed`) projected by `commerce-api`. Goal: a correct, cached, eligibility-scoped catalog that never lets a student think a seat is confirmable when it is gone.

## 2. Users & Personas
- **Eligible student/parent** (logged in, profile + consent complete), filtered by class band/cohort.
- **System** (projection builder consuming admin slot events; availability reader).

## 3. User Stories
- As a student, I see exams open for my class band with available slots, dates (IST), and price.
- As a student, I see live remaining seats (or an availability bucket) so I know urgency.
- As a student, I filter by date/exam series and pick **one slot at a time** to book.
- As a student already booked for an exam, I see that state and cannot double-book the same exam/series.
- As a student without complete profile/consent, I'm prompted to finish AUTH-02/03 before holding a seat.

## 4. Functional Requirements
- **FR-1 Consume published slot catalog:** build/maintain `ExamSeriesProjection` + `ExamSlotProjection` from admin events (`ExamSlotPublished`, `ExamSlotCapacityChanged`, `ExamSlotClosed`, `ExamSnapshotPublished` for readiness). Show exams eligible for the user's band, with open slots (date/time window in IST), price (band tier or free, PORTAL-08), and **live remaining seats** or status bucket.
- **FR-2 Eligible slot list:** `GET /student/exam-series/:seriesId/slots` — return only slots eligible for the student's class/cohort; show start/end in IST, fee, status bucket, remaining-seats bucket. Hide exact internal capacity unless product chooses to show exact seats; ineligible items shown-as-ineligible or hidden (config).
- **FR-3 Live seat count:** near-real-time remaining seats reflecting **holds + confirmed** (from PORTAL-03 seat ledger). Buckets: `Available | Filling Fast | Full | Closed` derived from `capacity − heldCount − confirmedCount`.
- **FR-4 Detail view:** exam/series info, slot specifics (window, IST), SEB/proctoring requirement, fee breakdown including early-bird/coupon hint (PORTAL-08). Reflects current price (recompute at reserve/checkout).
- **FR-5 One active booking per student per exam (UI):** surface already-booked/already-held state; block double-book at the UI (hard-enforced in PORTAL-03).
- **FR-6 "Book this slot" → PORTAL-03:** initiates seat reservation; requires complete profile + consent (validated server-side at reserve).

## 5. Non-Functional
- **Perf:** catalog reads cached + fast (< 300ms p95).
- **Consistency:** seat counts eventually-consistent but the catalog **must never present a confirmable seat that is already gone** — reconcile authoritatively at reserve (PORTAL-03).
- **Security/isolation:** projection exposes only safe fields; no paper/snapshot/runtime data; eligibility enforced server-side, not just UI.
- **Localized** (Hindi/English). **India residency.**

## 6. Flows, States & Edge Cases
- **Browse → detail → book.** Slot states surfaced: `PUBLISHED → FULL → CLOSED → CANCELLED → COMPLETED` (DRAFT is admin-only, never shown).
- **Edge:** slot fills while viewing → "Book" reserve fails gracefully with alternatives; slot closed/cancelled by admin → removed or shown unavailable; user not yet ACTIVE/consented → prompt to complete AUTH-02/03; price changed between view and checkout → detail/checkout reflect current (recompute + confirm); registration window not open yet / already closed → not bookable.

## 7. Data Model & Contracts
- **Read-model entities (from admin events):**
  - `ExamSeriesProjection { id, title, classBands[], feeAmountPaise, status }`
  - `ExamSlotProjection { id, examSeriesId, startsAt, endsAt, timezone=Asia/Kolkata, capacity, heldCount, confirmedCount, registrationOpensAt, registrationClosesAt, status }`
- **Consumes (bio-admin → bio-portal):** `ExamSlotPublished`, `ExamSlotCapacityChanged`, `ExamSlotClosed`, `ExamSnapshotPublished`.
- **Availability source:** PORTAL-03 seat ledger / atomic counters (`heldCount`, `confirmedCount`).
- **APIs:** `GET /student/exam-series/:seriesId/slots`; slot-detail endpoint. Contracts in `domain-contracts`.

## 8. Out of Scope
- Reservation/hold mechanics + oversell prevention (PORTAL-03), payment (PORTAL-04), pricing/coupon rules (PORTAL-08), slot/seat/price creation (ADMIN-03), publish-snapshot mechanics (ADMIN-04).

## 9. Acceptance Criteria
- [ ] Catalog shows only band-eligible exams with open slots, correct price + live seats/bucket, times in IST.
- [ ] Already-booked/held exam shows that state; double-book blocked at UI.
- [ ] Seat counts reflect holds + confirmed within seconds; never shows a confirmable seat that is gone (reconciled at reserve).
- [ ] Closed/full/cancelled slots disappear or show unavailable.
- [ ] "Book this slot" requires complete profile + consent (server-validated) and hands off to PORTAL-03.
- [ ] Catalog load < 300ms p95 (cached).

## 10. Dependencies & Open Decisions
- Depends on ADMIN-03/04 events; PORTAL-03 seat ledger; PORTAL-08 pricing.
- **Open:** show-vs-hide ineligible items; **seat-count refresh transport (poll vs SSE/WS)**; cache aggressiveness vs freshness; whether to expose exact seats or only buckets to logged-in students; **event transport** for the admin→portal slot seam (outbox→consumer vs signed webhook vs shared bus) — see README §11.

## 11. Success Metrics
- Catalog→booking conversion; bounce on availability errors ≈ 0; catalog load time (p95); projection lag from admin publish.

## 12. Risks & Mitigations
- **Stale availability shows a phantom seat** → reconcile authoritatively at reserve; short cache TTL on counts.
- **Eligibility enforced only at UI (bypass)** → server-side eligibility check at reserve.
- **Projection drift from admin publish** → idempotent event consumption + reconciliation against admin slot state.
- **Hot demand on a single slot** → bucketed display + caching + rate limits.
