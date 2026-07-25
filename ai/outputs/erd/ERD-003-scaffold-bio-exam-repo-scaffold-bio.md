---
id: ERD-003
title: "Repo Scaffold: bio-exam"
status: approved
created: 2026-06-18
owner: amit-t
epic: EPIC-SCAFFOLD-bio-exam
related_spec: SPEC-003
target_repos: [bio-exam, bio-contracts]
precision_mode: on
---

# ERD-003: Repo Scaffold: bio-exam

## 1. DB entity-relationship

No database schema is introduced by this scaffold. PRD-003 section 14 and SPEC-003 section 5 state no final attempt DB schema is defined; module boundaries only reserve homes for runtime domain, attempt gate, player/autosave, timer, submission, readiness, SEB, snapshot import, entitlement import, and observability/testkit. Attempt-state tables and their migrations belong to the owning downstream EXAM SPEC. No tables are invented here.

## 2. C4 Level-2: components

```mermaid
flowchart LR
    subgraph exam["bio-exam (service)"]
        subgraph apps["apps"]
            EW[exam-web]
        end
        subgraph gw["in/http + gateway"]
            EAPI[exam-api]
            EWS[exam-ws / polling gateway]
        end
        subgraph core["core/runtime-domain (no adapters)"]
            ATTEMPT[attempt gate]
            PLAYER[player/autosave]
        end
        subgraph consumers["event consumers"]
            SIC[snapshot-import-consumer]
            EC[entitlement-consumer]
        end
        subgraph workers["workers"]
            EWK[exam-worker]
            TWK[timer-worker]
        end
        subgraph out["out/adapters"]
            CC[contract clients]
            SEB[SEB/readiness adapters]
            OBX[outbox writer]
            OBS[observability/testkit]
        end
    end
    contracts["bio-contracts: domain-contracts + shared-types + auth-kit + clients + fixtures"]
    admin["bio-admin: ExamSnapshotPublished / ExamSlotRuntimeWindowChanged"]
    portal["bio-portal (not registered): RegistrationConfirmed"]

    EW --> EAPI
    EW --> EWS
    EAPI --> ATTEMPT
    EAPI --> PLAYER
    SIC --> ATTEMPT
    EC --> ATTEMPT
    ATTEMPT --> CC
    PLAYER --> OBX
    TWK --> OBX
    SEB --> EAPI
    contracts --> ATTEMPT
    contracts --> CC
    contracts --> SIC
    contracts --> EC
    admin -.ExamSnapshotPublished.-> SIC
    portal -.RegistrationConfirmed.-> EC
```

**Notes:** new components are every box inside `bio-exam`; `bio-contracts` is the dimmed dependency. `bio-admin` and `bio-portal` are upstream event producers (dotted; `bio-portal` not yet registered). `RegistrationConfirmed` enters via `entitlement-consumer` and becomes `ExamRegistration` to gate attempt start. Snapshots arrive key-stripped through `snapshot-import-consumer`. The `boundaries` gate keeps SEB/readiness adapters and contract clients outside `core/runtime-domain`.

## 3. Scaffold validation / build / contract flow (sequence)

```mermaid
sequenceDiagram
    participant Dev as Contributor
    participant CI as bio-exam CI
    participant BND as boundaries gate
    participant FF as forbidden-field test
    participant CT as test:contract
    participant ENV as production env validation
    Dev->>CI: push scaffold change
    CI->>CI: dev, build, typecheck, lint, format:check, test
    CI->>BND: assert no domain import of adapter/infra/SDK/ORM/UI
    BND-->>CI: fail-closed on violation
    CI->>FF: assert no answer key / correct-flag / pre-release explanation in contracts or fixtures
    FF-->>CI: hard block on any leak
    CI->>CT: verify ExamSnapshotPublished + RegistrationConfirmed contracts and fixtures
    CT-->>CI: fail-closed on missing/incompatible contract
    CI->>ENV: secret scan + required-credential check
    ENV-->>CI: fail-closed on missing secret
```

## 4. Change summary

| Object | Change | Owner repo |
|--------|--------|------------|
| `exam-web` app shell (readiness/attempt/player/post-submit placeholders) | add | bio-exam |
| `exam-api`, `exam-ws`/polling gateway, `exam-worker`, `timer-worker` boundaries | add | bio-exam |
| `snapshot-import-consumer`, `entitlement-consumer` entrypoints | add | bio-exam |
| Module homes: runtime domain, contract clients, SEB/readiness adapters, observability/testkit | add | bio-exam |
| Script + gate set incl. `boundaries`, forbidden-field test, secret scan, prod env validation | add | bio-exam |
| Contract fixtures for consumed/emitted runtime events | add | bio-exam |
| `domain-contracts` / `shared-types` / `auth-kit` / contract clients consumption | use | bio-contracts |

## 5. Migration notes

- Forward: greenfield repo; no data migration. Downstream EXAM SPECs add attempt-state tables inside their mapped module home with their own migrations.
- Rollback: revert the scaffold package version or disable the inert baseline deployment if CI, startup, or forbidden-field checks fail. Fully reversible.
