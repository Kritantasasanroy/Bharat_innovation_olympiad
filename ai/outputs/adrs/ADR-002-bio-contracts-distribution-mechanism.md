---
id: ADR-002
title: "bio-contracts distribution: workspace bridge now, prerelease registry as declared end-state"
status: approved
created: 2026-06-30
owner: amit-t
epic: EPIC-SCAFFOLD-bio-contracts
related_spec: SPEC-001
supersedes: —
superseded_by: —
precision_mode: on
---

# ADR-002: bio-contracts distribution mechanism

## Context

`bio-contracts` ships four packages (`shared-types`, `domain-contracts`, `auth-kit`, `ui-kit`) consumed by `bio-admin` and `bio-exam` (and later `bio-portal`, `bio-proctor`). The cross-repo fix plan left the distribution mechanism unresolved (open tasks 5/10), which blocks the consumer-wiring tasks (2/11): a consumer cannot be told how to import `@bio/*` until the mechanism is fixed.

Two mechanisms are in play. The repos are co-located under one workbench (`repos/bio-*`), so a pnpm workspace bridge already works and `bio-admin/services/admin-api/package.json` already points at `../bio-contracts/packages/*` (a completed `[x]` task). Separately, SPEC-001 § end names "versioned prerelease packages" as the rollout vehicle — a published-registry model, not yet built.

The decision is hard-to-reverse for consumers: import style, lockfile shape, and CI assumptions all depend on it.

## Decision drivers

- **Iteration speed while the contract still churns** — entity types and auth-kit runtime are not finished; bridge gives instant edit→consume.
- **Independent CI** — a consumer's own CI checkout has no sibling `../bio-contracts`; only a registry survives that.
- **Current wiring** — admin-api already on the bridge; least new work to continue.
- **SPEC-001 intent** — approved spec names prerelease packages as the destination.
- **Reversibility cost** — switching bridge→registry is a package.json + lockfile change per consumer; low but non-zero.

## Options considered

### Option A: Phase-0 workspace bridge now, Phase-1 prerelease registry as declared end-state
- Pros: zero new infra today; instant iteration while contract churns; matches what is already wired; honors SPEC-001 destination by naming registry as the committed end-state; cutover is a localized package.json/lockfile change.
- Cons: bridge breaks any consumer's standalone CI until cutover; two-phase model needs a documented trigger or it never happens.
- Cost / effort: S now (continue bridge), M later (registry cutover).

### Option B: Prerelease registry now (strict SPEC-001 fidelity)
- Pros: independent CI works immediately; one mechanism, no phase transition; literal spec compliance.
- Cons: every contract edit needs a version bump + publish before consumers see it — heavy friction while shapes are still moving; requires registry/auth/CI setup before any consumer-wiring task can start; slows the unblock the user wants now.
- Cost / effort: L (registry + auth + publish CI before progress).

### Option C: Vendored copy per consumer
- Pros: no shared dependency at all; each repo self-contained.
- Cons: directly violates SPEC-001's "single source of cross-repo truth" and the "0 duplicated DTOs" boundary gate; drift guaranteed. Non-starter.
- Cost / effort: S to set up, XL in drift debt.

## Decision

**Chosen:** Option A.
**Why:** The contract is still changing (missing entity types, auth-kit runtime), so registry friction would tax every edit for no current benefit — no independent-CI consumer exists yet. The bridge is already wired, so Option A is the least-work unblock. Naming the prerelease registry as the committed end-state keeps faith with SPEC-001 without ripping out a working mechanism.

**Cutover trigger (explicit):** flip to Phase-1 prerelease registry when the first of these occurs — (a) any consumer needs to build in CI without the sibling checkout present, (b) a repo outside this workbench consumes `@bio/*`, or (c) the contract reaches a stable `CONTRACT_VERSION >= 1.0.0`.

## Consequences

### Positive
- `wb.dispatch` consumer-wiring tasks can be written now (import via `workspace:*`).
- Contract edits propagate instantly during the churn phase.

### Negative
- A consumer's standalone CI cannot build until cutover; documented as a known Phase-0 limitation.
- A two-phase plan carries the risk of stalling at Phase-0; the explicit cutover trigger is the mitigation.

### Follow-ups required
- [ ] (amit-t) Record the cutover trigger in `bio-contracts` README distribution section when that task runs.
- [ ] (amit-t) Phase-1: prerelease publish CI + consumer pin — tracked as a future bio-contracts fix-plan item, not opened now.

## References
- SPEC: SPEC-001
- TDD: TDD-001
- Related: ADR-003 (envelope shape)
