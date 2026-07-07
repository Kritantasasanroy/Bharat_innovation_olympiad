import { describe, expect, it } from "bun:test";
import { BIO_ADMIN_EVENT_CATALOG } from "./catalog.ts";
import { computeCoverage, formatCoverageReport } from "./coverage.ts";
import { REQUIRED_ENVELOPE_FIELDS } from "./envelope.ts";
import { CONSUMER_FIXTURES, PRODUCER_FIXTURES } from "./fixtures/index.ts";

describe("cross-repo event fixture coverage", () => {
	const report = computeCoverage(BIO_ADMIN_EVENT_CATALOG, PRODUCER_FIXTURES, CONSUMER_FIXTURES);

	it("has at least one event in the catalog", () => {
		expect(BIO_ADMIN_EVENT_CATALOG.length).toBeGreaterThan(0);
	});

	it("covers every catalog event with both a producer and a consumer fixture", () => {
		// Surface the human-readable gap list when this fails.
		expect(formatCoverageReport(report)).toContain("Fixture coverage OK");
		expect(report.gaps).toEqual([]);
		expect(report.ok).toBe(true);
	});

	it("has no orphan fixtures outside the catalog", () => {
		expect(report.orphanProducers).toEqual([]);
		expect(report.orphanConsumers).toEqual([]);
	});

	it("has no structurally malformed envelopes", () => {
		expect(report.malformed).toEqual([]);
	});

	it("catalog event types are unique", () => {
		const types = BIO_ADMIN_EVENT_CATALOG.map((event) => event.eventType);
		expect(new Set(types).size).toBe(types.length);
	});

	describe.each([...BIO_ADMIN_EVENT_CATALOG])("event $eventType", (event) => {
		it("has a producer fixture whose envelope is well-formed", () => {
			const fixture = PRODUCER_FIXTURES[event.eventType];
			expect(fixture).toBeDefined();
			expect(fixture?.role).toBe("producer");
			expect(fixture?.envelope.eventType).toBe(event.eventType);
			for (const field of REQUIRED_ENVELOPE_FIELDS) {
				expect(fixture?.envelope[field]).toBeDefined();
			}
		});

		it("has a consumer fixture whose envelope is well-formed", () => {
			const fixture = CONSUMER_FIXTURES[event.eventType];
			expect(fixture).toBeDefined();
			expect(fixture?.role).toBe("consumer");
			expect(fixture?.envelope.eventType).toBe(event.eventType);
			for (const field of REQUIRED_ENVELOPE_FIELDS) {
				expect(fixture?.envelope[field]).toBeDefined();
			}
		});

		it("producer fixture is emitted by the catalog producer repo", () => {
			expect(PRODUCER_FIXTURES[event.eventType]?.envelope.producer).toBe(event.producer);
		});
	});

	it("student-facing snapshot payloads never carry answer keys", () => {
		// PRD-PLAT-02 NFR security: ExamSnapshotPublished is key-stripped.
		const snapshot = PRODUCER_FIXTURES["ExamSnapshotPublished"]?.envelope.payload as Record<
			string,
			unknown
		>;
		expect(snapshot).toBeDefined();
		for (const forbidden of ["correctAnswer", "answerKey", "isCorrect", "explanation"]) {
			expect(snapshot[forbidden]).toBeUndefined();
		}
	});
});
