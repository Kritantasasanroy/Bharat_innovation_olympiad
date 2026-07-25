---
id: ERD-004
title: "Attempt Lifecycle & Entitlement Gate (Ownership on HTTP + WS)"
status: draft
created: 2026-07-03
owner: deepak
epic: EPIC-EXAM-02
related_spec: SPEC-004
target_repos: [bio-exam, bio-admin, bio-contracts]
precision_mode: on
---

# ERD-004: Attempt Lifecycle & Entitlement Gate (Ownership on HTTP + WS)

## 1. DB entity-relationship

`bio-exam` owns `Attempt`. `ExamRegistration` and `ExamSnapshot` are local read-model projections
built by consumers from `RegistrationConfirmed` (PORTAL-07) and `ExamSnapshotPublished` (ADMIN-04). The
snapshot projection is key-stripped: no answer keys land in the runtime database.

```mermaid
erDiagram
    ExamRegistration ||--o| Attempt : "gates (1 active per registration)"
    ExamSnapshot ||--o{ Attempt : "pinned version"
    Attempt {
        uuid id PK
        uuid registrationId UK "unique: one attempt per registration"
        uuid userId "ownership subject (IDOR guard)"
        uuid slotId
        uuid examSnapshotId FK "pinned key-stripped version"
        string status "NOT_STARTED..VOIDED"
        timestamptz startedAt
        timestamptz endsAt "min(startedAt+duration, slotEndsAt)"
        timestamptz submittedAt
        int gracePeriodSecs
        timestamptz createdAt
    }
    ExamRegistration {
        uuid registrationId PK
        uuid userId
        uuid slotId
        timestamptz slotStartsAt
        timestamptz slotEndsAt
        uuid examSnapshotId
        int snapshotDurationSecs
        string state "ACTIVE|CONFIRMED|CANCELLED|REFUNDED"
    }
    ExamSnapshot {
        uuid examSnapshotId PK
        uuid examId
        int durationSecs
        boolean keyStripped "always true in runtime"
    }
```

**Notes:** the unique constraint on `Attempt.registrationId` is the idempotency key (FR-7): a
double-start resolves to the existing row. `userId` is the single ownership subject checked on every
HTTP route and the WS join. `examSnapshotId` pins the immutable published version so mid-window
re-publishes never change a live attempt.

## 2. C4 Level-2: components

```mermaid
flowchart LR
    subgraph exam["bio-exam (service)"]
        EAPI[exam-api: start-attempt + get-attempt]
        EWS[exam-ws timer-room join]
        subgraph core["core (no adapters)"]
            GATE[entitlement.policy]
            AGG[attempt.aggregate + state machine]
            OWN[assertOwner]
            SVC[start-attempt.service]
        end
        EC[entitlement-consumer]
        SIC[snapshot-import-consumer]
        REPO[(Attempt table)]
        RM[(Registration + Snapshot read-models)]
    end
    TIMER[timer port: EXAM-04]
    BUS[EventBus: attempt.started/submitted]
    admin["bio-admin: ExamSnapshotPublished (key-stripped)"]
    portal["bio-portal: RegistrationConfirmed / Cancelled"]

    EAPI --> OWN
    EAPI --> SVC
    EWS --> OWN
    SVC --> GATE
    SVC --> AGG
    SVC --> RM
    SVC --> REPO
    SVC --> TIMER
    SVC --> BUS
    portal -.RegistrationConfirmed.-> EC --> RM
    admin -.ExamSnapshotPublished.-> SIC --> RM
```

The `boundaries` gate keeps `core` free of adapters: the policy, aggregate, ownership predicate, and
service import only ports, never Drizzle, Elysia, Redis, or the WS library.

## 3. Hot path: start-attempt (create)

```mermaid
sequenceDiagram
    participant Web as exam-web
    participant API as exam-api
    participant RM as Registration read-model
    participant Pol as entitlement.policy
    participant Timer as timer port (EXAM-04)
    participant DB as Attempt table
    participant Bus as EventBus
    Web->>API: POST /student/registrations/:id/start-attempt
    API->>RM: findActive(registrationId)
    RM-->>API: ExamRegistration (owner + window + snapshot)
    API->>Pol: gate(registration, now, seb, readiness)
    Pol-->>API: allow
    API->>DB: findByRegistration(id)
    DB-->>API: none
    API->>API: endsAt = min(now+durationSecs, slotEndsAt)
    API->>Timer: schedule(attemptId, endsAt)
    Timer-->>API: scheduled
    API->>DB: createIfAbsent(IN_PROGRESS)  %% unique(registrationId)
    API->>Bus: emit attempt.started (outbox, same tx)
    API-->>Web: 201 {attemptId, endsAt, serverNow}
```

If the timer cannot schedule, the service returns `503` and persists no attempt (fail closed, no
untimed exam).

## 4. Change summary

| Object | Change | Owner repo |
|--------|--------|------------|
| `Attempt` table + unique(`registrationId`) | add | bio-exam |
| `ExamRegistration` / `ExamSnapshot` read-model projections | add | bio-exam |
| entitlement.policy, attempt.aggregate, assertOwner, start-attempt.service | add | bio-exam |
| ownership guard on HTTP routes + WS join | add | bio-exam |
| entitlement-consumer / snapshot-import-consumer apply logic | modify | bio-exam |
| `attempt.started` / `attempt.submitted` emission | add | bio-exam |
| `RegistrationConfirmed`, `ExamSnapshotPublished`, runtime events | use | bio-contracts |
| key-stripped `ExamSnapshotPublished` producer | use | bio-admin |

## 5. Migration notes

- **Forward:** additive migration creating `Attempt` with the unique constraint on `registrationId`. No
  backfill. Against the shared Neon database the change is additive, so the legacy monolith engine keeps
  serving during cutover.
- **Rollback:** drop the `Attempt` table and constraint. No data loss because the capability is new and
  the flag (`exam02_attempt_gate`) gates traffic. Emitted events are idempotent, so replay after
  rollback does not double-apply.
