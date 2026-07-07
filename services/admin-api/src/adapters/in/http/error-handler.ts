import { Elysia } from "elysia";

export const errorHandler = new Elysia({ name: "error-handler" }).onError(
	({ code, error, set }) => {
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
