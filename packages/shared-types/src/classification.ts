import type { z } from "zod";

/**
 * Security field classification (PLAT-02 FR-5).
 *
 * Every cross-service field/schema is tagged with exactly one of these. The
 * classification drives the leak guards in PLAT-02/PLAT-05: student-facing
 * contracts must never carry `admin-only`, `service-internal`,
 * `biometric/sensitive`, or `payment-sensitive` fields.
 */
export enum FieldClassification {
	/** Safe for anyone, including anonymous/marketing surfaces. */
	Public = "public",
	/** Visible to the authenticated owning student only. */
	AuthenticatedStudent = "authenticated-student",
	/** Admin/back-office surfaces only. */
	AdminOnly = "admin-only",
	/** Never serialised to any external consumer (internal-to-service). */
	ServiceInternal = "service-internal",
	/** Biometric/sensitive personal data (DPDP-governed). */
	BiometricSensitive = "biometric/sensitive",
	/** Payment secrets / instrument data. */
	PaymentSensitive = "payment-sensitive",
}

/** Metadata key under which {@link classify} stores the classification. */
export const CLASSIFICATION_META_KEY = "bioFieldClassification";

/** True when `value` is one of the {@link FieldClassification} members. */
export function isFieldClassification(value: unknown): value is FieldClassification {
	return (
		typeof value === "string" && (Object.values(FieldClassification) as string[]).includes(value)
	);
}

/**
 * Tag a Zod schema with a {@link FieldClassification} via Zod metadata.
 *
 * Returns a new schema (Zod `.meta()` is immutable) carrying the classification
 * under {@link CLASSIFICATION_META_KEY}, so it also surfaces in generated JSON
 * Schema / OpenAPI output. Read it back with {@link classificationOf}.
 *
 * @example
 * const Email = classify(z.string().email(), FieldClassification.AuthenticatedStudent);
 */
export function classify<T extends z.ZodType>(schema: T, classification: FieldClassification): T {
	return schema.meta({ [CLASSIFICATION_META_KEY]: classification }) as T;
}

/**
 * Read the {@link FieldClassification} tagged onto a schema by {@link classify},
 * or `undefined` if the schema was never classified.
 */
export function classificationOf(schema: z.ZodType): FieldClassification | undefined {
	const meta = schema.meta();
	if (meta === undefined) {
		return undefined;
	}
	const value = (meta as Record<string, unknown>)[CLASSIFICATION_META_KEY];
	return isFieldClassification(value) ? value : undefined;
}
