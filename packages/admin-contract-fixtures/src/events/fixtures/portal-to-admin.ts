/**
 * Producer + consumer fixtures for bio-portal → bio-admin events.
 *
 * Commerce, profile, and reservation events bio-admin consumes for reporting,
 * audit, and reconciliation. Payment events carry NO payment secrets — only the
 * gateway order id and captured amount cross the boundary (FR-5
 * `payment-sensitive`). The producer is bio-portal even though bio-admin only
 * consumes these — the producer fixture pins what bio-portal must emit.
 */

import { consumerFixture, type EventFixture, producerFixture } from "../envelope.ts";

const studentProfileCompleted = {
	studentId: "stu_000123",
	examSeriesId: "series_neet_2026",
	completedAt: "2026-02-01T12:00:00.000Z",
};

const guardianConsentCaptured = {
	studentId: "stu_000123",
	guardianId: "grd_000045",
	consentVersion: "dpdp-v1",
	capturedAt: "2026-02-01T12:05:00.000Z",
};

const seatReservationHeld = {
	reservationId: "rsv_000789",
	studentId: "stu_000123",
	slotId: "slot_2026_neet_apr_01",
	heldUntil: "2026-02-01T12:20:00.000Z",
};

const seatReservationExpired = {
	reservationId: "rsv_000789",
	slotId: "slot_2026_neet_apr_01",
	expiredAt: "2026-02-01T12:20:00.000Z",
};

/** No card/UPI/secret fields — only gateway order id + captured amount. */
const paymentCaptured = {
	paymentOrderId: "pay_000456",
	razorpayOrderId: "order_Nabc123XYZ",
	reservationId: "rsv_000789",
	amountMinor: 250000,
	currency: "INR" as const,
	capturedAt: "2026-02-01T12:18:00.000Z",
};

const refundProcessed = {
	paymentOrderId: "pay_000456",
	registrationId: "reg_000321",
	amountMinor: 250000,
	currency: "INR" as const,
	refundedAt: "2026-03-01T09:00:00.000Z",
};

const registrationConfirmed = {
	registrationId: "reg_000321",
	studentId: "stu_000123",
	slotId: "slot_2026_neet_apr_01",
	examSeriesId: "series_neet_2026",
	confirmedAt: "2026-02-01T12:19:00.000Z",
};

const registrationCancelled = {
	registrationId: "reg_000321",
	studentId: "stu_000123",
	slotId: "slot_2026_neet_apr_01",
	cancelledAt: "2026-03-01T08:55:00.000Z",
	reason: "STUDENT_REQUESTED" as const,
};

export const PORTAL_TO_ADMIN_FIXTURES: readonly EventFixture[] = [
	producerFixture({
		eventType: "StudentProfileCompleted",
		eventVersion: "1.0.0",
		producer: "bio-portal",
		payload: studentProfileCompleted,
	}),
	consumerFixture({
		eventType: "StudentProfileCompleted",
		eventVersion: "1.0.0",
		producer: "bio-portal",
		payload: studentProfileCompleted,
	}),
	producerFixture({
		eventType: "GuardianConsentCaptured",
		eventVersion: "1.0.0",
		producer: "bio-portal",
		payload: guardianConsentCaptured,
	}),
	consumerFixture({
		eventType: "GuardianConsentCaptured",
		eventVersion: "1.0.0",
		producer: "bio-portal",
		payload: guardianConsentCaptured,
	}),
	producerFixture({
		eventType: "SeatReservationHeld",
		eventVersion: "1.0.0",
		producer: "bio-portal",
		payload: seatReservationHeld,
	}),
	consumerFixture({
		eventType: "SeatReservationHeld",
		eventVersion: "1.0.0",
		producer: "bio-portal",
		payload: seatReservationHeld,
	}),
	producerFixture({
		eventType: "SeatReservationExpired",
		eventVersion: "1.0.0",
		producer: "bio-portal",
		payload: seatReservationExpired,
	}),
	consumerFixture({
		eventType: "SeatReservationExpired",
		eventVersion: "1.0.0",
		producer: "bio-portal",
		payload: seatReservationExpired,
	}),
	producerFixture({
		eventType: "PaymentCaptured",
		eventVersion: "1.0.0",
		producer: "bio-portal",
		payload: paymentCaptured,
	}),
	consumerFixture({
		eventType: "PaymentCaptured",
		eventVersion: "1.0.0",
		producer: "bio-portal",
		payload: paymentCaptured,
	}),
	producerFixture({
		eventType: "RefundProcessed",
		eventVersion: "1.0.0",
		producer: "bio-portal",
		payload: refundProcessed,
	}),
	consumerFixture({
		eventType: "RefundProcessed",
		eventVersion: "1.0.0",
		producer: "bio-portal",
		payload: refundProcessed,
	}),
	producerFixture({
		eventType: "RegistrationConfirmed",
		eventVersion: "1.0.0",
		producer: "bio-portal",
		payload: registrationConfirmed,
	}),
	consumerFixture({
		eventType: "RegistrationConfirmed",
		eventVersion: "1.0.0",
		producer: "bio-portal",
		payload: registrationConfirmed,
	}),
	producerFixture({
		eventType: "RegistrationCancelled",
		eventVersion: "1.0.0",
		producer: "bio-portal",
		payload: registrationCancelled,
	}),
	consumerFixture({
		eventType: "RegistrationCancelled",
		eventVersion: "1.0.0",
		producer: "bio-portal",
		payload: registrationCancelled,
	}),
];
