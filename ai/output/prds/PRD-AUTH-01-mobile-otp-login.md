# PRD-AUTH-01: Mobile OTP Login via MSG91

- **Final primary project:** bio-portal | **Impacted projects:** bio-exam, bio-admin | **Phase:** P1 Identity/Auth | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-AUTH-01-mobile-otp-login.md + docs/prds/phase-1-growth-commerce/PRD-04-student-mobile-otp-msg91.md

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-portal
- **Impacted projects:** bio-exam, bio-admin
- **Deploy cadence:** always-on
- **Final boundary note:** Student/guardian OTP login lives in always-on portal; exam/admin consume signed claims or introspection only.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Indian student onboarding must be mobile-first and low-friction; email/password is poor for school users and the prior prototype let public registration choose a `role` (escalation hole). Students/parents authenticate with a mobile number + SMS OTP (no passwords). **Goal:** a secure, abuse-resistant OTP login via **MSG91** that creates/reuses a student account by verified mobile and issues the shared session (AUTH-05) honored by both the portal and the exam runtime. Replaces the email/password student flow and its role-escalation hole.

## 2. Users & Personas
- **Student** — own mobile, the primary login identity.
- **Parent/Guardian** — own mobile as the **fallback** login identity when the student has no number, plus consent grantor (AUTH-02/03).
- **Admin** — does NOT use this flow; admins use invite-only password + MFA (AUTH-04).
- **Platform / Ops-Security** — abuse monitoring, OTP-bomb defense.

## 3. User Stories
- As a student, I enter my mobile, receive an OTP via SMS, and log in.
- As a parent whose child has no phone, I log in with my own mobile (fallback identity — AUTH-02).
- As a returning user, my session persists securely across the portal and the exam app without re-login.
- As a user who mistypes, I can resend OTP after a cooldown and am locked out after repeated failures.
- As the platform, I resist OTP brute force and SMS-bombing and never leak whether a number is registered.

## 4. Functional Requirements
- **FR-1 — Start OTP** (`POST /auth/otp/start`): request `{ mobile, purpose=LOGIN_OR_REGISTER, clientContext:{ device, userAgent, referrer } }`. Validate/normalize to **E.164 Indian** (`+91XXXXXXXXXX` default). Multi-dimensional rate-limit (per-mobile, per-IP, per-device). Create `OtpChallenge` (status `STARTED`). Call **MSG91** via adapter; persist `vendorRequestId`/`reqId` where returned. Return masked mobile + `challengeId`. Enumeration-safe (no "registered?" disclosure).
- **FR-2 — OTP issuance & storage:** 6-digit OTP, single-use, bound to phone + challenge ID, **TTL 5 min**; stored **hashed at rest** (never plaintext). Sent via MSG91 templated/DLT-compliant sender + template IDs. (Two delivery modes supported behind the port — see FR-7.)
- **FR-3 — Verify OTP** (`POST /auth/otp/verify`): validate `challengeId` + OTP format; rate-limit attempts; **constant-time** compare; verify with MSG91 (Verify OTP / Verify Access Token). On success: mark mobile verified (`mobileVerifiedAt`), set challenge `VERIFIED`, create-or-fetch student by `mobileE164`, issue tokens/session (AUTH-05), return session state + next step (profile vs slot selection). First login routes into consent/registration (AUTH-02/03) before account is "active".
- **FR-4 — Resend OTP** (`POST /auth/otp/resend`): require active challenge; enforce incremental-backoff cooldown (e.g. first resend ≥30s) and max resend count; prefer MSG91 retry/resend route; text-first with voice fallback designed for later.
- **FR-5 — Rate limits & lockout:** per-phone request cooldown + max N requests/hour; max M verify attempts → lock challenge (`RATE_LIMITED`/`FAILED`); per-IP throttle; CAPTCHA/step-up on abuse.
- **FR-6 — Abuse prevention:** per-mobile + per-IP limits; device-fingerprint soft signal; blocklist suspicious mobile prefixes/IPs; anomaly alert on OTP-bombing patterns; SMS-cost guard.
- **FR-7 — Provider port:** MSG91 lives behind an **output port** `SmsSenderPort` (a.k.a. `OtpProviderPort`) supporting **both** integration styles so the provider can be swapped without touching core: (a) **MSG91 OTP Widget** — Send/Retry/Verify OTP + Verify Access Token, `reqId` from Send reused for retry/verify; (b) **MSG91 direct OTP APIs** — SendOTP / Verify OTP / Resend OTP. Auth key + access tokens stored securely (secret manager; no source/log exposure).
- **FR-8 — auth-kit surface:** `auth-kit` exposes `requestOtp`, `verifyOtp`, `issueSession` (session mechanics delegated to AUTH-05), plus an OTP-challenge interface (no DB driver dependency — injected per PLAT-02).
- **FR-9 — Identity resolution:** `mobileE164` is the unique account key. New mobile → create student in `PROFILE_PENDING`/`PENDING_CONSENT`; existing mobile → resume session. Account becomes `ACTIVE` only after profile + (for minors) consent.
- **FR-10 — Event emission:** on successful verify, record **`StudentOtpVerified`** inside `bio-portal` and emit a reporting/audit copy to `bio-admin` when needed, carrying `{ studentId, mobileE164Hash, identityModeHint, verifiedAt }`. Student identity canonicalization remains portal-owned.
- **FR-11 — Session security hooks:** refresh stored as hash (not raw); httpOnly Secure cookie preferred for web; access/session TTL configurable; logout revokes session. (Full token model in AUTH-05.)

## 5. Non-Functional (perf, security, scale, DPDP)
- **Security:** OTP hashed at rest; constant-time compare; **OTP value never in logs**; enumeration-safe responses (do not reveal registration status); MSG91 auth key/access token in secret store (no secret fallbacks — fail-closed, per PLAT-05). CSRF protection for cookie-based flows.
- **Abuse/scale:** SMS cost bounded by multi-dimensional rate limits + anomaly alerts; horizontally scalable verify path; idempotent challenge transitions.
- **Deliverability:** MSG91 DLT template approvals required; fallback sender route; safe retryable error on MSG91 downtime (no session created).
- **DPDP:** mobile number is PII; **India data residency**; PII/OTP redaction in logs (PLAT-04/PLAT-05). Minors handled downstream (AUTH-02/03).
- **Perf:** OTP delivery success > 98%; median verify < 30s.

## 6. Flows, States & Edge Cases
- **Happy path:** enter mobile → normalize → `start` (MSG91 send) → enter OTP → `verify` → create/resume student → session → redirect to profile (`PROFILE_PENDING`) or slot selection (returning ACTIVE).
- **OtpChallenge states:** `STARTED → VERIFIED | FAILED | EXPIRED | RATE_LIMITED`.
- **Student states:** `PROFILE_PENDING → ACTIVE` (`BLOCKED` on abuse). `PROFILE_PENDING`/`PENDING_CONSENT` reconciled with AUTH-02/03 lifecycle.
- **Edges:** expired OTP (reject, offer resend); reused/replayed OTP (reject); concurrent requests → latest challenge invalidates prior; wrong OTP never creates a session; max verify attempts → lock challenge; rate-limit hit → cooldown messaging; MSG91 outage → safe retryable error, optional voice-OTP fallback (future); number ported/changed → identity update/migration flow (AUTH-02); parent-phone fallback login (AUTH-02 dual identity).

## 7. Data Model & Contracts (entities, named events, APIs)
- **Entities:**
  - `Student { id, mobileE164 (unique), mobileVerifiedAt, status: PROFILE_PENDING|ACTIVE|BLOCKED, role=STUDENT, identityMode (AUTH-02), createdAt, updatedAt }`
  - `OtpChallenge { id, phoneHash|mobileE164, vendor=MSG91, vendorRequestId/reqId, purpose, otpHash, status: STARTED|VERIFIED|FAILED|EXPIRED|RATE_LIMITED, sendCount, verifyAttemptCount, expiresAt, createdAt }`
  - `StudentSession { id, studentId, refreshTokenHash, deviceLabel, ipAddress, userAgent, expiresAt, revokedAt }` (canonical model owned by AUTH-05).
- **APIs:** `POST /auth/otp/start`, `POST /auth/otp/verify`, `POST /auth/otp/resend`.
- **Ports:** `SmsSenderPort`/`OtpProviderPort` (MSG91 Widget + direct-API adapters; stub adapter for tests).
- **Events:** emits **`StudentOtpVerified`** (portal → core). Consumes none.
- **Integration facts (MSG91):** OTP Widget Send/Retry/Verify + `reqId` — https://docs.msg91.com/otp-widget ; direct OTP SendOTP/Verify/Resend — https://docs.msg91.com/otp/sendotp (verify — https://docs.msg91.com/otp/verify-otp).

## 8. Out of Scope
- Registration profile capture, dual-identity recording, eligibility (AUTH-02).
- Parental consent mechanics & retention (AUTH-03).
- Admin authentication (AUTH-04). Full session/token lifecycle internals (AUTH-05).
- Email login, international OTP beyond E.164-ready design, WhatsApp OTP (future).

## 9. Acceptance Criteria
- [ ] Valid phone → OTP SMS delivered (MSG91) → verify → authenticated session usable on portal **and** exam app.
- [ ] New mobile creates a `PROFILE_PENDING` student; existing mobile reuses the account.
- [ ] OTP single-use, 5-min TTL, hashed at rest; reuse/expiry rejected; wrong OTP creates no session.
- [ ] Rate limits + lockout enforced (per-phone, per-IP, per-device); max verify attempts lock the challenge; resend respects cooldown + max count — verified by test.
- [ ] Responses are enumeration-safe; **OTP value never appears in logs**.
- [ ] MSG91 behind a port supporting Widget + direct-API styles; a stub provider passes the same tests.
- [ ] MSG91 downtime returns a safe retryable error and issues no session.
- [ ] `StudentOtpVerified` emitted on successful verify with correct payload.

## 10. Dependencies & Final Decisions
- MSG91 account + DLT template/sender registration are blocking deliverability prerequisites.
- Depends on PLAT-02 (`auth-kit`, contracts), PLAT-05 (rate-limit/redaction/secret-management baseline), AUTH-05 (session issuance).
- **Final cross-service auth mechanism:** O3 signed student/registration claims + introspection hybrid. `bio-portal` verifies OTP and issues the student session; `bio-exam` trusts only short-lived signed claims plus revocation/registration/consent introspection at sensitive gates.
- **Final MSG91 integration default:** direct server-side Send/Verify/Resend APIs behind `OtpProviderPort`. The OTP Widget may be supported as a web adapter, but it is not the source of platform identity truth.
- **V1 OTP policy:** 6 digits, 5-minute TTL, single-use, hashed at rest, resend cooldown, per-phone/per-IP/per-device rate limits, generic enumeration-safe responses. Voice/WhatsApp fallback remain future channels unless deliverability tests require voice fallback.

## 11. Success Metrics
- OTP start success rate; OTP delivery success > 98%; delivery-to-verify conversion.
- Median verify < 30s; average verify time tracked.
- Rate-limited-attempt count; MSG91 error rate; OTP-fraud / SMS-bomb incidents ≈ 0; overall login success rate.

## 12. Risks & Mitigations
- **OTP delivery failures by carrier/template** → vendor logs, resend, voice fallback, clear support path, DLT pre-approval.
- **OTP bombing / SMS-cost abuse** → multi-dimensional rate limits + cooldown + prefix/IP blocklist + anomaly alerts.
- **Provider lock-in** → `SmsSenderPort` abstraction with stub + alternate-provider parity tests.
- **Secret leakage (auth key/access token)** → secret manager, no fallbacks, log redaction.
- **Enumeration / brute force** → constant-time compare, generic responses, attempt lockout.

---

## 13. Final Codex Augmentation — MSG91 + Identity Boundary

- Keep both MSG91 integration modes behind `OtpProviderPort`: OTP Widget for web convenience and direct Send/Verify/Resend APIs for backend-controlled fallback.
- `StudentOtpVerified` is a portal-produced event, but student identity canonicalization lives in `bio-portal`; admin identity canonicalization lives in `bio-admin`; `auth-kit` and O3 claims/introspection bridge services without shared auth tables.
- OTP verification never grants an exam entitlement; it only establishes identity/session. Profile, consent, payment, registration import, and runtime gate still decide exam access.
- Engineering specs must include MSG91 vendor-fake tests for send, retry, verify, expired challenge, lockout, vendor timeout, and idempotent repeated verify.
