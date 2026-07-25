/**
 * Cross-repo contract seam for `analytics-worker`.
 *
 * Single import path for every cross-repo contract shape consumed inside this
 * worker. Core code imports from here (`@contracts`) and never from the
 * underlying `@bio/*` contract packages directly, so the boundary gate has
 * exactly one checkpoint to police (see `.eslintrc.json`).
 *
 * The cross-repo **event envelope** (`eventId`, `eventType`, `eventVersion`,
 * `occurredAt`, `producer`, `correlationId`, `causationId`, `idempotencyKey`,
 * `payload`) is owned by `@bio/domain-contracts`, published from the
 * `bio-contracts` repo. That package is not yet a dependency of this workspace,
 * so the envelope is sourced here from the local `@bio/admin-contract-fixtures`
 * re-declaration that the `EXPECTED_CONTRACT_VERSION` gate keeps in lock-step.
 * When `@bio/domain-contracts` lands, swap the source **here and only here**:
 *
 * ```ts
 * export type { EventEnvelope as BioEventEnvelope } from "@bio/domain-contracts";
 * ```
 */

export type { EventEnvelope as BioEventEnvelope } from "@bio/admin-contract-fixtures/events";
