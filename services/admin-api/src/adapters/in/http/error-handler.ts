import { Elysia } from "elysia";
import { DomainError } from "../../../core/errors";

/**
 * Global error boundary.
 *
 * Domain errors carry their own `code` + `httpStatus` (set by the throwing
 * service/route), so they map to a stable response envelope without
 * instanceof chains at every call site. Elysia's built-in codes (NOT_FOUND,
 * VALIDATION) and unexpected errors fall through to sane defaults.
 *
 * Registered `{ as: "global" }`: this plugin defines no routes of its own —
 * it is mounted as a sibling to the route-providing plugins in `app.ts`.
 * Elysia's lifecycle hooks default to "local" scope (only the declaring
 * instance's own routes), which would make this `onError` invisible to
 * errors thrown by any sibling plugin's handlers. `{ as: "global" }` makes it
 * apply across the whole composed app regardless of which plugin threw.
 */
export const errorHandler = new Elysia({ name: "error-handler" }).onError(
	{ as: "global" },
	({ code, error, set }) => {
		if (error instanceof DomainError) {
			set.status = error.httpStatus;
			return {
				success: false,
				error: { code: error.code, message: error.message, statusCode: error.httpStatus },
			};
		}

		if (code === "VALIDATION") {
			set.status = 400;
			return {
				success: false,
				error: { code: "VALIDATION_ERROR", message: String(error), statusCode: 400 },
			};
		}

		if (code === "NOT_FOUND") {
			set.status = 404;
			return {
				success: false,
				error: { code: "NOT_FOUND", message: "Route not found", statusCode: 404 },
			};
		}

		set.status = 500;
		return {
			success: false,
			error: {
				code: "INTERNAL_SERVER_ERROR",
				message: error instanceof Error ? error.message : "Unexpected error",
				statusCode: 500,
			},
		};
	},
);
