import { app } from "./app";

/**
 * Boot shell for `results-worker`.
 *
 * Binds the health surface only. Event-consumer subscription and all internal
 * processing stay inert until the owning PRD lands.
 */
const port = Number(process.env["PORT"] ?? 4104);

app.listen(port);
// biome-ignore lint/suspicious/noConsole: minimal boot log; structured logging arrives with the owning PRD
console.log(
	JSON.stringify({ service: "results-worker", port, msg: "worker health surface running" }),
);
