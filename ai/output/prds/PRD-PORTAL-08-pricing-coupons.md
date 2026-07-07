# PRD-PORTAL-08: Pricing, Coupons & Early-Bird
- **Final primary project:** bio-portal | **Impacted projects:** bio-admin | **Phase:** P3 Portal/Commerce | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-PORTAL-08-pricing-coupons.md (theirs folds pricing into PRD-06/07; pricing/discount bits pulled in — see §10)

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-portal
- **Impacted projects:** bio-admin
- **Deploy cadence:** always-on
- **Final boundary note:** Portal owns coupon/early-bird math while admin owns base slot price/policy.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Support flexible-but-simple, **server-authoritative** pricing: per-exam base price by **class-band tier**, **free exams**, **early-bird windows**, and **coupon codes** — without over-engineering. Goal: a clear price-calculation step before payment that admins configure (ADMIN-03) and students apply codes to; the amount sent to Razorpay (PORTAL-04) is always the **server-computed** final price (never client-trusted); free/₹0 short-circuits payment straight to confirm + entitlement.

## 2. Users & Personas
- **Student** (sees correct price, applies coupon, sees final price).
- **Admin** (defines base price/tiers, coupons, early-bird windows — ADMIN-03).
- **Finance** (oversight; every discount auditable + reconciles with payments).

## 3. User Stories
- As a student, I see the correct price for my class band, with any early-bird discount **auto-applied** in-window.
- As a student, I enter a coupon code and see the adjusted price **before** paying.
- As a student booking a free exam (or where a coupon makes it ₹0), I skip payment and go straight to confirmation.
- As an admin, I create coupons (percent/flat, limits, validity, applicability) and early-bird windows.
- As finance, every discount is auditable and reconciles with payments/refunds.

## 4. Functional Requirements
- **FR-1 Pricing resolution:** base price by exam × **class-band tier** (ADMIN-03). `isFree` (or computed ₹0) **short-circuits**: no payment → straight to registration confirm + entitlement (PORTAL-05/07).
- **FR-2 Early-bird:** time-windowed **automatic** discount per exam/slot.
- **FR-3 Coupons:** `code`, `type (percent|flat)`, `maxDiscount`, usage limits (global + per-user), validity window, applicability (exam/band); **stackable = false** (simple). Validation: expired/invalid/over-limit coupon rejected with clear messaging.
- **FR-4 Server-authoritative price:** price calc runs server-side; the **amount sent to Razorpay (PORTAL-04) is the server-computed final price**, never client-supplied. Recompute at checkout (price may have changed since catalog view) → confirm.
- **FR-5 Concurrency on coupon limits:** coupon usage-limit decrement is **atomic** (no over-issuance at concurrency; same discipline as seat holds).
- **FR-6 Precedence:** early-bird + coupon both applicable → defined **precedence, non-stacking by default**.
- **FR-7 Audit + downstream:** audit applied discounts (lineage); reflect in invoice (PORTAL-05) and **refund math** (PORTAL-06, refund computed on actual paid amount).

## 5. Non-Functional
- **Server-authoritative pricing** — no client tampering; **discount leakage = 0**.
- **Simple, extensible model** (room to grow validation intelligence later) — aligns with "no affiliate/EMI coupons complexity" while still supporting basic coupons + early-bird.
- **Auditable.** **India residency.**

## 6. Flows, States & Edge Cases
- **Resolve base (band tier) → apply early-bird (auto) → apply coupon (manual) → final → pay (or skip if ₹0).**
- **Edge:** free exam → no payment, direct confirm + entitle; coupon makes price ₹0 → same free path; coupon usage limit hit at concurrency → atomic decrement rejects the overflow; early-bird + coupon both apply → precedence rule (non-stacking default); price change between catalog view and checkout → recompute + confirm; invalid/expired/over-limit coupon → clear rejection.

## 7. Data Model & Contracts
- **`Coupon { code, type(percent|flat), value, maxDiscount, limits(globalMax, perUserMax), validity(from,to), applicability(examIds/bands), stackable=false }`**
- **`PriceQuote { reservationId/bookingId, base, discounts[{type, code?, amount}], finalAmountPaise }`** — `finalAmountPaise` feeds PORTAL-04 Orders API.
- **Pricing base** sourced from ADMIN-03 (exam × class-band tier, `isFree`). Discount lineage referenced by PORTAL-05 invoice + PORTAL-06 refund math.

## 8. Out of Scope
- Payment execution (PORTAL-04); complex promotion engines / referral systems / affiliate / EMI / discount-subscriptions (future); admin authoring of base price/tiers (ADMIN-03 owns definition).

## 9. Acceptance Criteria
- [ ] Correct band-tier base price; early-bird auto-applies within window.
- [ ] Coupons validate (limits/validity/applicability); invalid/expired/over-limit rejected with clear messaging.
- [ ] Coupon usage-limit decrement is atomic under concurrency (no over-redemption).
- [ ] Free/₹0 path skips payment and confirms + entitles directly.
- [ ] **Final amount sent to Razorpay is server-computed; client cannot alter the price** (test).
- [ ] Discounts audited + reflected in invoice (PORTAL-05) and refund math (PORTAL-06).

## 10. Dependencies & Open Decisions
- Depends on ADMIN-03 base price/tiers; feeds PORTAL-04 final amount; PORTAL-05 invoice; PORTAL-06 refund math.
- **CONFLICT (for codex):** the other agent's set explicitly lists **"EMI/discount/affiliate coupons in Phase 1"** as **non-goals** (PRD-07) and folds pricing into PRD-06/07 without a coupon model. **This unified PRD keeps the resolved product decision** — simple, server-authoritative **early-bird + coupons** *are* in scope for v1 (per "RESOLVED PRODUCT DECISIONS"), while still excluding affiliate/EMI/subscription/marketplace complexity. Codex to confirm v1 coupon scope vs the other agent's Phase-1 deferral.
- **Open:** stacking rules (non-stacking default); per-user coupon limit enforcement strategy; early-bird vs coupon precedence; whether free path also requires a (₹0) order record for reconciliation symmetry.

## 11. Success Metrics
- Coupon redemption rate; **discount leakage = 0** (no client-side price manipulation); early-bird conversion lift; free-path completion rate.

## 12. Risks & Mitigations
- **Client-side price manipulation** → server-authoritative final amount; reject any client-supplied amount; test.
- **Coupon over-redemption at concurrency** → atomic usage-limit decrement.
- **Stacking/precedence ambiguity** → non-stacking default + explicit precedence rule.
- **Refund miscalculation with discounts** → compute refunds on actual paid amount; carry discount lineage to PORTAL-06.
- **Scope creep vs other agent's deferral** → keep model simple/extensible; defer affiliate/EMI/promo-engine to future.
