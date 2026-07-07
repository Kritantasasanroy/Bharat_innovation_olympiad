/**
 * Per-family event payload schemas for the PLAT-02 §7 canonical event catalog.
 *
 * Each family file (`commerce`, `admin`, `runtime`, `proctor`) declares the
 * payload schema for every event it owns, with every field tagged with a
 * {@link FieldClassification}. This barrel merges them into one registry keyed
 * by the canonical `eventType`, so a producer/consumer can resolve the schema
 * for any catalog event at runtime.
 */
import type { z } from "zod";
import { ADMIN_EVENT_PAYLOADS } from "./admin.ts";
import { COMMERCE_EVENT_PAYLOADS } from "./commerce.ts";
import { PROCTOR_EVENT_PAYLOADS } from "./proctor.ts";
import { RUNTIME_EVENT_PAYLOADS } from "./runtime.ts";

export * from "./_shared.ts";
export * from "./admin.ts";
export * from "./commerce.ts";
export * from "./proctor.ts";
export * from "./runtime.ts";

/**
 * Registry of every catalog event type -> its classification-tagged payload
 * schema. The keys are the canonical FR-7 `eventType` strings (used verbatim).
 */
export const EVENT_PAYLOAD_SCHEMAS = {
	...COMMERCE_EVENT_PAYLOADS,
	...ADMIN_EVENT_PAYLOADS,
	...RUNTIME_EVENT_PAYLOADS,
	...PROCTOR_EVENT_PAYLOADS,
} as const;

/** Every canonical catalog event type (a union of string literals). */
export type CatalogEventType = keyof typeof EVENT_PAYLOAD_SCHEMAS;

/** Sorted-by-family list of every catalog event type. */
export const CATALOG_EVENT_TYPES = Object.keys(EVENT_PAYLOAD_SCHEMAS) as CatalogEventType[];

/** The inferred payload type for a given catalog event type. */
export type EventPayload<K extends CatalogEventType> = z.infer<(typeof EVENT_PAYLOAD_SCHEMAS)[K]>;

/** Resolve the payload schema for a catalog event type. */
export function payloadSchemaFor<K extends CatalogEventType>(
	eventType: K,
): (typeof EVENT_PAYLOAD_SCHEMAS)[K] {
	return EVENT_PAYLOAD_SCHEMAS[eventType];
}

/** Type guard: is `eventType` a known catalog event type? */
export function isCatalogEventType(eventType: string): eventType is CatalogEventType {
	return Object.hasOwn(EVENT_PAYLOAD_SCHEMAS, eventType);
}
