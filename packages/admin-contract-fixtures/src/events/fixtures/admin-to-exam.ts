/**
 * Producer + consumer fixtures for bio-admin → bio-exam events.
 *
 * Operational + runtime signals bio-admin emits to the exam runtime. The
 * runtime-window and result-release pause/resume events are `service-internal`.
 */

import { consumerFixture, type EventFixture, producerFixture } from "../envelope.ts";

const examSlotRuntimeWindowChanged = {
	slotId: "slot_2026_neet_apr_01",
	runtimeOpensAt: "2026-04-12T04:15:00.000Z",
	runtimeClosesAt: "2026-04-12T07:45:00.000Z",
	reason: "OPS_ADJUSTMENT" as const,
};

const resultReleasePaused = {
	examSeriesId: "series_neet_2026",
	slotId: "slot_2026_neet_apr_01",
	pausedAt: "2026-04-13T10:00:00.000Z",
	reason: "RESULT_DISPUTE_REVIEW" as const,
};

const resultReleaseResumed = {
	examSeriesId: "series_neet_2026",
	slotId: "slot_2026_neet_apr_01",
	resumedAt: "2026-04-14T10:00:00.000Z",
};

export const ADMIN_TO_EXAM_FIXTURES: readonly EventFixture[] = [
	producerFixture({
		eventType: "ExamSlotRuntimeWindowChanged",
		eventVersion: "1.0.0",
		producer: "bio-admin",
		payload: examSlotRuntimeWindowChanged,
	}),
	consumerFixture({
		eventType: "ExamSlotRuntimeWindowChanged",
		eventVersion: "1.0.0",
		producer: "bio-admin",
		payload: examSlotRuntimeWindowChanged,
	}),
	producerFixture({
		eventType: "ResultReleasePaused",
		eventVersion: "1.0.0",
		producer: "bio-admin",
		payload: resultReleasePaused,
	}),
	consumerFixture({
		eventType: "ResultReleasePaused",
		eventVersion: "1.0.0",
		producer: "bio-admin",
		payload: resultReleasePaused,
	}),
	producerFixture({
		eventType: "ResultReleaseResumed",
		eventVersion: "1.0.0",
		producer: "bio-admin",
		payload: resultReleaseResumed,
	}),
	consumerFixture({
		eventType: "ResultReleaseResumed",
		eventVersion: "1.0.0",
		producer: "bio-admin",
		payload: resultReleaseResumed,
	}),
];
