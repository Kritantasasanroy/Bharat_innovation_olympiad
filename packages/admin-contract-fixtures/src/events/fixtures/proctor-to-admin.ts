/**
 * Producer + consumer fixtures for bio-proctor → bio-admin events.
 *
 * Risk and report signals bio-admin consumes for review, results, and ops.
 * NO raw biometric frames or model output cross the boundary (FR-5) — only
 * scored/aggregated review metadata.
 */

import { consumerFixture, type EventFixture, producerFixture } from "../envelope.ts";

const riskScoreChanged = {
	attemptId: "att_000654",
	proctorEventId: "prc_000111",
	riskScore: 0.62,
	band: "elevated" as const,
	changedAt: "2026-04-12T06:05:00.000Z",
};

const proctorReportFinalized = {
	attemptId: "att_000654",
	reportId: "rpt_000222",
	finalRiskBand: "elevated" as const,
	flaggedEventCount: 3,
	finalizedAt: "2026-04-12T08:00:00.000Z",
};

export const PROCTOR_TO_ADMIN_FIXTURES: readonly EventFixture[] = [
	producerFixture({
		eventType: "RiskScoreChanged",
		eventVersion: "1.0.0",
		producer: "bio-proctor",
		payload: riskScoreChanged,
	}),
	consumerFixture({
		eventType: "RiskScoreChanged",
		eventVersion: "1.0.0",
		producer: "bio-proctor",
		payload: riskScoreChanged,
	}),
	producerFixture({
		eventType: "ProctorReportFinalized",
		eventVersion: "1.0.0",
		producer: "bio-proctor",
		payload: proctorReportFinalized,
	}),
	consumerFixture({
		eventType: "ProctorReportFinalized",
		eventVersion: "1.0.0",
		producer: "bio-proctor",
		payload: proctorReportFinalized,
	}),
];
