# PRD-AUTH-02: Student Registration & Profile (Dual Identity, Eligibility)

- **Final primary project:** bio-portal | **Impacted projects:** bio-admin, bio-exam | **Phase:** P1 Identity/Auth | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-AUTH-02-registration-profile.md + docs/prds/phase-1-growth-commerce/PRD-05-student-profile-consent-eligibility.md

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-portal
- **Impacted projects:** bio-admin, bio-exam
- **Deploy cadence:** always-on
- **Final boundary note:** Student profile and eligibility data originates in portal and is synchronized as claims/read models.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
After OTP login the platform needs enough profile data to determine exam eligibility, issue receipts/admit cards, hand off to the exam runtime, and (downstream) capture consent. **Goal:** a clean, DPDP-aware registration that (a) captures the minimal student profile, (b) records the resolved **dual-identity** model — account keyed by the **student's mobile** when available, else the **parent's mobile** (fallback) with a parent contact always recorded, and (c) computes class-band/region **eligibility** that feeds slot booking (PORTAL-02/03) and consent (AUTH-03).

## 2. Users & Personas
- **Student (has own phone)** → self-registers, completes own profile.
- **Parent/Guardian (student has no phone)** → registers as the account holder for the child, supplies child details + an **alternate parent** name/number.
- **Returning user** → edits profile/school/phone with re-verification.
- **Support/Admin** → post-payment critical-field changes via workflow.

## 3. User Stories
- As a student with a phone, after OTP I complete my profile (name, DOB, class band, school, city/state) and I'm ready to book.
- As a parent whose child has no phone, I register using my mobile as the login, enter my child's details, and provide an alternate parent name + number.
- As a user, profile completion supports **save/resume**.
- As a returning user, I can update profile/school/phone, with OTP re-verification for phone change; changes are audited.
- As a student outside the eligible class band, I'm clearly told I can't book the restricted exam.
- As the platform, after payment I lock critical fields so they can only change via support/admin.

## 4. Functional Requirements
- **FR-1 — Profile completion form (post-OTP):** required = student first name, last name, **DOB or age band** (→ derive class band/age), class/grade (**6–12** initially), school name, city, state, guardian name, guardian mobile (may equal login mobile). Optional = email (receipt/results), school code (partnered school), preferred language. **No Aadhaar field** (intentionally excluded; no document upload/KYC). Form supports save/resume.
- **FR-2 — Dual-identity mode:** record `identityMode` = `STUDENT_PHONE` (default) or `PARENT_PHONE` (fallback) on the account. Always capture a **guardian/parent contact** (name + mobile). In `PARENT_PHONE` mode, additionally capture an **alternate parent** (name + number) and the child's details under the parent's login.
- **FR-3 — School resolution:** resolve school against the **ADMIN-05 school directory** (code or search); allow "school not listed" → free-text, marked pending verification.
- **FR-4 — Eligibility determination:** compute eligible exam series/slots by **class/grade band**, slot status, registration window, school/cohort restriction (if any), region (if applicable), and prior registration/payment status. Validate class band against the **active exam series** before allowing reservation. Student cannot reserve a slot until required profile fields are complete.
- **FR-5 — Edit rules & audit:** student can edit profile **before payment**; **after payment, critical fields (name, DOB, class band, school) require support/admin workflow**; phone change re-verifies via OTP (AUTH-01); all changes recorded in an **immutable audit** (PLAT-04).
- **FR-6 — Account lifecycle/status:** `PROFILE_PENDING → PENDING_CONSENT (minor) → ACTIVE`. Minor accounts (by DOB) are gated by AUTH-03 consent before `ACTIVE`. Adult accounts may go `PROFILE_PENDING → ACTIVE` directly (still acknowledge privacy notice per AUTH-03).
- **FR-7 — Minor flagging:** derive minor status from DOB; flag for the consent gate (AUTH-03) and surface proctoring/biometric consent requirement before booking a proctored exam.
- **FR-8 — Event emission:** on completion of required fields + (where applicable) eligibility resolution, record **`StudentProfileCompleted`** in `bio-portal` and emit downstream copies to `bio-admin` / `bio-exam` only where needed, carrying `{ studentId, classBand, schoolId|schoolPending, city, state, identityMode, isMinor }` for eligibility/reporting/runtime handoff.
- **FR-9 — Consent acknowledgment capture (handoff to AUTH-03):** store consent acceptance timestamp + privacy-notice version + proctoring-consent version at profile time; the verifiable parent-OTP mechanics live in AUTH-03 (this PRD records the fields and triggers the gate).

## 5. Non-Functional (perf, security, scale, DPDP)
- **DPDP:** data minimization (only fields above; no Aadhaar/KYC); minors flagged by DOB; **PII India-residency**; **field-level encryption** for contact PII (guardian/alternate-parent name+mobile, email).
- **Accessibility & i18n:** accessible forms; **Hindi/English (regional-ready)** labels and consent copy; preferred-language captured.
- **Integrity:** dedupe of duplicate students across parent accounts; immutable change audit.
- **Security:** phone-change re-verification; post-payment field lock; no role field on any self-serve path (role fixed = STUDENT — prior-audit fix).

## 6. Flows, States & Edge Cases
- **Happy path:** OTP (AUTH-01) → profile form (save/resume) → eligibility check → (minor? → consent AUTH-03) → `ACTIVE` → book (PORTAL-03).
- **States:** `PROFILE_PENDING → PENDING_CONSENT → ACTIVE`.
- **Edges:** duplicate student under two parent accounts → dedupe heuristic (student name + DOB + school) → flag for review; student later gets own phone → **migrate identity** from `PARENT_PHONE` to `STUDENT_PHONE` with OTP re-verification; under-6 / over-12 (out of band) → ineligible messaging; guardian mobile differs from login mobile → optional guardian-mobile verification (later phase) and required parent-OTP for minors (AUTH-03); class band edited within rules vs out-of-range → block restricted-exam booking; paid registration → critical fields locked (support workflow only); "school not listed" → pending verification, doesn't block booking.

## 7. Data Model & Contracts (entities, named events, APIs)
- **Entities:**
  - `User/Student { id, role=STUDENT, identityMode: STUDENT_PHONE|PARENT_PHONE, mobileE164, profile{ firstName, lastName, dob, classBand, city, state, email?, preferredLanguage? }, schoolId|schoolPendingName, isMinor, status: PROFILE_PENDING|PENDING_CONSENT|ACTIVE }`
  - `GuardianContact { userId, name, mobile, isPrimary, isAlternate }` (primary always; alternate required in `PARENT_PHONE` mode)
  - `EligibilityResult { studentId, classBand, eligibleSeriesIds[], restrictions[] }` (derived, may be computed at booking time)
  - Consent fields (acceptedAt, privacyNoticeVersion, proctoringConsentVersion) → full model in AUTH-03 `ConsentRecord`.
- **APIs:** `POST /profile` (create/complete), `PATCH /profile` (edit with rules), `GET /eligibility?series=…`.
- **Events:** emits **`StudentProfileCompleted`** (portal → core). Consumes `StudentOtpVerified` (AUTH-01) context.
- **Cross-refs:** school directory = ADMIN-05; eligibility consumed by PORTAL-02/03; consent = AUTH-03.

## 8. Out of Scope
- Verifiable parent-OTP consent mechanics, consent versioning, retention/erasure (AUTH-03).
- Booking & seat reservation (PORTAL-03); receipts/admit-card generation (PORTAL-05).
- Admin school CRUD (ADMIN-05); full school ERP integration; document upload/KYC; Aadhaar collection.

## 9. Acceptance Criteria
- [ ] Student-phone and parent-phone registration both produce a valid, eligibility-ready account.
- [ ] `PARENT_PHONE` mode requires alternate parent name + number; primary guardian contact always captured.
- [ ] Class band derived from DOB and editable within rules; out-of-range / out-of-class-band → blocked from restricted exam booking.
- [ ] Student with an incomplete profile sees the profile step before slot booking; form save/resume works.
- [ ] Phone change re-verifies via OTP and is audited; identity migration (parent→student phone) supported.
- [ ] Minor accounts land in `PENDING_CONSENT` until AUTH-03 completes.
- [ ] **No Aadhaar field exists**; no `role` field on any self-serve path.
- [ ] Paid registration locks critical profile fields (support/admin workflow to change); changes audited.
- [ ] Consent stored with version + IP/device metadata (mechanics in AUTH-03).
- [ ] `StudentProfileCompleted` emitted with correct payload.

## 10. Dependencies & Open Decisions
- Depends on AUTH-01 (verified mobile), ADMIN-05 (school directory), PORTAL-02 (active exam series for eligibility), AUTH-03 (consent gate).
- **Open (for codex):**
  - Dedupe policy strength + reconciliation owner (flag-only vs hard-block).
  - Identity-migration UX (parent-phone → student-phone) and whether it requires re-consent.
  - i18n scope for v1 (Hindi + English vs broader regional set).
  - Whether `EligibilityResult` is materialized at profile time or recomputed at booking (PORTAL-02/03 boundary).
  - Guardian-mobile verification: optional now vs required when guardian ≠ login mobile.

## 11. Success Metrics
- Registration/profile completion rate; drop-off by field/step.
- % accounts reaching `ACTIVE`; consent acceptance rate (with AUTH-03).
- Duplicate-student rate < 1%.

## 12. Risks & Mitigations
- **Parent/student confusion over identity + consent** → simple Hindi/English copy, clear dual-identity UX, support link.
- **Duplicate students across parent accounts** → name+DOB+school dedupe heuristic + review queue.
- **Ineligible bookings from stale class-band** → server-side eligibility re-check at reservation (PORTAL-03), not just at profile.
- **PII exposure** → field-level encryption, India residency, log redaction; no Aadhaar/KYC by design.
- **Post-payment data tampering** → critical-field lock + support workflow + immutable audit.

---

## 13. Final Codex Augmentation — Profile/Eligibility Clarifications

- No Aadhaar, document upload, or KYC field enters v1 profile scope.
- Student/parent dual identity is preserved: student phone primary; parent phone fallback; alternate parent captured in `PARENT_PHONE` mode.
- Post-payment critical profile fields stay locked unless support/admin workflow approves change.
- School directory dependency remains ADMIN-05; AUTH stores identity/profile facts, not the school master data source.
- Eligibility projection consumed by portal slot catalog must be recomputed when class band, school restriction, exam series, or registration window changes.
