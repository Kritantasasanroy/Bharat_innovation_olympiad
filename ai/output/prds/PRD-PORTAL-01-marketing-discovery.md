# PRD-PORTAL-01: Marketing Site & Public Exam Discovery
- **Final primary project:** bio-portal | **Impacted projects:** — | **Phase:** P3 Portal/Commerce | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-PORTAL-01-marketing-content.md + docs/prds/phase-1-growth-commerce/PRD-03-marketing-site-exam-discovery.md

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-portal
- **Impacted projects:** —
- **Deploy cadence:** always-on
- **Final boundary note:** Always-on public marketing and discovery.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
The public face of the olympiad. It is **not static-only**: it must explain the exam, build trust, rank in search for Indian audiences, and convert public visitors into verified students who discover exam series, understand rules/pricing, and proceed into mobile-OTP login → slot booking. Marketing traffic is **isolated from exam runtime**. Goal: fast, SEO-strong, localized marketing pages with bucketed public exam discovery and clear CTAs into login/booking, plus school/parent lead capture.

## 2. Users & Personas
- **Prospective students/parents/guardians** (learn, then register).
- **Schools/educators** (find a "for schools" page; submit a lead).
- **SEO/organic visitors** (discover the olympiad via search).
- **Public visitors on low-end devices / 2G–3G**.

## 3. User Stories
- As a parent, I understand the exam, eligibility (by class), dates, and fees, then click "Register / Choose Slot".
- As a visitor, I select my class/grade and an exam series, see upcoming windows + fee + availability bucket, then start mobile-OTP login.
- As a visitor on mobile/2G, pages load fast.
- As a school/educator, I find a "for schools" page and submit a contact/lead form, and receive an acknowledgement.
- As an organic searcher, I find the olympiad via search.

## 4. Functional Requirements
- **FR-1 Public content pages:** home, about Olympiad, exam format, eligibility by class, syllabus/sample questions, dates/fees, SEB/proctoring explainer, privacy/DPDP & consent explainer, FAQ, for-schools, contact/school-inquiry, legal (privacy/DPDP, terms, refund policy).
- **FR-2 SEO/SSG:** server-rendered/static pages, meta/OG tags, sitemap, structured data; fast LCP on low-end devices; CDN-served.
- **FR-3 Public exam discovery:** show exam series names, class bands, fee, broad date windows, and **seat-status buckets** `Available | Filling Fast | Closed`. Discovery pulls from the `commerce-api` **public projection** of published slots (PORTAL-02). Public **cannot** see exact internal seat counts unless admin config explicitly allows; public **cannot** reserve a seat without OTP login.
- **FR-4 Lead capture (schools/parents):** form validates name, mobile, email (optional), city/state, school name, intent/message. Spam protection: captcha/honeypot/rate-limit. Lead stored in commerce DB; admin/export endpoint retrieves leads later; optional push to CRM/email + notification.
- **FR-5 CTAs:** deep-link into AUTH-01 mobile-OTP login + PORTAL-02 catalog, carrying selected class/series context.
- **FR-6 i18n-ready:** English + Hindi at minimum; content via lightweight CMS or MDX. **Phase 1 may hardcode marketing content in-repo**; a later phase adds CMS/admin-managed content.
- **FR-7 Analytics + consent banner:** cookie/consent banner aligned with DPDP; analytics events (see §11).
- **FR-8 Dynamic accuracy:** fees/dates rendered from the published catalog/public projection (single source) rather than static copy, to avoid drift.

## 5. Non-Functional
- **Perf:** LCP < 2.5s on mid-tier Android/3G; Lighthouse performance ≥ 80 on normal broadband (baseline). CDN + caching for discovery.
- **Security/isolation:** marketing kept isolated from exam runtime; **no exam question/paper/runtime/snapshot data ever exposed**; public projection exposes only safe fields; lead endpoint rate-limited.
- **Accessibility:** WCAG AA.
- **DPDP:** cookie-consent banner; lead PII stored under India residency; consent explainer page.
- **Scale:** bucketed availability + caching + rate limits absorb demand spikes.

## 6. Flows, States & Edge Cases
- **Visitor → student registration:** land → select class/series → see windows + fee + availability bucket → "Register / Choose Slot" → mobile-OTP login (AUTH-01).
- **Parent/school lead:** open school/parent page → submit contact form → acknowledgement → lead stored → optionally pushed to CRM/email.
- **Edge:** slot fills while browsing → bucket flips to `Filling Fast`/`Closed`, reservation still gated at PORTAL-03; admin closes slot → discovery removes it; fees/dates pulled from published catalog to avoid static drift; lead spam → captcha/honeypot/rate-limit; visitor not yet logged-in/consented → CTA routes to AUTH-01/02/03.

## 7. Data Model & Contracts
- **Reads:** `ExamSeriesProjection` / `ExamSlotProjection` **public** summary (title, classBands, feeAmountPaise, broad windows, seat-status bucket) served by `commerce-api` (sourced from `ExamSlotPublished` / `ExamSlotCapacityChanged` / `ExamSlotClosed`, see PORTAL-02). Exact seat counts withheld by default.
- **Writes:** `Lead { id, name, role, mobile, email?, city, state, schoolName, intent/message, createdAt, source }` → commerce DB; optional CRM push.
- **No event emission** from this PRD; hands off to AUTH-01 (which emits `StudentOtpVerified`).

## 8. Out of Scope
- Auth/OTP itself (AUTH-01), catalog availability internals + live exact seats (PORTAL-02), reservation/holds (PORTAL-03), payments (PORTAL-04), pricing rules/coupons (PORTAL-08), slot creation (ADMIN-03).

## 9. Acceptance Criteria
- [ ] All content pages live, SSG/SSR, with SEO meta + sitemap + structured data.
- [ ] Visitor can navigate homepage → exam discovery → OTP login (with class/series context carried).
- [ ] Exam discovery pulls slots from the `commerce-api` public projection and shows bucketed status (`Available | Filling Fast | Closed`); no exact internal seat counts unless admin-enabled.
- [ ] **No exam question/paper/runtime/snapshot data exposed** on any public route.
- [ ] Public cannot reserve a seat without OTP login.
- [ ] Lead form persists a valid lead, rejects spam-like submissions, and is retrievable via admin/export.
- [ ] LCP target met on a throttled mid-tier device; Lighthouse performance ≥ 80 on broadband.
- [ ] Fees/dates reflect the published catalog (no drift).
- [ ] English + Hindi content paths work; cookie-consent banner present.

## 10. Dependencies & Open Decisions
- Depends on PORTAL-02 public projection; AUTH-01 login entry; PLAT-02 contracts.
- **Open:** CMS choice (MDX in-repo for Phase 1 vs headless CMS later); CRM target for leads; languages beyond Hindi for v1; whether admin ever exposes exact public seat counts; precise bucket thresholds for `Filling Fast`.

## 11. Success Metrics
- Organic traffic; CTA→login conversion; lead volume; Core Web Vitals.
- Funnel events tracked: page views, class selected, exam series selected, OTP started, slot booking started, payment started, lead submitted.

## 12. Risks & Mitigations
- **Public seat status drives demand spikes** → bucketed availability, caching, rate limits.
- **Static copy drifts from real fees/dates** → render dynamic fields from published projection.
- **Lead spam/abuse** → captcha/honeypot/rate-limit + server validation.
- **Accidental exposure of runtime data via public projection** → strict allow-list of safe fields; contract test asserting no paper/snapshot fields leak.
