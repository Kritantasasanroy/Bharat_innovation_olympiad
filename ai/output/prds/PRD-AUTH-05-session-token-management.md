# PRD-AUTH-05: Session & Token Management

- **Final primary project:** bio-portal + bio-admin | **Impacted projects:** bio-exam, bio-proctor | **Phase:** P1 Identity/Auth | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-AUTH-05-session-token-management.md + docs/prds/phase-0-foundation/PRD-02-identity-security-baseline.md (session parts)

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-portal + bio-admin
- **Impacted projects:** bio-exam, bio-proctor
- **Deploy cadence:** shared identity/foundation cadence
- **Final boundary note:** One shared token/session model: portal/admin issue sessions; exam/proctor validate claims fail-closed.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
One secure session model shared across the portal and the exam runtime for both OTP (student) and password/OIDC (admin) users, with consistent ownership/session validation in runtime APIs. **Goal:** short-lived access tokens + secure, **rotating, reuse-detecting** refresh tokens stored safely, with device metadata and cross-app + cross-device revocation — fixing the prior prototype's **localStorage tokens + plaintext refresh + no-rotation-detection** issues. The exam runtime consumes student session/registration claims from commerce; runtime authorizes against confirmed registration + attempt ownership (it does not send OTP itself unless fallback is required).

## 2. Users & Personas
- **All authenticated users** (students via OTP, admins via password/OIDC).
- **Exam runtime (`bio-exam`)** — consumes/validates student session + registration claims; does not own student identity.
- **Ops / Security** — revocation, forced logout, forensics, device-session review.

## 3. User Stories
- As a user, my session persists across the portal and the exam app without re-login.
- As a user, logging out (or an admin revoking) invalidates my session **everywhere / across devices**.
- As the platform, a stolen-then-rotated refresh token is **detected** and the **whole session family is revoked** + alerted.
- As ops, I can see device/session metadata and selectively revoke a session.
- As the runtime, I validate a student session and authorize against confirmed registration + attempt ownership.

## 4. Functional Requirements
- **FR-1 — Access token:** short-lived (≈15 min) JWT; claims `{ sub, role, identityMode, consentLevel, profileComplete, aud (portal+exam) }`; verified per request; **role/status re-checked against DB on sensitive paths**. Carries student id + mobile-verified + profile-completion status for runtime handoff.
- **FR-2 — Refresh token:** opaque, **hashed at rest** (never stored/returned raw), **rotating**, with **reuse detection** → revoke entire family + alert.
- **FR-3 — Storage (prior-audit fix):** refresh token in **httpOnly Secure SameSite cookie**; access token **in memory** (NOT localStorage); **CSRF defense** for cookie-based flows. Secure HttpOnly cookies for browser sessions where practical.
- **FR-4 — Revocation:** logout, admin force-logout, consent withdrawal (AUTH-03), and account/admin disable (AUTH-04) → **immediate**; **revocation works across devices**.
- **FR-5 — Cross-app sessions:** shared identity; token audience covers portal + exam; one login usable on both apps. Admin session TTL shorter than student session (AUTH-04).
- **FR-6 — Device/session metadata + selective revoke:** store `{ deviceLabel, userAgent, ipAddress, createdAt, lastSeenAt }`; expose device/session list with selective revoke.
- **FR-7 — auth-kit surface:** `auth-kit` issues/verifies tokens, models sessions, rotates refresh, detects reuse, and exposes verification with **no DB-driver coupling** (DB injected, per PLAT-02). Framework-agnostic core + Elysia/Next adapters.
- **FR-8 — Key management:** key rotation support via `kid`; clock-skew tolerance; **no secret fallbacks — service must not start with a default/missing JWT secret (fail-closed)**.
- **FR-9 — Runtime validation:** exam runtime validates session + ownership; authorizes against confirmed registration (entitlement) and attempt ownership rather than re-authenticating.

## 5. Non-Functional (perf, security, scale, DPDP)
- **No secret fallbacks (fail-closed).** Tokens **never logged** (redaction per PLAT-05). Clock-skew tolerance; key rotation (`kid`). Idempotent rotation under concurrency. India residency for session PII. Refresh-token store scalable + revocation-checkable on sensitive paths.

## 6. Flows, States & Edge Cases
- **Happy path:** login (OTP/admin) → access + refresh → silent refresh → rotation → continued use across portal + exam.
- **Edges:** **refresh reuse** (old/rotated token replayed) → **family revoke** + alert; **concurrent refresh race** → idempotent rotation with short grace window; **role/status changed mid-session** → next access token reflects it (DB re-check on sensitive paths); **cookie blocked** (Safari/ITP) → graceful messaging/fallback; **logout/disable/consent-withdrawal** → cross-app + cross-device revoke; clock skew → tolerance window; missing/default secret at boot → **fail closed (no start)**.

## 7. Data Model & Contracts (entities, named events, APIs)
- **Entities:**
  - `RefreshToken { id, userId, tokenHash, familyId, parentId, deviceLabel, userAgent, ipAddress, createdAt, lastSeenAt, expiresAt, revokedAt? }`
  - `Session/StudentSession { id, userId, refreshTokenId, deviceMetadata, expiresAt, revokedAt? }` (unifies the student-session model referenced in AUTH-01).
- **APIs (representative):** `POST /auth/refresh` (rotate), `POST /auth/logout`, `GET /auth/sessions` (device list), `DELETE /auth/sessions/:id` (selective revoke), admin `POST /admin/users/:id/revoke-sessions`.
- **Helpers:** `auth-kit` issue/verify/rotate/detect-reuse/revoke; verification adapter for runtime ownership checks.
- **Events:** none cross-repo; revocation may be triggered by `GuardianConsentCaptured`-withdrawal (AUTH-03) and admin-disable (AUTH-04).

## 8. Out of Scope
- OTP issuance (AUTH-01); admin password/MFA policy & RBAC (AUTH-04); cross-cutting security baseline/threat model (**PLAT-05**); the concrete cross-repo identity transport decision (see §10, owned with PLAT-05).

## 9. Acceptance Criteria
- [ ] Refresh tokens **hashed at rest**; never returned in a non-cookie body.
- [ ] Reuse of a rotated refresh token **revokes the family + alerts** (test).
- [ ] Access token **in memory**, refresh in **httpOnly Secure SameSite cookie**; **no token in localStorage** (regression test for the prior issue); CSRF defense present.
- [ ] Logout / account-disable / admin-force-logout / consent-withdrawal revokes sessions **across both apps and across devices** (session-invalidation test passes).
- [ ] **No service starts with a default/missing JWT secret** (fail-closed test).
- [ ] Device/session list shows metadata (UA, IP, createdAt, lastSeenAt) and supports selective revoke.
- [ ] Role/status change mid-session is reflected on next access token / on sensitive-path DB re-check.

## 10. Dependencies & Final Decisions
- Depends on AUTH-01 (issuance), AUTH-04 (admin auth/revoke), PLAT-02 (`auth-kit`), PLAT-05 (redaction/secret/rate-limit baseline).
- **Final token format v1:** JWT with `kid` and short TTL. PASETO remains a future hardening option, not a launch blocker.
- **Final identity SoR:** two realms, one shared contract:
  - `bio-portal` owns student/guardian identity, OTP sessions, profile, guardian consent, and student refresh-token families.
  - `bio-admin` owns admin identity/RBAC, admin sessions, force-revoke, and privileged auth policy.
  - `auth-kit` defines shared token/session interfaces and verification behavior; services inject their own persistence.
- **Final cross-service auth mechanism (O3):** signed short-lived claims + revocation/introspection hybrid. `bio-exam` accepts signed student/registration claims for normal runtime reads/writes, then introspects revocation-sensitive or high-risk actions (attempt start, proctor session, support exception, result release). `bio-proctor` uses service-to-service auth plus attempt/session validation.
- **Final cookie/domain stance:** prefer shared parent-domain secure cookies when portal and exam are under the same registrable domain; otherwise use portal-to-exam handoff with short-lived signed registration claim and token exchange. No localStorage fallback.
- **V1 device-management UX:** list active sessions, revoke current/all sessions, admin force-revoke; fine-grained device labels can iterate later.

## 11. Success Metrics
- 0 token-theft incidents traceable to storage; refresh-reuse detection rate; 0 default-secret deployments.
- Silent-refresh success rate; cross-device revocation latency.

## 12. Risks & Mitigations
- **Token theft from insecure storage** (prior issue) → in-memory access + httpOnly refresh + no localStorage, regression-tested.
- **Refresh replay** → rotation + reuse detection + family revoke + alert.
- **Default/missing secret in an environment** → fail-closed boot check; no fallbacks.
- **Cross-repo session drift** (admin/student/exam) → shared `auth-kit` + auth decision records; signed-claims + introspection contract defined in §10.
- **Cookie/ITP edge cases** → SameSite tuning + graceful fallback messaging; documented domain strategy.

---

## 13. Final Codex Augmentation — O3 Session/Claim Contract

- Two identity realms are explicit: `bio-portal` = student/guardian SoR; `bio-admin` = admin/RBAC SoR. They share `auth-kit` semantics, not database tables.
- Session model stays contractually shared across portal/admin/exam/proctor, but services do not share auth database tables directly.
- Runtime handoff uses short-lived signed registration claims, then introspects session/registration/consent on high-risk actions.
- Claims include `aud`, `kid`, `studentId`, `sessionId`, `registrationId`, `examSlotId`, `examSnapshotId`, `consentVersion`, `expiresAt`, and a nonce/correlation id.
- Refresh-token family revocation must invalidate future introspection and prevent new signed registration claims.
- Browser storage remains: access token in memory, refresh token in httpOnly secure cookie; no localStorage fallback.
