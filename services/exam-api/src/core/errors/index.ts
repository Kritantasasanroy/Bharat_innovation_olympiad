/**
 * Domain error types.
 *
 * All domain-layer errors extend {@link DomainError}, which carries a
 * machine-readable `code` and an `httpStatus` so that the HTTP adapter
 * layer can map them to the correct response without instanceof chains.
 */

/**
 * Base class for all domain errors.
 *
 * Subclasses set their own `code` and `httpStatus`; the global Elysia
 * error handler uses these fields to build a standard {@link ApiError}
 * response envelope.
 */
export class DomainError extends Error {
	/** Machine-readable error code (e.g. "NOT_FOUND", "VALIDATION_ERROR"). */
	readonly code: string;
	/** HTTP status code to return when this error reaches the HTTP boundary. */
	readonly httpStatus: number;

	constructor(message: string, code: string, httpStatus: number) {
		super(message);
		this.name = this.constructor.name;
		this.code = code;
		this.httpStatus = httpStatus;

		// Restore prototype chain (required when extending built-ins with TS)
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

/** Thrown when a requested resource cannot be found. */
export class NotFoundError extends DomainError {
	constructor(entity = "Resource", id?: string) {
		const message = id ? `${entity} ${id} not found` : `${entity} not found`;
		super(message, "NOT_FOUND", 404);
	}
}

/** Thrown when input fails domain validation rules. */
export class ValidationError extends DomainError {
	/** Optional field-level details for structured validation feedback. */
	readonly fields: readonly { readonly field: string; readonly message: string }[];

	constructor(
		message = "Validation failed",
		fields: readonly { readonly field: string; readonly message: string }[] = [],
	) {
		super(message, "VALIDATION_ERROR", 400);
		this.fields = fields;
	}
}

/** Thrown when an external provider (AI, database, etc.) returns an error. */
export class ProviderError extends DomainError {
	/** The original error from the provider, if available. */
	readonly cause?: Error | undefined;

	constructor(provider = "External provider", cause?: Error) {
		const message = cause ? `${provider}: ${cause.message}` : `${provider} error`;
		super(message, "PROVIDER_ERROR", 502);
		this.cause = cause;
	}
}

/** Thrown when the caller is not permitted to perform the action. */
export class ForbiddenError extends DomainError {
	constructor(message = "Forbidden", code = "FORBIDDEN") {
		super(message, code, 403);
	}
}

/** Thrown when the student has not enrolled a face before starting a proctored exam. */
export class FaceEnrollmentRequiredError extends ForbiddenError {
	constructor() {
		super("Face enrollment is required before starting this exam", "FACE_ENROLLMENT_REQUIRED");
	}
}

/** Thrown when a confirmed slot booking is missing or the slot window is closed. */
export class EntitlementError extends ForbiddenError {
	constructor(message = "You are not entitled to start this exam") {
		super(message, "ENTITLEMENT_REQUIRED");
	}
}

/** Thrown for invalid attempt-lifecycle transitions or exam-window violations. */
export class AttemptStateError extends DomainError {
	constructor(message: string, code = "ATTEMPT_STATE_INVALID") {
		super(message, code, 400);
	}
}
