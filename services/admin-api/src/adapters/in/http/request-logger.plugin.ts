import { Elysia } from "elysia";
import { createLogger } from "../../../infra";

const log = createLogger("http");

export const requestLogger = new Elysia({ name: "request-logger" }).onAfterHandle(
	({ request, set }) => {
		log.info(
			{ method: request.method, path: new URL(request.url).pathname, status: set.status ?? 200 },
			"request completed",
		);
	},
);
