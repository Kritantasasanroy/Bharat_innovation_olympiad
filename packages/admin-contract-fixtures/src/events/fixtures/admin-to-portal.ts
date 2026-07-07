/**
 * Producer + consumer fixtures for bio-admin → bio-portal events.
 *
 * bio-admin emits these to the student-facing catalog. The producer fixture is
 * what bio-admin serializes; the consumer fixture is what bio-portal validates
 * on receipt. All payloads are `public`-classified — no admin internals, no
 * answer keys.
 */

import { consumerFixture, type EventFixture, producerFixture } from "../envelope.ts";

const examSlotPublished = {
	slotId: "slot_2026_neet_apr_01",
	examSeriesId: "series_neet_2026",
	title: "NEET 2026 — April Window 1",
	startsAt: "2026-04-12T04:30:00.000Z",
	endsAt: "2026-04-12T07:30:00.000Z",
	capacity: 500,
	seatsRemaining: 500,
	status: "published" as const,
};

const examSlotCapacityChanged = {
	slotId: "slot_2026_neet_apr_01",
	capacity: 500,
	seatsRemaining: 412,
};

const examSlotClosed = {
	slotId: "slot_2026_neet_apr_01",
	closedAt: "2026-04-10T18:00:00.000Z",
	reason: "BOOKING_WINDOW_ENDED" as const,
};

/**
 * Key-stripped public snapshot metadata. Deliberately carries NO `correctAnswer`,
 * `answerKey`, `isCorrect`, or `explanation` field (PRD-PLAT-02 NFR security);
 * the security fixture assertions rely on this absence.
 */
const examSnapshotPublished = {
	snapshotId: "snap_neet_2026_apr_01",
	examSeriesId: "series_neet_2026",
	slotId: "slot_2026_neet_apr_01",
	title: "NEET 2026 — April Window 1",
	questionCount: 180,
	durationMinutes: 180,
	publishedAt: "2026-04-01T09:00:00.000Z",
};

export const ADMIN_TO_PORTAL_FIXTURES: readonly EventFixture[] = [
	producerFixture({
		eventType: "ExamSlotPublished",
		eventVersion: "1.0.0",
		producer: "bio-admin",
		payload: examSlotPublished,
	}),
	consumerFixture({
		eventType: "ExamSlotPublished",
		eventVersion: "1.0.0",
		producer: "bio-admin",
		payload: examSlotPublished,
	}),
	producerFixture({
		eventType: "ExamSlotCapacityChanged",
		eventVersion: "1.0.0",
		producer: "bio-admin",
		payload: examSlotCapacityChanged,
	}),
	consumerFixture({
		eventType: "ExamSlotCapacityChanged",
		eventVersion: "1.0.0",
		producer: "bio-admin",
		payload: examSlotCapacityChanged,
	}),
	producerFixture({
		eventType: "ExamSlotClosed",
		eventVersion: "1.0.0",
		producer: "bio-admin",
		payload: examSlotClosed,
	}),
	consumerFixture({
		eventType: "ExamSlotClosed",
		eventVersion: "1.0.0",
		producer: "bio-admin",
		payload: examSlotClosed,
	}),
	producerFixture({
		eventType: "ExamSnapshotPublished",
		eventVersion: "1.0.0",
		producer: "bio-admin",
		payload: examSnapshotPublished,
	}),
	consumerFixture({
		eventType: "ExamSnapshotPublished",
		eventVersion: "1.0.0",
		producer: "bio-admin",
		payload: examSnapshotPublished,
	}),
];
