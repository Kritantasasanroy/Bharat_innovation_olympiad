/**
 * Inbound (driving) event-consumer port for `admin-worker`.
 *
 * The worker is driven by cross-repo events delivered inside the versioned
 * {@link BioEventEnvelope}. An adapter (queue / stream subscriber) decodes a
 * delivery into an envelope and drives the core through this port.
 *
 * **Inert until the owning PRD lands.** This declares the contract shape only;
 * no concrete consumer, routing, or side effects exist yet. The owning feature
 * PRD (curation and scheduling admin events) defines the event types and
 * handling semantics.
 */

import type { BioEventEnvelope } from "@contracts";

/**
 * Driving port: handle one delivered cross-repo event envelope.
 *
 * `TType`/`TPayload` narrow the envelope to the event family a concrete
 * consumer understands. Implementations are added when the owning PRD lands.
 */
export interface EventConsumer<TType extends string = string, TPayload = unknown> {
	/** Canonical event types this consumer handles (catalog names). */
	readonly handles: readonly TType[];
	/**
	 * Process a single delivered envelope.
	 *
	 * At-least-once delivery is assumed, so implementations must be idempotent
	 * on `envelope.idempotencyKey`.
	 */
	consume(envelope: BioEventEnvelope<TType, TPayload>): Promise<void>;
}
