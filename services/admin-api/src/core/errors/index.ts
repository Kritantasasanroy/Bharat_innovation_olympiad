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

/** Thrown when a request carries no (or an invalid/expired) bearer token. */
export class UnauthorizedError extends DomainError {
	constructor(message = "Authentication required") {
		super(message, "UNAUTHORIZED", 401);
	}
}

/** Thrown when the caller is authenticated but not permitted to perform the action. */
export class ForbiddenError extends DomainError {
	constructor(message = "Forbidden", code = "FORBIDDEN") {
		super(message, code, 403);
	}
}

/** Thrown on a state conflict: an invalid lifecycle transition, or a rule that
 * blocks an otherwise well-formed request until a precondition is met. */
export class ConflictError extends DomainError {
	constructor(message: string, code = "CONFLICT") {
		super(message, code, 409);
	}
}
