# PRD-EXAM-06: SEB Integration & Lockdown (Fail-Closed)

- **Final primary project:** bio-exam | **Impacted projects:** bio-admin, bio-portal | **Phase:** P4 Exam Runtime | **Status:** Final golden PRD
- **Source union:** docs/prd/PRD-EXAM-06-seb-lockdown.md + docs/prds/phase-3-exam-runtime/PRD-15-seb-device-readiness.md (SEB portion)

## 0. Final Ownership & Service Boundary

- **Final primary project:** bio-exam
- **Impacted projects:** bio-admin, bio-portal
- **Deploy cadence:** exam-window runtime; spin up before check-in, scale down after submission/export gates
- **Final boundary note:** Exam owns lockdown enforcement; admin configures requirement; portal surfaces guidance.
- **Golden-source rule:** this file supersedes `docs/prd/`, `docs/all-prds-re-arch/`, and `docs/all-prds-re-arch-pass-2/` for implementation planning. Any preserved source wording that formerly said `bio-core` is resolved by this section: admin/authoring/scoring/results/ops concerns map to `bio-admin`; exam attempt/runtime concerns map to `bio-exam`; commerce/student-facing concerns map to `bio-portal`; proctoring concerns map to `bio-proctor`.

## 1. Problem & Goal
Enforce **Safe Exam Browser** lockdown for exams that require it, with **proper key validation**, treating SEB as a real (if imperfect) control, **fail-closed**. Goal: robust SEB config generation + **Browser/Config Key verification** that can't be trivially bypassed — fixing the prior **UA-only check**, **open-by-default**, and **unauthenticated config endpoint** gaps. SEB is one layer of defense-in-depth alongside proctoring (PROCTOR-03).

## 2. Users & Personas
- **Student** — downloads/launches the exam in SEB.
- **Admin** — marks a slot SEB-required and sets keys (ADMIN-03); may mark a slot non-SEB/mock.
- **Platform** — enforces SEB on every protected request, fail-closed.

## 3. User Stories
- As a student, I download/launch the exam in SEB and the exam only runs **inside** it.
- As an admin, I mark a slot SEB-required with keys; non-SEB access is **blocked**.
- As the platform, I verify the **SEB request hash**, not just the user-agent.
- As the platform, I serve the SEB config only to an **authenticated, scoped** request — never anonymously.

## 4. Functional Requirements (FR-1…)
1. **FR-1 SEB config generation (per slot).** Generate SEB config per slot (URL filter, **quit URL**, restrictions) with a proper **Config Key** and **Browser Exam Key (BEK)**. Served via an **authenticated, scoped** endpoint — fixing the prior **unauthenticated leak**.
2. **FR-2 Short-lived launch token flow.** Student requests a **short-lived SEB launch token**; API **validates registration + slot** (EXAM-00/02); the config endpoint serves the **encrypted/valid SEB config scoped to that token** (student + registration + slot). Token **expires quickly** and is **single-use where feasible**.
3. **FR-3 Runtime SEB enforcement (fail-closed, every protected path).** For SEB-required attempts, **validate SEB headers/keys on EVERY protected request** — **start attempt, session fetch, save answer, submit, heartbeat**. Validate `X-SafeExamBrowser-RequestHash` (**SHA256 of url+BEK**) and optionally the **ConfigKey**. **User-Agent alone is NEVER sufficient.** **Reject if required and missing/invalid** (no open-by-default). A missing/invalid SEB signal **creates a runtime integrity event** (PROCTOR-03) and **may block the action per policy**.
4. **FR-4 Key handling.** Keys stored securely (not plaintext where avoidable); **never exposed in client or catalog payloads**.
5. **FR-5 Quit flow.** Quit flow + `quitUrl` handling (coordinated with EXAM-05 submit); clear "launch SEB" UX with a **deep link**.
6. **FR-6 Mock/non-SEB slots.** Admin can mark a slot **non-SEB/mock**; UI clearly indicates **relaxed mode**; **ownership/timer still enforced** (EXAM-02/04). SEB bypass allowed **only** when slot policy permits.
7. **FR-7 Proxy-aware URL reconstruction.** Handle `x-forwarded-*` proxy headers for correct URL reconstruction in the hash computation.
8. **FR-8 Violations as proctor events.** SEB violations surfaced as proctor/integrity events (`SEB_VIOLATION` / `ProctorEventRaised`, PROCTOR-03).

## 5. Non-Functional (perf, security, scale, DPDP)
- **Fail-closed** on missing/invalid keys for required exams; **never default-open**.
- Config endpoint **authenticated + scoped** to student/registration/slot; launch token short-lived + single-use where feasible.
- SEB treated as a **deterrent layered with proctoring** (defense-in-depth), not a sole control.
- Hash validation must add negligible latency on the hot path; India residency.

## 6. Flows, States & Edge Cases
- **Flow:** required → request launch token → validate registration/slot → download scoped config → launch SEB → verified hash on every protected request → attempt proceeds.
- **Edge cases:**
  - **Required but normal browser** → blocked + "launch SEB" deep link.
  - **Missing BEK/config (misconfig)** → **fail-closed + admin alert** (not silently open).
  - **Hash mismatch** → deny + integrity event.
  - **Anonymous config download attempt** → rejected (authenticated only).
  - **Expired/replayed launch token** → rejected (short-lived + single-use).
  - **Proxy headers** (`x-forwarded-*`) → correct URL reconstruction for the hash.
  - **Mock slot** → SEB skipped, relaxed mode shown, ownership/timer still enforced.

## 7. Data Model & Contracts (entities, named events, APIs)
- **Reads:** `ExamInstance/Slot { requireSeb, bek, configKey, quitUrl }` (ADMIN-03).
- **Entity:** `SebLaunchToken { token, userId, registrationId, slotId, expiresAt, used }` (short-lived, single-use where feasible).
- **Emits:** `SEB_VIOLATION` / `ProctorEventRaised` (proctor→core integrity event, PROCTOR-03) on failed validation.
- **APIs (exam-api, authenticated + scoped):**
  - `POST /student/registrations/:registrationId/seb/launch-token` → short-lived token.
  - `GET /seb/config?token=…` (authenticated) → encrypted SEB config scoped to token (student+registration+slot); **keys never in payload**.
  - SEB header validation is **middleware** on all protected attempt routes (start/session/save/submit/heartbeat).
- **Header:** `X-SafeExamBrowser-RequestHash` = SHA256(url + BEK); optional ConfigKey header.

## 8. Out of Scope
- Non-SEB lightweight lockdown (product decision; possibly prelims).
- Proctor **risk scoring** (PROCTOR-03) — this PRD only raises SEB violation events.
- Device/identity readiness checks (EXAM-01) — this PRD provides the "SEB present/valid?" signal it consumes.
- Attempt creation/ownership (EXAM-02) — SEB is an additional gate on those paths.

## 9. Acceptance Criteria (checkboxes)
- [ ] **SEB-required slots reject non-SEB and invalid-hash access** (no UA-only bypass; no open-by-default).
- [ ] **SEB validated on every protected path** (start, session, save, submit, heartbeat) — not just at start.
- [ ] **Config endpoint authenticated**; **SEB config cannot be downloaded anonymously**; keys never in client/catalog payloads.
- [ ] **Misconfigured required slot fails closed + alerts** (does not run unprotected).
- [ ] **Launch token is short-lived** (and single-use where feasible); expired/replayed token rejected.
- [ ] **Mock/non-SEB exam bypasses SEB only when slot policy allows**; ownership/timer still enforced.
- [ ] **SEB violations recorded as proctor/integrity events.**
- [ ] Proxy (`x-forwarded-*`) URL reconstruction yields the correct hash.

## 10. Dependencies & Open Decisions
- **Depends on:** ADMIN-03 (slot keys/config), EXAM-02 (gated paths), PROCTOR-03 (events), EXAM-05 (quit handling).
- **Open — desktop-only SEB vs Android share** of audience (product: **SEB for finals, lighter mode for prelims/mock?**).
- **Open — key storage hardening** (KMS/secret manager vs encrypted-at-rest column).
- **Open — ConfigKey enforcement scope** (BEK-only vs BEK+ConfigKey).
- **Open — single-use token feasibility** vs short-TTL-reusable (some SEB flows re-request config).
- **Open — per-path block vs warn policy** for a missing SEB signal mid-attempt (default: block writes on required exams).

## 11. Success Metrics
- **0 unprotected runs** of SEB-required exams; bypass attempts detected; SEB launch success rate.
- SEB validation failure rate per path; anonymous config-download attempts (should be 0 successes).

## 12. Risks & Mitigations
- **UA-only bypass / open-by-default regression** (the prior bug) → unprotected high-stakes exam. *Mitigation:* hash validation on **every** protected path, fail-closed, regression test that a normal browser is rejected.
- **Unauthenticated config leak** (the prior bug) → BEK/config exfiltration. *Mitigation:* authenticated + token-scoped config endpoint; keys never in payloads.
- **Misconfigured slot runs open** → silent integrity hole. *Mitigation:* fail-closed + admin alert on missing BEK/config.
- **SEB version differences** → false rejects / launch failures. *Mitigation:* test matrix + fallback launch instructions (shared with EXAM-01).
- **Token replay** → unauthorized config access. *Mitigation:* short TTL + single-use where feasible + scope binding.
- **Over-reliance on SEB** (it is bypassable) → false sense of security. *Mitigation:* layer with proctoring (PROCTOR-03); treat as deterrent, not sole control.
