# PRD-ADMIN-05: User & School Management (Admin-Side Identity Ops)
- **Final primary project:** bio-admin | **Impacted projects:** bio-portal | **Phase:** P2 Admin/Curator | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-ADMIN-05-user-school-management.md + (theirs has **no standalone equivalent**; school/user-admin bits pulled from docs/prds/phase-2-admin-ops/PRD-09-admin-auth-rbac-audit.md and docs/prds/phase-1-growth-commerce/PRD-05-student-profile-consent-eligibility.md)

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-admin
- **Impacted projects:** bio-portal
- **Deploy cadence:** admin/curation/results/ops; low baseline outside exams, scale for authoring/results/ops
- **Final boundary note:** Admin manages schools/cohorts/admin users; portal consumes eligibility and school projections.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Admins manage the **school directory** used at student registration and **oversee student/parent accounts** for support, eligibility, and DPDP data-subject requests (DSR). Goal: an authoritative, verified school list + safe, least-privilege account administration with full auditability and DPDP-aware PII controls. The school name/code/city/state captured at registration (AUTH-02 / theirs PRD-05) must reconcile against this directory; post-payment critical-field changes flow through this admin/support workflow (theirs PRD-05 FR-05.4), and SUPPORT here mirrors the RBAC SUPPORT role (theirs PRD-09: limited registration/attempt status, **no answer keys**).

## 2. Users & Personas
- **Super Admin / Ops** — school CRUD + verification, account actions, eligibility overrides.
- **Support** — read-mostly lookups (registration/attempt/booking status), assists students; cannot disable admins, cannot view OTP secrets or answer keys (per AUTH-04 / theirs PRD-09 FR-09.3).
- **DPO / DPO-delegate** — actions DSR (access/erasure) on accounts (AUTH-03 / theirs PRD-23).
- (Indirect) **FINANCE** role — views payment/refund status via commerce reporting (theirs PRD-09); not the owner of account PII actions here.

## 3. User Stories
- As Ops, I add/verify schools (name, code, city, state) so students can select them at registration; I bulk-import schools.
- As Ops, I reconcile pending "school not listed" free-text submissions from registration into the verified directory.
- As Support, I look up a student account and view their bookings/attempts/registration status to assist — **without** seeing OTPs or answer keys.
- As Support/Ops, I edit a paid student's **critical profile fields** (locked post-payment per theirs PRD-05) via an audited workflow.
- As Ops, I disable/enable an account, or reset a student's phone with verification.
- As DPO, I action an access/erasure (DSR) request on an account and the action is audited.
- As Ops, I apply a rare, audited **eligibility override** (e.g., class-band exception).

## 4. Functional Requirements
- **FR-1 (School directory):** School CRUD + verification workflow + **unique codes**; bulk import with row-level validation; powers the registration school search (AUTH-02).
- **FR-2 (School reconciliation):** reconcile pending free-text "school not listed" submissions from registration into the directory (merge into a verified `School` or create new + verify).
- **FR-3 (Account admin):** search and view student/parent accounts with **PII masked by default**; reveal is an explicit, **audited** action; disable/enable account; reset student phone with verification.
- **FR-4 (Post-payment profile edits):** edit critical profile fields that are locked after payment (theirs PRD-05) through a support/admin workflow; all changes audited; coordinate with commerce for fields on confirmed registrations.
- **FR-5 (DSR hooks):** trigger DPDP data-subject access/erasure requests on an account (links to AUTH-03 / theirs PRD-23); DPO-scoped; audited.
- **FR-6 (Eligibility overrides):** rare, audited eligibility/class-band exception override with governance.
- **FR-7 (Least privilege + audit):** all actions audited (who/when/before-after where safe); deny-by-default RBAC — SUPPORT cannot disable admins, cannot view keys/OTP secrets; merging duplicate students (AUTH-02 dedupe) is an audited merge.

## 5. Non-Functional (perf, security, scale, DPDP)
- **PII masked unless explicitly revealed** (audited reveal); **no access to OTP secrets or answer keys** from this surface. India data residency. Deny-by-default least-privilege RBAC (AUTH-04). Bulk school import processed off the request path (`admin-worker`). Every mutation + sensitive read audited (PLAT-04).

## 6. Flows, States & Edge Cases
- **Flow:** add school → verify → available at registration. Account: lookup (masked) → assist / reveal (audited) / disable / DSR.
- **States:** `School { status: DRAFT|VERIFIED|MERGED|DISABLED }`.
- **Edges:** duplicate school codes blocked; disabling a student **mid-exam** guarded (block or graceful — no abrupt attempt kill); merging duplicate students → audited merge with conflict resolution; editing critical fields on a confirmed/paid registration → audited workflow + commerce coordination; erasure request on an account with active paid registration → honor legal-hold/retention rules (AUTH-03).

## 7. Data Model & Contracts (entities, named events, APIs)
- **Entities:** `School { id, name, code (unique), city, state, status, verifiedBy }`; reads `User` / `GuardianContact` (identity kernel); `PendingSchoolSubmission` (free-text from registration).
- **Contracts/events:** emits **audit events** (PLAT-04); reads identity tables (auth-kit). DSR actions delegate to AUTH-03 / theirs PRD-23 workflow. No cross-repo product events owned here.
- **APIs (`admin-api`):** `POST/PATCH/GET /schools`, `POST /schools/import`, `POST /schools/:id/verify`, `POST /schools/reconcile`, `GET /accounts?search`, `GET /accounts/:id` (masked), `POST /accounts/:id/reveal` (audited), `POST /accounts/:id/disable|enable`, `POST /accounts/:id/reset-phone`, `POST /accounts/:id/dsr`, `POST /accounts/:id/eligibility-override`, `POST /accounts/merge`.

## 8. Out of Scope
- Student self-registration & profile capture (AUTH-02 / theirs PRD-05). Consent capture mechanics (AUTH-03). Admin invite/role-assignment & login (AUTH-04 / theirs PRD-09). Analytics (ADMIN-06). Payment/refund actions (PORTAL — FINANCE reporting only).

## 9. Acceptance Criteria
- [ ] School directory powers registration search; codes unique; bulk import validated row-level.
- [ ] Pending free-text schools are reconcilable into verified `School` records.
- [ ] Account lookup masks PII by default; reveals are audited; SUPPORT cannot view OTP secrets or answer keys (403).
- [ ] Post-payment critical-field edits go through an audited support/admin workflow.
- [ ] DSR (access/erasure) actions are invokable, DPO-scoped, and audited; SUPPORT cannot exceed scope (cannot disable admins).
- [ ] Disabling a student mid-exam is guarded; duplicate-student merge is audited.

## 10. Dependencies & Open Decisions
- Depends on AUTH-04 (RBAC/roles incl. SUPPORT/FINANCE/DPO), AUTH-02 (registration/profile fields + dedupe), AUTH-03/theirs PRD-23 (DSR & retention).
- **Open:** school verification source (govt **UDISE** codes?); student-merge policy; eligibility-override governance; exact split of post-payment edit authority between SUPPORT vs SUPER_ADMIN; whether FINANCE read-views live here or in ADMIN-06.
- **Note (sourcing):** **theirs has no standalone User/School PRD.** This unifies mine (PRD-ADMIN-05) with school/account bits referenced in theirs **PRD-09** (SUPPORT = limited registration/attempt status, no keys; FINANCE = payment/refund reporting; deny-by-default; audit) and theirs **PRD-05** (school name/code/city/state at registration; **paid registration locks critical profile fields**, changed only via support/admin workflow, audited; no Aadhaar). Codex should confirm whether to keep this as a distinct PRD or fold school-directory into AUTH-02 and account-ops into AUTH-04.

## 11. Success Metrics
- % registrations matching a verified school; pending-school reconciliation backlog/turnaround.
- DSR turnaround time; 0 unauthorized PII reveals; 0 key/OTP exposures from this surface.

## 12. Risks & Mitigations
- **Unauthorized PII exposure** → mask-by-default, audited reveal, deny-by-default RBAC, SUPPORT excluded from keys/OTP.
- **Duplicate/garbage school data** → unique codes, verification workflow, reconciliation of free-text submissions, (optional) UDISE source.
- **Disabling/erasing accounts mid-exam or under retention hold** → guarded actions, legal-hold/retention checks (AUTH-03), graceful handling.
- **Scope creep across AUTH PRDs** → clear out-of-scope boundaries; codex to confirm PRD consolidation.
