# PRD-AUTH-04: Admin Authentication, RBAC & Audit

- **Final primary project:** bio-admin | **Impacted projects:** bio-proctor | **Phase:** P1 Identity/Auth | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-AUTH-04-admin-auth-rbac.md + docs/prds/phase-2-admin-ops/PRD-09-admin-auth-rbac-audit.md + docs/prds/phase-0-foundation/PRD-02-identity-security-baseline.md (admin-identity parts)

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-admin
- **Impacted projects:** bio-proctor
- **Deploy cadence:** admin/curation/results/ops; low baseline outside exams, scale for authoring/results/ops
- **Final boundary note:** Admin authentication and privileged RBAC live in bio-admin; proctor review roles consume admin claims.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Back-office users control question content, answer keys, exam slots, seat capacity, result release, refunds, and proctor reports. Admin access must be **invite-only, separate and stronger than student OTP, permission-scoped, MFA-ready, deny-by-default, and fully audited** — closing the prior prototype hole where public registration could choose a `role`. **Goal:** provisioned-only admin accounts (no self-serve), least-privilege roles, deny-by-default authorization on every admin endpoint, re-auth for dangerous actions, and an immutable audit trail of every mutation and sensitive read.

> Note: this PRD owns the **admin-identity** slice. The cross-cutting **security baseline & threat model** (rate-limit/redaction/secret/policy-package standards from theirs PRD-02) is canonicalized in **PLAT-05**; admin-specific application of those standards is specified here.

## 2. Users & Personas
- **Super Admin** — provisions admins, assigns roles, full access.
- **Content Admin / Content Curator** — creates/edits draft questions.
- **Reviewer** — reviews/approves questions/papers.
- **Scheduler** — creates slots, capacity, registration windows.
- **Result Manager** — releases results.
- **Proctor Reviewer** — views proctor reports, marks incidents.
- **Support** — limited registration/attempt status; **no answer keys**.
- **Finance** — payment/refund status via commerce reporting integration.
- **Read-only Analyst** — read-only dashboards/analytics.

## 3. User Stories
- As a Super Admin, I provision admin accounts by email invite and assign roles; **nobody can self-register as admin**.
- As an admin, I accept an invite, set a password (or complete OIDC) and configure MFA, then log in (separate from student OTP).
- As an admin, dangerous actions (publish, capacity reduce, result release, refund approval, role change) require a fresh session / re-auth.
- As the platform, every admin endpoint denies access unless the **permission** (not just role name) is explicitly granted.
- As a Super Admin/DPO, I can review an immutable audit log of every admin mutation and sensitive read.

## 4. Functional Requirements
- **FR-1 — No self-serve admin registration:** admin accounts created only by **Super Admin** (or seeded). No public route can create or escalate an admin role (regression-guarded; prior-audit fix).
- **FR-2 — Invite-only creation:** Super Admin invites by email; invite has **expiry + one-time token**; invite assigns initial role(s); invitee sets password (bcrypt/argon2, strong policy) **or** completes OIDC flow; **MFA-ready field stored, MFA required before live launch**.
- **FR-3 — Authentication:** email + password (strong hashing) **or enterprise OIDC**; **MFA (TOTP)** enforced for elevated roles (and required platform-wide before live launch). Admin login is **separate from student OTP**.
- **FR-4 — RBAC (permission-based):** roles → **permission** matrix; every admin API checks a **permission**, not only a role name; UI hides actions but the **backend is the source of truth**; **deny-by-default**; guard helper (`@requires(permission)`) provided by `auth-kit`. Role presets map to explicit permissions.
- **FR-5 — Role catalog:** `SUPER_ADMIN, CONTENT_ADMIN/CONTENT_CURATOR, REVIEWER, SCHEDULER, RESULT_MANAGER, PROCTOR_REVIEWER, SUPPORT, FINANCE, ANALYST`. Guardrails: Curator cannot publish; Scheduler cannot edit answer keys; Support cannot view answer keys.
- **FR-6 — Sessions & re-auth:** short-lived admin access + rotating refresh (AUTH-05); **admin session TTL shorter than student session**; secure HttpOnly cookie (or enterprise OIDC session); **forced re-auth / fresh session for dangerous actions**: publish, capacity reduce, result release, refund approval, role change.
- **FR-7 — Account lifecycle:** invite → activate → disable → admin-initiated password reset. Disabling an admin **revokes active sessions immediately** (AUTH-05). Privilege change takes effect on next request (token role re-checked against DB). **Last Super Admin cannot self-disable.**
- **FR-8 — Authorization policy package:** policy interfaces (e.g. `canEditQuestion`, `canPublishExam`, `canViewProctorReport`, plus student-side `canBookSlot/canPayForReservation/canStartAttempt`) — every service input port calls policy **before mutation** (policy-package standard from PLAT-05; admin operations bind here).
- **FR-9 — Audit logging (every mutation + sensitive read):** audit record `{ auditId, actorAdminId, action, resourceType, resourceId, before/after diff (where safe), ipAddress, userAgent, requestId, createdAt }`. Sensitive events: login success/failure, invite created/accepted/revoked, role changed, question created/edited/deleted, answer key viewed/edited, paper approved, slot capacity changed, exam published, result released, proctor report viewed/decisioned. Audit writes are append-only and required (100% for mutations).
- **FR-10 — Admin dashboard:** show assigned capabilities; pending tasks (papers awaiting review, slots to publish, proctor incidents); recent audit log for the current admin.
- **FR-11 — Brute-force protection:** lockout + throttle on failed admin logins; rate-limited (PLAT-05); failed attempts audited.

## 5. Non-Functional (perf, security, scale, DPDP)
- **Security:** strong password hashing (bcrypt/argon2); MFA-ready→enforced; deny-by-default everywhere; **separation of duties** (publisher ≠ approver, configurable); brute-force lockout/throttle; no secret fallbacks (PLAT-05). **All authz decisions audited.**
- **Auditability:** append-only audit store; sensitive-read auditing (coordinated with AUTH-03 sensitive-access audit + PLAT-04).
- **Usability:** role presets with explicit permissions to avoid over-complex RBAC slowing admins.
- **Consistency:** admin + student auth in separate repos must not drift → shared `auth-kit` contracts + auth decision records (PLAT-02/PLAT-05).

## 6. Flows, States & Edge Cases
- **Provisioning:** Super Admin invite (email, one-time token, expiry, initial roles) → invitee sets password + MFA (or OIDC) → active.
- **Login:** email+password(+MFA) or OIDC → short admin session → dangerous action → re-auth challenge.
- **Edges:** disabled admin → sessions revoked immediately; privilege change → effective next request (DB-rechecked, per AUTH-05); **last super-admin cannot self-disable**; expired/invalid invite token → rejected; Curator hits publish endpoint → **403**; Support hits answer-key endpoint → **403**; Scheduler edits answer key → denied; failed-login burst → lockout + alert.

## 7. Data Model & Contracts (entities, named events, APIs)
- **Entities:**
  - `AdminUser { id, email, passwordHash?, oidcSubject?, roles[], mfaEnabled, status: INVITED|ACTIVE|DISABLED }`
  - `AdminInvite { id, email, tokenHash, roles[], expiresAt, acceptedAt?, revokedAt? }`
  - `Permission { key }`, `RolePermission { role, permissionKey }`
  - `AuditLog { auditId, actorAdminId, action, resourceType, resourceId, beforeDiff?, afterDiff?, ipAddress, userAgent, requestId, createdAt }`
- **APIs (representative):** `POST /admin/invites`, `POST /admin/invites/accept`, `POST /admin/auth/login`, `POST /admin/auth/mfa`, `POST /admin/auth/reauth`, `PATCH /admin/users/:id` (disable/role-change). All guarded by `auth-kit` `@requires(permission)`.
- **Guards:** `auth-kit` permission guard + policy package; admin session via AUTH-05.
- **Events:** none cross-repo required; admin actions surface as `AuditLog` + domain events owned by ADMIN-* PRDs (e.g. `ExamSnapshotPublished`).

## 8. Out of Scope
- Student OTP auth (AUTH-01); session/token internals (AUTH-05); cross-cutting threat model & security baseline (**PLAT-05**).
- Specific admin **feature** permissions are declared in each ADMIN-* PRD (this PRD owns the auth/RBAC/audit framework).

## 9. Acceptance Criteria
- [ ] **Public cannot create or escalate to an admin role** (regression test for the prior `role`-in-register hole).
- [ ] Admin creation requires a valid, unexpired, one-time invite; no self-serve registration.
- [ ] Every admin endpoint is **deny-by-default and permission-gated** (coverage test); permission checked server-side, not just hidden in UI.
- [ ] Curator → 403 on publish; Support → 403 on answer-key endpoint; Scheduler cannot edit answer keys.
- [ ] MFA enforced for elevated roles (and platform-wide before live launch); dangerous ops require fresh session/re-auth.
- [ ] Disabling an admin revokes active sessions immediately; last super-admin cannot self-disable.
- [ ] Role changes and all listed sensitive events appear in the immutable audit log; audit write success = 100% for mutations.
- [ ] Failed admin logins are rate-limited/locked out and audited.

## 10. Dependencies & Open Decisions
- Depends on PLAT-02 (`auth-kit` guard/policy), PLAT-04 (audit sink), PLAT-05 (security baseline, secret management, policy-package interfaces), AUTH-05 (admin session/token).
- **Open (for codex):**
  - **MFA method:** TOTP (this pass) vs WebAuthn/passkeys.
  - **OIDC/SSO** for org/enterprise admins: in-scope-now vs future; password+TOTP as the v1 baseline.
  - Concrete **separation-of-duties** matrix (publisher ≠ approver) and which actions require dual control.
  - Boundary with **PLAT-05**: which security-baseline requirements are canonical there vs restated here (avoid double-ownership).

## 11. Success Metrics
- **0 privilege-escalation paths**; 0 routes with public role assignment.
- 100% of admin endpoints covered by authz tests; permission-denied count tracked per endpoint.
- MFA adoption for elevated roles = 100%; audit write success = 100% for mutations; admin login failure rate monitored.

## 12. Risks & Mitigations
- **Privilege escalation / role tampering** → invite-only, no `role` on any self-serve path, deny-by-default, regression tests.
- **Overly complex RBAC slows admins** → role presets mapped to explicit permissions.
- **Admin/student auth drift across repos** → shared `auth-kit` + auth decision records (PLAT-05).
- **Insider misuse of sensitive reads** → sensitive-read auditing + separation of duties + re-auth on dangerous ops.
- **Stale privileges after change** → per-request DB role re-check (AUTH-05) + immediate session revoke on disable.
