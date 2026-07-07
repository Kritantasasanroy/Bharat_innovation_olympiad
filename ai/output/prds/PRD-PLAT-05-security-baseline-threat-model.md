# PRD-PLAT-05: Security Baseline, Authorization Policy & Threat Model
- **Final primary project:** all four repos / foundation track | **Impacted projects:** bio-portal, bio-admin, bio-exam, bio-proctor | **Phase:** P0 Foundation | **Status:** Final golden PRD
- **Source union:** docs/prds/phase-0-foundation/PRD-02-identity-security-baseline.md (security-baseline + policy-interface + threat-model portions) + docs/prd/PRD-AUTH-05-session-token-management.md (security invariants only, cross-ref)

## 0. Final Ownership & Service Boundary

- **Final primary project:** all four repos / foundation track
- **Impacted projects:** bio-portal, bio-admin, bio-exam, bio-proctor
- **Deploy cadence:** foundation; applies to all deployment cadences
- **Final boundary note:** Deny-by-default authz, secret handling, threat model, and DPDP/security gates for all services.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

> **NEW canonical PRD.** This PRD owns the **cross-cutting security baseline**: the deny-by-default authorization policy interface, the rate-limit matrix, secret management, security headers/CSP, log redaction, and the platform threat model. The *identity/session implementation* (student OTP, admin RBAC, refresh-token mechanics, DPDP consent) lives in the AUTH PRDs and is **cross-referenced, not redefined** here:
> - Student mobile-OTP identity → **AUTH-01** (theirs PRD-02 §Student identity).
> - Invite-only admin identity + RBAC + MFA → **AUTH-04** (theirs PRD-02 §Admin identity).
> - Session & refresh-token rotation/reuse-detection → **AUTH-05** (this PRD states the *invariants*; AUTH-05 implements them).
> - DPDP consent capture/retention → **AUTH-03 / PROCTOR-05**.

## 1. Problem & Goal
The prototype let **public registration choose its own role**, stored tokens in **localStorage**, kept **plaintext refresh tokens** with no rotation/reuse detection, defined an **audit interceptor that was never registered**, exposed **answer keys to the exam runtime**, ran **in-memory timers**, and shipped **dev-secret fallbacks**. These must be structurally impossible in production.

**Goal:** a single, enforced security baseline — **deny-by-default authorization checked before every mutation**, a rate-limit matrix on every abuse-prone endpoint, fail-closed secret management with no fallbacks, hardened HTTP/security headers + CSP, comprehensive PII/secret log redaction, and a living threat model that maps each prior-audit vulnerability to a concrete, testable mitigation.

## 2. Users & Personas
- **All services** (enforce the baseline) and **all authenticated users** (governed by it).
- **Security / DPO** — owns the policy interface, rate-limit matrix, redaction rules, and threat model; runs forensics.
- **Ops / on-call** — revocation, lockout, incident response.
- **Engineers** — call the policy interface before every mutation; never hand-roll authz.

## 3. User Stories
- As the platform, **no public route can assign or escalate a role** — ever.
- As the platform, **every state-changing endpoint calls a deny-by-default policy** (`can…`) before mutating, with ownership enforced on **every** attempt path over **both HTTP and WebSocket**.
- As Security, OTP send/verify, login, payment-create, and admin login are rate-limited per a documented matrix; abuse is blocked after threshold.
- As Security, no service starts with a default secret (JWT/HMAC/DB/vendor) — it fails closed.
- As Security, tokens, OTPs, payment secrets, and biometric data never appear in any log.
- As the platform, a stolen-then-rotated refresh token is detected and the whole session family is revoked (invariant; implemented in AUTH-05).

## 4. Functional Requirements

### FR-1 — Deny-by-default authorization policy interface (home: `auth-kit`)
- A policy package exposing pure decision functions, each returning allow/deny with reason; **called by every service input port before any mutation**:
  - `canBookSlot(student, slot)`
  - `canPayForReservation(student, reservation)`
  - `canStartAttempt(student, registration)`
  - `canEditQuestion(admin, question)`
  - `canPublishExam(admin, paper, slot)`
  - `canViewProctorReport(admin, attempt)`
- **Deny-by-default:** absence of an explicit grant = deny. Extensible to one `can…` per new mutation (each ADMIN/PORTAL/EXAM/PROCTOR PRD declares the specific permissions it needs).
- **Ownership/IDOR enforcement:** every attempt-scoped operation re-verifies that the actor owns the resource (attempt, registration, reservation) on **both** the HTTP route **and** the WebSocket channel/message — not just at connection open.

### FR-2 — No role escalation via public surfaces
- No public/self-serve route may set or modify `role`/permissions. Admin accounts are **invite-only** (AUTH-04); student role is fixed by the OTP-identity path (AUTH-01). Role assignment is a privileged, audited, super-admin-only operation.

### FR-3 — Rate-limit matrix (enforced + documented)
Per-identifier (mobile/IP/account) sliding-window limits, fail-closed and audited on breach:

| Endpoint | Scope key | Suggested limit (tunable) | On breach |
|---|---|---|---|
| OTP **send** | mobile + IP | e.g. 5 / 10 min, 10 / hr / mobile | block + backoff + audit; alert on vendor-wide spike |
| OTP **verify** | mobile + reqId | e.g. 5 attempts / OTP | lock OTP, force resend, audit |
| OTP **resend/retry** | reqId | e.g. 3 / reqId | block, audit |
| **Login** (admin password) | account + IP | e.g. 5 / 15 min then lockout | progressive lockout + throttle + audit |
| **Admin login** (distinct, stricter) | account + IP | tighter than student flows; lockout earlier | lockout + alert Security + audit |
| **Payment create** (order) | student + reservation | e.g. 1 in-flight / reservation, N / min | reject duplicate, audit (anti-abuse + anti-double-charge) |
| Generic mutating APIs | account + IP | global ceiling | 429 + audit |

(Concrete numbers tuned with Ops; the **matrix itself is the contract** — every listed surface MUST be rate-limited.)

### FR-4 — Secret management (fail-closed, no fallbacks)
- Secrets from secret-manager/env only (PLAT-03); **no default/fallback secrets anywhere in code** (no `process.env.JWT_SECRET ?? 'dev'`).
- Boot-time config validation: a missing/empty required secret → **fail closed** (refuse to start). CI asserts no service boots without required secrets and that no default-secret literal exists (lint/scan).
- Key rotation supported via `kid` (JWT/HMAC); webhook-signing secrets (Razorpay) and OTP-vendor keys scoped per environment.

### FR-5 — Session & token security invariants (implemented in AUTH-05)
This PRD fixes the invariants; **AUTH-05 implements** them:
- Access token short-lived (~15 min), in **memory** (never localStorage); claims `sub, role, identityMode/consentLevel`; role/status **re-checked against DB on sensitive paths**.
- Refresh token **opaque, hashed at rest, rotating, reuse-detected** → on reuse, **revoke the whole family + alert**.
- Refresh stored in **httpOnly + Secure + SameSite cookie**; **CSRF protection** for cookie-based flows.
- Revocation is immediate on logout / admin force-logout / consent withdrawal / account disable, across portal + exam.

### FR-6 — Security headers & CSP (browser surfaces)
- Strict **Content-Security-Policy** (default-src self; explicit allowlist for CDN/MSG91-widget/Razorpay-checkout; no `unsafe-inline` for scripts where avoidable).
- `Strict-Transport-Security` (HSTS, preload), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` / `frame-ancestors 'none'` (exam runtime; relax only for required vendor frames), `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera allowed only on proctored exam surfaces).
- Secure cookie attributes enforced (HttpOnly, Secure, SameSite) on all session cookies.
- CORS allowlist per environment (no `*` with credentials).

### FR-7 — PII / secret / token / biometric log redaction
- Centralized redaction at the logging boundary (PLAT-04) for: **JWTs/refresh tokens, OTP codes + reqIds, passwords/hashes, Razorpay signatures/keys/webhook bodies, mobile numbers (mask), biometric embeddings + frame URLs, audit before/after sensitive values**.
- Redaction is **fail-closed**: an unclassifiable field is dropped/flagged, never logged raw.

### FR-8 — Audit of security events
- Every authz **deny**, role change, lockout, force-logout, secret-rotation, consent withdrawal, and governed dangerous-op is audited via the registered audit trail (PLAT-04). (PLAT-04 owns the mechanism; this PRD mandates the coverage.)

### FR-9 — Threat model maintenance
- A maintained threat-model document (this PRD §12 + living register) enumerating prior-audit vulnerabilities as threats, each with an owner, mitigation PRD, and a regression test. Reviewed before every phase gate.

## 5. Non-Functional (perf, security, scale, DPDP)
- **Fail-closed everywhere:** missing secret, unverifiable token, unclassifiable log field, ambiguous authz → deny/halt, never best-effort.
- **Perf:** policy checks are pure/in-memory (DB re-check only on sensitive paths); rate-limiters Redis-backed (PLAT-03), sized for the 50k burst.
- **DPDP:** biometric/PII redaction mandatory; India residency (PLAT-03); consent gating before processing (AUTH-03/PROCTOR-05) — security baseline enforces that proctor mutations check consent + `canViewProctorReport`.
- **Defense-in-depth:** boundary linting (PLAT-01) + contract field-classification (PLAT-02) + this baseline + audit (PLAT-04) layer to prevent any single-point bypass.

## 6. Flows, States & Edge Cases
- **Mutation flow (every service):** authenticate → authorize via `can…` (deny-by-default) → ownership/IDOR re-check → mutate → audit. Any step fails → deny + audit.
- **WS attempt path:** authorize **per message/action**, not just at socket open (prevents post-open IDOR on answer-save/heartbeat).
- **OTP abuse:** send/verify/resend over threshold → block + backoff + audit; vendor-wide error spike → alert (PLAT-04).
- **Admin brute-force:** progressive lockout + throttle + Security alert; last-super-admin cannot lock itself out of the org (AUTH-04 edge).
- **Refresh-token reuse (replayed old token):** detect → revoke family + alert (invariant; AUTH-05).
- **Missing secret at boot:** fail closed (no default).
- **CSP/cookie blocked (Safari/ITP):** graceful messaging, no insecure fallback (AUTH-05 edge).
- **Unclassifiable PII field hits logger:** dropped/flagged (fail-closed redaction).

## 7. Data Model & Contracts (entities, named events, APIs)
- **Policy interfaces** (signatures above) live in `auth-kit` (PLAT-02 FR-3); consumed by every service input port.
- **`RateLimitPolicy`** config (per-endpoint key + window + ceiling) — declarative, env-tunable.
- **Security-relevant entities are owned by AUTH PRDs** (cross-ref, not defined here): `RefreshToken { id, userId, tokenHash, familyId, parentId, expiresAt, revokedAt? }` (AUTH-05); `AdminUser/Permission/RolePermission` (AUTH-04); student session + device metadata (AUTH-01/05); consent records (AUTH-03).
- **Audit/security events** flow over the PLAT-04 audit trail (authz-deny, lockout, role-change, force-logout, secret-rotation, consent-withdrawal).
- **No new cross-repo domain events** introduced here.

## 8. Out of Scope
- Student OTP issuance/verification mechanics (AUTH-01).
- Admin password policy, MFA enrollment, role catalog details (AUTH-04).
- Refresh-token rotation **implementation** (AUTH-05) — only invariants here.
- DPDP consent capture/retention jobs (AUTH-03 / PROCTOR-05).
- Audit-store internals (PLAT-04) — coverage mandated, mechanism owned there.

## 9. Acceptance Criteria
- [ ] No code path allows assigning/escalating a role via a public/self-serve route (**regression test for the prior hole**).
- [ ] Every protected/mutating endpoint has an auth guard **and** a `can…` policy check; coverage test asserts deny-by-default on every mutation route.
- [ ] Ownership/IDOR enforced on every attempt path over **both HTTP and WebSocket** (test replays another user's attempt id on both surfaces → denied).
- [ ] Rate-limit tests pass for OTP send/verify, login, **admin login**, and payment-create; abuse blocked after threshold + audited.
- [ ] No service boots with a default/missing secret (fail-closed verified); no default-secret literal in code (scan).
- [ ] Security headers + CSP present on all browser responses; cookies HttpOnly+Secure+SameSite (header test).
- [ ] Tokens / OTPs / payment secrets / biometric data never appear in logs (redaction test, fail-closed verified).
- [ ] Every authz deny, role change, lockout, and force-logout produces an audit record (cross-ref PLAT-04).
- [ ] (Invariant, via AUTH-05) refresh-token reuse revokes the family + alerts; access token in memory, refresh in httpOnly cookie — no token in localStorage.

## 10. Dependencies & Open Decisions
- **Depends on:** PLAT-02 (`auth-kit` policy interfaces, contract field classification), PLAT-03 (secrets fail-closed, Redis for rate-limits, residency), PLAT-04 (audit registration, redaction). **Consumed by:** AUTH-01/03/04/05 and every mutating PRD.
- **Open — cross-repo auth mechanism:** `auth-kit` shared library vs token introspection / signed student-id claims across a contract boundary (README §11.3) — determines how bio-portal/bio-proctor evaluate the same policy/session. **Coordinate with PLAT-02 §10 and AUTH-04/05.**
- **Open — JWT vs PASETO**; cookie-domain strategy across portal + exam subdomains (AUTH-05).
- **Open — rate-limit backend:** Redis sliding-window vs token-bucket; concrete numeric thresholds (tuned with Ops).
- **Open — CSP strictness vs vendor frames** (MSG91 widget, Razorpay checkout) — nonce/hash strategy to avoid `unsafe-inline`.
- **Open — MFA method** for elevated admins (TOTP vs WebAuthn) — owned by AUTH-04, noted for threat-model completeness.

## 11. Success Metrics
- 0 privilege-escalation paths; 0 routes with public role assignment.
- 100% of mutating endpoints covered by deny-by-default authz tests.
- 100% of privileged mutations audited.
- 0 default-secret deployments; 0 token-theft incidents from storage.
- OTP/login abuse blocked after threshold; refresh-reuse detection rate tracked.

## 12. Risks & Mitigations — Threat Model (prior-audit vulnerabilities → mitigations)

| # | Threat (prior vuln) | Vector | Mitigation (this PRD) | Owner PRD / regression test |
|---|---|---|---|---|
| T1 | **Role escalation via public register** | Public route accepts `role` field | Invite-only admin; no public role mutation; deny-by-default policy (FR-1/2) | AUTH-04 · "public cannot set role" test (AC) |
| T2 | **IDOR on attempt paths** | Guessing another user's attempt/registration id over HTTP or WS | Ownership re-check on every attempt op, **HTTP + WS, per message** (FR-1) | EXAM-02/03/04 · cross-surface IDOR test |
| T3 | **In-memory `setInterval` timer** | Process restart/scale loses exam timer → untimed exam | Durable BullMQ timer; Redis fail-closed start (PLAT-03) | EXAM-04 · durable-timer recovery test |
| T4 | **Answer keys in exam runtime** | Client/exam-api can read correct answers | Keys stripped from `ExamSnapshot` (PLAT-02 classification); scoring in trusted worker only | SCORE-01 / PLAT-02 · "snapshot has no key" test |
| T5 | **Tokens in localStorage / plaintext refresh / no rotation** | XSS exfiltration; stolen refresh reuse | Access in memory; refresh httpOnly+Secure, hashed, rotating, **reuse-detected → family revoke** (FR-5) | AUTH-05 · reuse-revoke + no-localStorage tests |
| T6 | **Dev-secret fallbacks** | Default JWT/HMAC secret in prod | No fallback secrets; fail-closed boot; no-default-literal scan (FR-4) | PLAT-03 · fail-closed boot test |
| T7 | **Proctoring not wired / unencrypted embeddings** | Biometric data unprotected or pipeline incomplete | End-to-end wired pipeline; **encrypted persisted embeddings**; `canViewProctorReport` + consent gate | PROCTOR-01/02 · enrollment→match e2e + encryption-at-rest test |
| T8 | **Processing biometrics without DPDP consent / no deletion** | Minor's data processed pre-consent; retained indefinitely | Consent **before** processing; real biometric **retention/deletion jobs** | AUTH-03 / PROCTOR-05 · consent-gate + deletion-job test |
| T9 | **Unregistered audit interceptor** | Privileged actions leave no trace | Audit middleware **globally registered**, asserted in CI; async durable, dead-lettered | PLAT-04 · "registered on every API" integration test |
| T10 | **PII/OTP/token/biometric in logs** | Sensitive data in log/trace/audit | Centralized fail-closed redaction at logging boundary (FR-7) | PLAT-04 · redaction test |
| T11 | **OTP / login brute-force & abuse** | Credential stuffing, OTP flooding, double-charge | Rate-limit matrix (FR-3), progressive lockout, payment idempotency | AUTH-01/04, PORTAL-04 · rate-limit tests |
| T12 | **Cross-site / clickjacking / injection on exam + checkout** | CSRF, framing, script injection | CSP + HSTS + frame-ancestors + SameSite cookies + CORS allowlist (FR-6) | PLAT-05 · security-header test |
| T13 | **Data-residency violation** | PII/biometric leaving India region | India-region pin + IaC region policy check (PLAT-03) | PLAT-03 · region policy check |

**Cross-cutting mitigations:** boundary linting (PLAT-01) + contract field-classification (PLAT-02) + deny-by-default policy + registered audit (PLAT-04) provide layered defense so no single bypass defeats the baseline. Threat register reviewed at every phase gate (FR-9).

---

## 13. Final Codex Augmentation — O3 Auth Boundary Locked

- Cross-repo auth v1 = **signed student/registration claims + token introspection hybrid**.
- `bio-admin` owns admin identity/RBAC and trusted policy governance; `bio-portal` owns student/guardian sessions and consent capture; shared `auth-kit` owns token/session interfaces; `bio-exam` validates short-lived claims and introspects revocation-sensitive actions without owning student identity; `bio-proctor` uses service-to-service auth plus attempt/session validation.
- `bio-portal` integrates through the auth-kit client/adapter and never shares DB tables directly with runtime services.
- Runtime start/write paths accept only short-lived signed claims tied to `{ studentId, registrationId, examSlotId, examSnapshotId, consentVersion, expiresAt }`, then introspect high-risk actions and revocation-sensitive actions.
- Proctor service uses service-to-service auth plus attempt/session validation contracts; it does not trust browser claims by itself.
- Sensitive state changes still re-check DB/source-of-truth status: registration confirmed, not cancelled for new starts, consent valid, student owns attempt, snapshot imported, window open.
- Security regression tests now include: revoked session cannot start attempt, stale signed claim cannot start attempt, cancelled registration blocks new start, wrong-service proctor token cannot emit risk event.
