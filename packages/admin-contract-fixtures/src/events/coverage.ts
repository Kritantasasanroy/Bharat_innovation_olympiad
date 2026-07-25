/**
 * Pure fixture-coverage computation.
 *
 * Shared by the unit test (`fixture-coverage.test.ts`) and the CI gate
 * (`scripts/assert-fixture-coverage.ts`) so both judge coverage identically.
 * Keeping the logic pure (no process/exit, no I/O) lets the test assert on the
 * report object directly.
 *
 * Coverage rule (PRD-PLAT-02 FR-8 / Acceptance "fixture exists for every event
 * type"): every event in the catalog must have BOTH a producer and a consumer
 * fixture, and every fixture must map back to a catalog event (no orphans).
 */

import type { CatalogEvent } from "./catalog.ts";
import type { EventEnvelope, EventFixture } from "./envelope.ts";
import { REQUIRED_ENVELOPE_FIELDS } from "./envelope.ts";

/** A catalog event missing one or both of its fixtures. */
export interface CoverageGap {
	readonly eventType: string;
	readonly missingProducer: boolean;
	readonly missingConsumer: boolean;
}

/** A fixture whose envelope is structurally malformed. */
export interface MalformedFixture {
	readonly eventType: string;
	readonly role: string;
	readonly problem: string;
}

/** Full coverage report for one catalog + fixture-registry pair. */
export interface CoverageReport {
	readonly totalEvents: number;
	/** Catalog events missing a producer and/or consumer fixture. */
	readonly gaps: readonly CoverageGap[];
	/** Producer fixtures whose event type is not in the catalog. */
	readonly orphanProducers: readonly string[];
	/** Consumer fixtures whose event type is not in the catalog. */
	readonly orphanConsumers: readonly string[];
	/** Fixtures that fail the structural envelope check. */
	readonly malformed: readonly MalformedFixture[];
	/** True when there are no gaps, no orphans, and no malformed fixtures. */
	readonly ok: boolean;
}

/** Structurally validate one envelope; returns a problem string or `null`. */
function envelopeProblem(eventType: string, envelope: EventEnvelope): string | null {
	for (const field of REQUIRED_ENVELOPE_FIELDS) {
		if (envelope[field] === undefined) {
			return `missing envelope field "${String(field)}"`;
		}
	}
	if (envelope.eventType !== eventType) {
		return `envelope.eventType "${envelope.eventType}" does not match registry key "${eventType}"`;
	}
	if (!/^\d+\.\d+\.\d+$/.test(envelope.eventVersion)) {
		return `eventVersion "${envelope.eventVersion}" is not SemVer`;
	}
	return null;
}

/**
 * Compute the coverage report for a catalog against producer/consumer
 * fixture registries keyed by event type.
 */
export function computeCoverage(
	catalog: readonly CatalogEvent[],
	producerFixtures: Readonly<Record<string, EventFixture>>,
	consumerFixtures: Readonly<Record<string, EventFixture>>,
): CoverageReport {
	const gaps: CoverageGap[] = [];
	const malformed: MalformedFixture[] = [];
	const catalogTypes = new Set(catalog.map((event) => event.eventType));

	for (const event of catalog) {
		const producer = producerFixtures[event.eventType];
		const consumer = consumerFixtures[event.eventType];
		const missingProducer = producer === undefined;
		const missingConsumer = consumer === undefined;
		if (missingProducer || missingConsumer) {
			gaps.push({ eventType: event.eventType, missingProducer, missingConsumer });
		}
		if (producer !== undefined) {
			const problem = envelopeProblem(event.eventType, producer.envelope);
			if (problem !== null) {
				malformed.push({ eventType: event.eventType, role: "producer", problem });
			}
		}
		if (consumer !== undefined) {
			const problem = envelopeProblem(event.eventType, consumer.envelope);
			if (problem !== null) {
				malformed.push({ eventType: event.eventType, role: "consumer", problem });
			}
		}
	}

	const orphanProducers = Object.keys(producerFixtures).filter(
		(eventType) => !catalogTypes.has(eventType),
	);
	const orphanConsumers = Object.keys(consumerFixtures).filter(
		(eventType) => !catalogTypes.has(eventType),
	);

	const ok =
		gaps.length === 0 &&
		orphanProducers.length === 0 &&
		orphanConsumers.length === 0 &&
		malformed.length === 0;

	return {
		totalEvents: catalog.length,
		gaps,
		orphanProducers,
		orphanConsumers,
		malformed,
		ok,
	};
}

/** Render a coverage report as a human-readable, multi-line string. */
export function formatCoverageReport(report: CoverageReport): string {
	if (report.ok) {
		return `Fixture coverage OK: ${report.totalEvents} catalog events, each with a producer and a consumer fixture.`;
	}
	const lines: string[] = ["Fixture coverage FAILED:"];
	for (const gap of report.gaps) {
		const missing = [
			gap.missingProducer ? "producer" : null,
			gap.missingConsumer ? "consumer" : null,
		]
			.filter(Boolean)
			.join(" + ");
		lines.push(`  - ${gap.eventType}: missing ${missing} fixture`);
	}
	for (const orphan of report.orphanProducers) {
		lines.push(`  - orphan producer fixture (not in catalog): ${orphan}`);
	}
	for (const orphan of report.orphanConsumers) {
		lines.push(`  - orphan consumer fixture (not in catalog): ${orphan}`);
	}
	for (const bad of report.malformed) {
		lines.push(`  - malformed ${bad.role} fixture for ${bad.eventType}: ${bad.problem}`);
	}
	return lines.join("\n");
}
