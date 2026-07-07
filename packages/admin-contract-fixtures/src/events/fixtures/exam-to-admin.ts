/**
 * Producer + consumer fixtures for bio-exam → bio-admin events.
 *
 * Attempt-lifecycle and integrity telemetry bio-admin consumes for scoring,
 * results, and ops. `attempt.submitted` carries `submitReason` per
 * PRD-PLAT-02 §13 (`USER | AUTO_TIMER | ADMIN_FORCE | SYSTEM_RECOVERY`).
 */

import { consumerFixture, type EventFixture, producerFixture } from "../envelope.ts";

const attemptStarted = {
	attemptId: "att_000654",
	registrationId: "reg_000321",
	slotId: "slot_2026_neet_apr_01",
	startedAt: "2026-04-12T04:30:05.000Z",
};

const answerSaved = {
	attemptId: "att_000654",
	answeredCount: 42,
	savedAt: "2026-04-12T05:10:00.000Z",
};

const attemptSubmitted = {
	attemptId: "att_000654",
	submitReason: "USER" as const,
	submittedAt: "2026-04-12T07:25:00.000Z",
};

const attemptAutoSubmitted = {
	attemptId: "att_000654",
	submitReason: "AUTO_TIMER" as const,
	submittedAt: "2026-04-12T07:30:00.000Z",
};

const runtimeIntegritySignalRaised = {
	attemptId: "att_000654",
	signalType: "FULLSCREEN_EXITED" as const,
	severity: "warning" as const,
	raisedAt: "2026-04-12T06:00:00.000Z",
};

export const EXAM_TO_ADMIN_FIXTURES: readonly EventFixture[] = [
	producerFixture({
		eventType: "attempt.started",
		eventVersion: "1.0.0",
		producer: "bio-exam",
		payload: attemptStarted,
	}),
	consumerFixture({
		eventType: "attempt.started",
		eventVersion: "1.0.0",
		producer: "bio-exam",
		payload: attemptStarted,
	}),
	producerFixture({
		eventType: "answer.saved",
		eventVersion: "1.0.0",
		producer: "bio-exam",
		payload: answerSaved,
	}),
	consumerFixture({
		eventType: "answer.saved",
		eventVersion: "1.0.0",
		producer: "bio-exam",
		payload: answerSaved,
	}),
	producerFixture({
		eventType: "attempt.submitted",
		eventVersion: "1.0.0",
		producer: "bio-exam",
		payload: attemptSubmitted,
	}),
	consumerFixture({
		eventType: "attempt.submitted",
		eventVersion: "1.0.0",
		producer: "bio-exam",
		payload: attemptSubmitted,
	}),
	producerFixture({
		eventType: "attempt.auto_submitted",
		eventVersion: "1.0.0",
		producer: "bio-exam",
		payload: attemptAutoSubmitted,
	}),
	consumerFixture({
		eventType: "attempt.auto_submitted",
		eventVersion: "1.0.0",
		producer: "bio-exam",
		payload: attemptAutoSubmitted,
	}),
	producerFixture({
		eventType: "runtime.integrity_signal_raised",
		eventVersion: "1.0.0",
		producer: "bio-exam",
		payload: runtimeIntegritySignalRaised,
	}),
	consumerFixture({
		eventType: "runtime.integrity_signal_raised",
		eventVersion: "1.0.0",
		producer: "bio-exam",
		payload: runtimeIntegritySignalRaised,
	}),
];
