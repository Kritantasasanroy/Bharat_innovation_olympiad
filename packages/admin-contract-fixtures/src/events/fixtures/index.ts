/**
 * Aggregated cross-repo event fixtures, indexed by role and event type.
 *
 * Collects every per-edge fixture file into two registries — one producer-side,
 * one consumer-side — keyed by canonical event type. The fixture-coverage check
 * walks {@link BIO_ADMIN_EVENT_CATALOG} and asserts both registries hold a key
 * for every catalog event (PRD-PLAT-02 FR-8).
 */

import type { EventFixture, FixtureRole } from "../envelope.ts";
import { ADMIN_TO_EXAM_FIXTURES } from "./admin-to-exam.ts";
import { ADMIN_TO_PORTAL_FIXTURES } from "./admin-to-portal.ts";
import { EXAM_TO_ADMIN_FIXTURES } from "./exam-to-admin.ts";
import { PORTAL_TO_ADMIN_FIXTURES } from "./portal-to-admin.ts";
import { PROCTOR_TO_ADMIN_FIXTURES } from "./proctor-to-admin.ts";

/** Every fixture across every cross-repo edge bio-admin participates in. */
export const ALL_EVENT_FIXTURES: readonly EventFixture[] = [
	...ADMIN_TO_PORTAL_FIXTURES,
	...ADMIN_TO_EXAM_FIXTURES,
	...PORTAL_TO_ADMIN_FIXTURES,
	...EXAM_TO_ADMIN_FIXTURES,
	...PROCTOR_TO_ADMIN_FIXTURES,
];

/**
 * Index fixtures of one role by event type.
 *
 * Throws on a duplicate (two fixtures of the same role for one event type) so a
 * copy-paste mistake fails loudly at module load rather than silently shadowing.
 */
function indexByEventType(
	fixtures: readonly EventFixture[],
	role: FixtureRole,
): Readonly<Record<string, EventFixture>> {
	const index: Record<string, EventFixture> = {};
	for (const fixture of fixtures) {
		if (fixture.role !== role) {
			continue;
		}
		if (index[fixture.eventType] !== undefined) {
			throw new Error(`Duplicate ${role} fixture for event type "${fixture.eventType}"`);
		}
		index[fixture.eventType] = fixture;
	}
	return index;
}

/** Producer-side fixtures, keyed by event type. */
export const PRODUCER_FIXTURES = indexByEventType(ALL_EVENT_FIXTURES, "producer");

/** Consumer-side fixtures, keyed by event type. */
export const CONSUMER_FIXTURES = indexByEventType(ALL_EVENT_FIXTURES, "consumer");
