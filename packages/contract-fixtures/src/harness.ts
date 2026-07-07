/**
 * Contract-test harness for the BIO cross-repo event fixtures.
 *
 * Two pure, unit-tested concerns live here:
 *
 *   1. {@link envelopeSchemaFor} builds a Zod schema that validates a full
 *      envelope for one event type (the transport metadata plus the event's
 *      classified payload schema), so every fixture can be checked against the
 *      exact shape a consumer parses off the wire (TDD-001 §7, AC-7).
 *   2. {@link ContractConsumer} models the consumer-side transport rules the
 *      failure matrix pins down (TDD-001 §6). An unknown-major `eventVersion` is
 *      rejected fail-closed *without* advancing the checkpoint; a duplicate or a
 *      replay of an already-checkpointed `(eventId, idempotencyKey)` is a no-op
 *      (AC-5, AC-8).
 */
import { z } from "zod";
import {
	type CatalogEventType,
	isCatalogEventType,
	payloadSchemaFor,
} from "../../domain-contracts/src/index.ts";
import {
	CONTRACT_VERSION,
	isCompatibleMajor,
	parseContractVersion,
	parseSemVer,
} from "../../shared-types/src/index.ts";

/** The four services that may emit a BIO event. */
const PRODUCERS = ["bio-portal", "bio-admin", "bio-exam", "bio-proctor"] as const;

/** The canonical contract version, parsed once for the compatibility gate. */
const CURRENT_CONTRACT = parseContractVersion(CONTRACT_VERSION);

/**
 * Transport-metadata fields shared by every envelope, independent of payload.
 * Matches {@link BioEventEnvelope}; `causationId` is the only optional field.
 */
export const envelopeMetadataSchema = z.object({
	eventId: z.string().min(1),
	eventType: z.string().min(1),
	eventVersion: z.string().min(1),
	occurredAt: z.iso.datetime({ offset: true }),
	producer: z.enum(PRODUCERS),
	correlationId: z.string().min(1),
	causationId: z.string().min(1).optional(),
	idempotencyKey: z.string().min(1),
});

/**
 * Build the full envelope schema (metadata + typed payload) for one catalog
 * event type. The `eventType` field is pinned to the literal so a fixture
 * tagged for one event cannot smuggle in another event's payload.
 */
export function envelopeSchemaFor<K extends CatalogEventType>(eventType: K) {
	return envelopeMetadataSchema.extend({
		eventType: z.literal(eventType),
		payload: payloadSchemaFor(eventType),
	});
}

/**
 * The dedupe checkpoint key a consumer stores per accepted event. A consumer
 * checkpoints on `(eventId, idempotencyKey)` (TDD-001 §5).
 */
export function checkpointKey(eventId: string, idempotencyKey: string): string {
	return `${eventId}::${idempotencyKey}`;
}

/** Why an envelope was not accepted. */
export type RejectionReason = "invalid-envelope" | "unknown-major" | "invalid-payload";

/** The outcome of feeding one candidate envelope to a {@link ContractConsumer}. */
export type IngestOutcome =
	| { readonly status: "accepted"; readonly key: string }
	| { readonly status: "duplicate"; readonly key: string }
	| { readonly status: "rejected"; readonly reason: RejectionReason; readonly message: string };

/** Concise, deterministic one-line summary of a Zod validation failure. */
function summariseError(error: z.ZodError): string {
	return error.issues
		.map((issue) => {
			const path = issue.path.join(".");
			return path === "" ? issue.message : `${path}: ${issue.message}`;
		})
		.join("; ");
}

/**
 * A minimal consumer that applies the cross-repo transport rules to a stream of
 * candidate envelopes. It holds the checkpoint of accepted
 * `(eventId, idempotencyKey)` keys so duplicate and replay deliveries collapse
 * to no-ops, and rejects fail-closed on anything it does not understand.
 */
export class ContractConsumer {
	private readonly seen = new Set<string>();

	/** Keys the consumer has accepted (its advanced checkpoint). */
	get checkpoint(): readonly string[] {
		return [...this.seen];
	}

	/** True once the consumer has accepted an event with this key. */
	hasSeen(key: string): boolean {
		return this.seen.has(key);
	}

	/**
	 * Process one candidate envelope. Order matters: the envelope shape and the
	 * unknown-major gate are checked *before* the payload or the checkpoint, so a
	 * version we do not understand is never best-effort parsed and never advances
	 * the checkpoint (TDD-001 §6, AC-5).
	 */
	ingest(candidate: unknown): IngestOutcome {
		const meta = envelopeMetadataSchema.safeParse(candidate);
		if (!meta.success) {
			return {
				status: "rejected",
				reason: "invalid-envelope",
				message: summariseError(meta.error),
			};
		}

		const { eventId, eventType, eventVersion, idempotencyKey } = meta.data;

		const version = parseSemVer(eventVersion);
		if (version === null || !isCompatibleMajor(version, CURRENT_CONTRACT)) {
			return {
				status: "rejected",
				reason: "unknown-major",
				message: `eventVersion ${eventVersion} is not compatible with contract ${CONTRACT_VERSION}`,
			};
		}

		if (!isCatalogEventType(eventType)) {
			return {
				status: "rejected",
				reason: "invalid-payload",
				message: `unknown event type: ${eventType}`,
			};
		}

		const parsed = envelopeSchemaFor(eventType).safeParse(candidate);
		if (!parsed.success) {
			return {
				status: "rejected",
				reason: "invalid-payload",
				message: summariseError(parsed.error),
			};
		}

		const key = checkpointKey(eventId, idempotencyKey);
		if (this.seen.has(key)) {
			return { status: "duplicate", key };
		}
		this.seen.add(key);
		return { status: "accepted", key };
	}
}
