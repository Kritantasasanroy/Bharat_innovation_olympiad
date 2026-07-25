/**
 * Shared building blocks for the per-family event payload schemas
 * (`commerce`, `admin`, `runtime`, `proctor`) defined in this directory.
 *
 * PLAT-02 FR-5 requires every cross-service field to carry exactly one
 * {@link FieldClassification}. The field constructors below bake the
 * classification (and a human description) into each schema so a payload field
 * cannot be declared without one, and {@link unclassifiedFields} lets contract
 * tests assert the invariant holds for the whole catalog.
 *
 * Classification rule of thumb: tag a field for its *most restrictive* consumer.
 * Student-facing contracts must never carry `admin-only`, `service-internal`,
 * `biometric/sensitive`, or `payment-sensitive` fields (PLAT-02/PLAT-05 leak
 * guards).
 */
import { z } from "zod";
import {
	classificationOf,
	classify,
	FieldClassification,
} from "../../../shared-types/src/index.ts";

export { classificationOf, classify, FieldClassification };

/** A single classification-tagged payload field. */
export type ClassifiedField = z.ZodType;

/**
 * Map of canonical catalog event-type string (used verbatim as the key) to its
 * classification-tagged payload schema. Keys match the FR-7 `eventType` field.
 */
export type EventCatalog = Readonly<Record<string, z.ZodObject>>;

/** ISO-8601 timestamp field. Event timestamps are metadata, `public` by default. */
export function timestamp(
	description: string,
	classification: FieldClassification = FieldClassification.Public,
): ClassifiedField {
	return classify(z.iso.datetime({ offset: true }).describe(description), classification);
}

/** A non-empty identifier-string field (FR-6 value-object identities cross the wire as strings). */
export function id(description: string, classification: FieldClassification): ClassifiedField {
	return classify(z.string().min(1).describe(description), classification);
}

/** A free-form classified string field. */
export function text(description: string, classification: FieldClassification): ClassifiedField {
	return classify(z.string().describe(description), classification);
}

/** A classified non-negative integer field (counts, monetary amounts in minor units). */
export function count(description: string, classification: FieldClassification): ClassifiedField {
	return classify(z.number().int().nonnegative().describe(description), classification);
}

/** A classified boolean flag field. */
export function flag(description: string, classification: FieldClassification): ClassifiedField {
	return classify(z.boolean().describe(description), classification);
}

/** A classified `[0, 1]` ratio field (match/risk confidences). */
export function ratio(description: string, classification: FieldClassification): ClassifiedField {
	return classify(z.number().min(0).max(1).describe(description), classification);
}

/** A classified bounded score field (`>= 0`). */
export function score(description: string, classification: FieldClassification): ClassifiedField {
	return classify(z.number().nonnegative().describe(description), classification);
}

/**
 * Classify an arbitrary Zod schema (enums, unions, optionals). `classify` must
 * be the outermost call, so callers pass a fully-built schema here and get it
 * back tagged. Apply `.optional()` *before* handing the schema in.
 */
export function field<T extends z.ZodType>(
	schema: T,
	classification: FieldClassification,
	description?: string,
): T {
	const described = description === undefined ? schema : (schema.describe(description) as T);
	return classify(described, classification);
}

/** Identity helper that pins a catalog literal to {@link EventCatalog} without widening keys. */
export function defineCatalog<const T extends EventCatalog>(catalog: T): T {
	return catalog;
}

/**
 * Names of the fields in `schema` that are NOT classification-tagged. Empty for
 * a correctly-built payload; used by contract tests to enforce FR-5.
 */
export function unclassifiedFields(schema: z.ZodObject): string[] {
	return Object.entries(schema.shape)
		.filter(([, fieldSchema]) => classificationOf(fieldSchema as z.ZodType) === undefined)
		.map(([name]) => name);
}
