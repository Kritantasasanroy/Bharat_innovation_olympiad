/**
 * Cross-repo event envelope (PRD-PLAT-02 FR-7).
 *
 * Every event exchanged between the four BIO repos (bio-portal, bio-admin,
 * bio-exam, bio-proctor) travels inside this versioned envelope. Consumers
 * reject any envelope whose **major** version they do not understand
 * (FR-8 fail-closed), so the envelope — not the bare payload — is the unit a
 * contract fixture pins.
 *
 * The shape mirrors the `@bio/domain-contracts` event envelope published by the
 * `bio-contracts` package. bio-admin does not own that package, so this module
 * re-declares the envelope locally for fixture authoring; the
 * {@link EXPECTED_CONTRACT_VERSION} gate keeps the two in lock-step.
 */

/** The four BIO service repos that produce or consume cross-repo events. */
export type BioRepo = "bio-portal" | "bio-admin" | "bio-exam" | "bio-proctor";

/**
 * Security field classification (PRD-PLAT-02 FR-5).
 *
 * Tags the most sensitive class of data a given event payload may carry, so a
 * fixture can be reviewed against the rule that student-facing contracts never
 * carry answer keys, payment secrets, or biometric data.
 */
export type FieldClassification =
	| "public"
	| "authenticated-student"
	| "admin-only"
	| "service-internal"
	| "biometric/sensitive"
	| "payment-sensitive";

/**
 * The versioned event envelope shared by every cross-repo event.
 *
 * Field order matches FR-7:
 * `eventId · eventType · eventVersion · occurredAt · producer ·
 *  correlationId · causationId · idempotencyKey · payload`.
 */
export interface EventEnvelope<TType extends string = string, TPayload = unknown> {
	/** Globally-unique id for this event instance (idempotent de-dup key #1). */
	readonly eventId: string;
	/** Canonical event-type name from the catalog (PRD-PLAT-02 §7). */
	readonly eventType: TType;
	/** SemVer of the event-family contract. Consumers reject unknown majors. */
	readonly eventVersion: string;
	/** ISO-8601 instant the event occurred at the producer. */
	readonly occurredAt: string;
	/** The repo that emitted the event. */
	readonly producer: BioRepo;
	/** Correlates all events in one business saga. */
	readonly correlationId: string;
	/** The id of the event that caused this one, or `null` if root. */
	readonly causationId: string | null;
	/** Stable key consumers checkpoint on for at-least-once delivery (FR-7/§13). */
	readonly idempotencyKey: string;
	/** The typed business payload. */
	readonly payload: TPayload;
}

/** Whether a fixture represents the emitting (producer) or receiving (consumer) side. */
export type FixtureRole = "producer" | "consumer";

/**
 * A single contract fixture: one envelope plus the side it represents.
 *
 * A **producer** fixture captures exactly what the emitting repo serializes; a
 * **consumer** fixture captures exactly what the receiving repo expects to
 * validate. Pinning both sides per event type is what lets CI detect drift in
 * either direction (PRD-PLAT-02 FR-8 "producer and consumer fixtures").
 */
export interface EventFixture<TType extends string = string, TPayload = unknown> {
	/** Which side of the contract this fixture pins. */
	readonly role: FixtureRole;
	/** Canonical event type — must equal `envelope.eventType`. */
	readonly eventType: TType;
	/** The envelope instance this fixture asserts. */
	readonly envelope: EventEnvelope<TType, TPayload>;
}

/** Inputs for {@link makeEnvelope}; ids default to deterministic, per-event seeds. */
export interface EnvelopeInit<TType extends string, TPayload> {
	readonly eventType: TType;
	readonly eventVersion: string;
	readonly producer: BioRepo;
	readonly payload: TPayload;
	/** Deterministic seed used to derive ids; defaults to `eventType`. */
	readonly seed?: string;
	/** ISO instant; defaults to a fixed sample timestamp (fixtures are static). */
	readonly occurredAt?: string;
	readonly causationId?: string | null;
}

/** Fixed sample timestamp — fixtures are deterministic (no wall-clock reads). */
const SAMPLE_OCCURRED_AT = "2026-01-01T00:00:00.000Z";

/**
 * Build a well-formed {@link EventEnvelope} with deterministic ids.
 *
 * Ids are derived from a stable seed (the event type by default) so fixtures
 * are byte-stable across runs and reviewable in diffs — never `Date.now()` or
 * random uuids, which would make the fixtures non-reproducible.
 */
export function makeEnvelope<TType extends string, TPayload>(
	init: EnvelopeInit<TType, TPayload>,
): EventEnvelope<TType, TPayload> {
	const seed = init.seed ?? init.eventType;
	return {
		eventId: `evt_${seed}_0001`,
		eventType: init.eventType,
		eventVersion: init.eventVersion,
		occurredAt: init.occurredAt ?? SAMPLE_OCCURRED_AT,
		producer: init.producer,
		correlationId: `corr_${seed}_0001`,
		causationId: init.causationId ?? null,
		idempotencyKey: `idem_${seed}_0001`,
		payload: init.payload,
	};
}

/** Construct a producer-side fixture from an envelope init. */
export function producerFixture<TType extends string, TPayload>(
	init: EnvelopeInit<TType, TPayload>,
): EventFixture<TType, TPayload> {
	return { role: "producer", eventType: init.eventType, envelope: makeEnvelope(init) };
}

/** Construct a consumer-side fixture from an envelope init. */
export function consumerFixture<TType extends string, TPayload>(
	init: EnvelopeInit<TType, TPayload>,
): EventFixture<TType, TPayload> {
	return {
		role: "consumer",
		eventType: init.eventType,
		envelope: makeEnvelope({ ...init, seed: init.seed ?? `${init.eventType}_consumer` }),
	};
}

/** The nine required envelope fields, used by structural validators. */
export const REQUIRED_ENVELOPE_FIELDS: readonly (keyof EventEnvelope)[] = [
	"eventId",
	"eventType",
	"eventVersion",
	"occurredAt",
	"producer",
	"correlationId",
	"causationId",
	"idempotencyKey",
	"payload",
];
