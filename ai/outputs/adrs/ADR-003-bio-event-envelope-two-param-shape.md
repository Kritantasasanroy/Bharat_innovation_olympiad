---
id: ADR-003
title: "BioEventEnvelope is two-param (TType, TPayload) in the shared package"
status: approved
created: 2026-06-30
owner: amit-t
epic: EPIC-SCAFFOLD-bio-contracts
related_spec: SPEC-001
supersedes: —
superseded_by: —
precision_mode: on
---

# ADR-003: BioEventEnvelope shape — two type parameters in the shared package

## Context

`bio-contracts/packages/domain-contracts` exports the canonical event envelope as `BioEventEnvelope<TPayload>` — one type parameter. Consumers in `bio-admin` dispatch events by type, so they locally re-declared `BioEventEnvelope<TType, TPayload>` (two params) and an `event-consumer.port.ts` with `consume(envelope: BioEventEnvelope<TType, TPayload>)`. That local re-declaration is a duplicated DTO: it violates the "0 duplicated DTOs" boundary gate the admin-api seam (`services/admin-api/src/contracts/index.ts` L70) explicitly calls out ("Do not re-create these shapes locally").

So the shared shape and the in-use shape diverge. The cross-repo fix plan left the arity unresolved inside tasks 3/12. The shape is hard-to-reverse: it is the type signature every producer and consumer imports.

## Decision drivers

- **Boundary gate "0 duplicated DTOs"** — the divergence is currently a live violation in bio-admin.
- **Consume-by-type is a real need** — a consumer routing on event type needs `TType` in the signature, not just payload.
- **Back-compat for existing call sites** — current 1-param producers must keep compiling.
- **Single source of truth (SPEC-001)** — one canonical envelope, not per-repo variants.

## Options considered

### Option A: Widen shared envelope to two params with defaults
```ts
BioEventEnvelope<TType extends CrossRepoEventType = CrossRepoEventType, TPayload = unknown>
```
- Pros: superset of the 1-param form — existing `BioEventEnvelope<P>`-style sites still compile via the defaulted `TType`; bio-admin deletes its local re-declaration and imports canonical, clearing the boundary-gate violation; supports consume-by-type. Wait — note: 1-param call sites that wrote `BioEventEnvelope<MyPayload>` bind `MyPayload` to the FIRST param, so the rename is not purely additive (see Negative).
- Cons: any existing site that passed payload as the single arg must be migrated to pass it as the second arg (or use a payload-first alias). Bounded, mechanical.
- Cost / effort: S (one shared edit + delete local dup + migrate call sites).

### Option B: Keep one param, force consumers to carry their own type tag separately
- Pros: no change to shared shape.
- Cons: leaves the bio-admin duplicate in place or pushes the type tag outside the envelope — boundary-gate violation persists or moves; consume-by-type stays awkward.
- Cost / effort: S but does not resolve the violation — defeats the purpose.

### Option C: Two params, no defaults (required TType)
- Pros: forces every site to name the event type — maximal type safety.
- Cons: breaks every existing 1-param call site at once; larger migration; no graceful path.
- Cost / effort: M (breaks all call sites).

## Decision

**Chosen:** Option A.
**Why:** It is the only option that clears the live "0 duplicated DTOs" violation while supporting the consume-by-type pattern bio-admin already needs. Defaulted type params keep the migration bounded and mechanical rather than a hard break (Option C). Keeping one param (Option B) leaves the violation unresolved.

**Call-site note:** because `TType` is the first param, any prior `BioEventEnvelope<SomePayload>` must move the payload to the second slot. The replan task for bio-contracts must enumerate and migrate those sites, or ship a `payload-first` alias if the count is large. This is mechanical, not architectural.

## Consequences

### Positive
- One canonical envelope; bio-admin's local re-declaration and divergent `event-consumer.port.ts` signature are deleted and re-imported from `domain-contracts`.
- Boundary gate "0 duplicated DTOs" passes.
- Consumers can route on `TType`.

### Negative
- Existing 1-param call sites need a mechanical payload-slot migration (bounded; enumerated in the bio-contracts replan task).

### Follow-ups required
- [ ] (amit-t) bio-contracts: widen `BioEventEnvelope` to two defaulted params; enumerate + migrate 1-param sites.
- [ ] (amit-t) bio-admin: delete local `BioEventEnvelope` re-declaration and `event-consumer.port.ts` divergent signature; import canonical.

## References
- SPEC: SPEC-001
- TDD: TDD-001
- Related: ADR-002 (distribution mechanism)
