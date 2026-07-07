import { describe, expect, it } from "bun:test";
import pino, { type Logger } from "pino";
import {
	AUDIT_LOG_EVENT,
	createNoopAuditSink,
	NoopAuditSink,
} from "../src/adapters/out/audit/noop-audit-sink.ts";
import type { AuditEvent } from "../src/core/ports/out/audit-sink.port.ts";

/** Build a logger that captures each emitted line as a parsed object. */
function capturingLogger(): { log: Logger; lines: Record<string, unknown>[] } {
	const lines: Record<string, unknown>[] = [];
	const log = pino(
		{ level: "info" },
		{
			write(chunk: string): void {
				lines.push(JSON.parse(chunk));
			},
		},
	);
	return { log, lines };
}

/** A representative, non-sensitive audit event. */
function sampleEvent(): AuditEvent {
	return {
		action: "exam.published",
		actor: { id: "admin-1", type: "user", label: "Curator One" },
		resource: { type: "exam", id: "exam-42" },
		outcome: "success",
		occurredAt: "2026-06-23T10:00:00.000Z",
		correlationId: "req-abc",
		metadata: { window: "summer-2026" },
	};
}

describe("NoopAuditSink", () => {
	it("records the event via the structured log envelope", async () => {
		const { log, lines } = capturingLogger();
		const sink = new NoopAuditSink(log);
		const event = sampleEvent();

		await sink.record(event);

		expect(lines).toHaveLength(1);
		const [line] = lines;
		expect(line?.["msg"]).toBe(AUDIT_LOG_EVENT);
		expect(line?.["audit"]).toEqual(event);
	});

	it("resolves its record() promise without a durable store", async () => {
		const { log } = capturingLogger();
		const sink = new NoopAuditSink(log);

		await expect(sink.record(sampleEvent())).resolves.toBeUndefined();
	});

	it("appends one envelope per recorded event (append-only)", async () => {
		const { log, lines } = capturingLogger();
		const sink = createNoopAuditSink(log);

		await sink.record({ ...sampleEvent(), action: "exam.created" });
		await sink.record({ ...sampleEvent(), action: "exam.published" });

		expect(lines).toHaveLength(2);
		const actions = lines.map((line) => (line["audit"] as AuditEvent).action);
		expect(actions).toEqual(["exam.created", "exam.published"]);
	});

	it("factory returns a sink backed by a default logger when none is given", () => {
		const sink = createNoopAuditSink();
		expect(sink).toBeInstanceOf(NoopAuditSink);
	});
});
