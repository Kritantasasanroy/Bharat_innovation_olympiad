/**
 * Commerce event family (PLAT-02 §7 catalog).
 *
 * Producer surface: `bio-portal`. Covers registration/entitlement
 * (`bio-portal -> bio-exam`) plus the profile, consent, seat-reservation, and
 * payment/refund reporting copies (`bio-portal -> bio-admin`).
 *
 * Payment instrument data and gateway secrets are tagged `payment-sensitive`
 * and never belong in a student-facing contract (FR-5).
 */
import { z } from "zod";
import {
	count,
	defineCatalog,
	FieldClassification as FC,
	field,
	id,
	text,
	timestamp,
} from "./_shared.ts";

/** ISO-4217 currency. v1 is INR-only. */
const Currency = z.enum(["INR"]);

/** Why a paid registration was cancelled. */
const CancellationReason = z.enum(["USER_REQUESTED", "PAYMENT_FAILED", "SLOT_CLOSED", "DUPLICATE"]);

/** DPDP / terms consent surfaces captured at registration. */
const ConsentType = z.enum(["DPDP_PARENTAL", "TERMS_OF_USE", "DATA_PROCESSING", "BIOMETRIC"]);

/** `RegistrationConfirmed` — paid registration IS the entitlement (portal -> exam). */
export const RegistrationConfirmedPayload = z.object({
	registrationId: id("Confirmed registration id (the entitlement).", FC.AuthenticatedStudent),
	studentId: id("Owning student.", FC.AuthenticatedStudent),
	examSeriesId: id("Exam series the registration grants access to.", FC.Public),
	examSlotId: id("Booked exam slot.", FC.Public),
	seatReservationId: id(
		"Seat reservation converted into this registration.",
		FC.AuthenticatedStudent,
	),
	paymentOrderId: id("Settling payment order.", FC.AdminOnly),
	confirmedAt: timestamp("When the registration was confirmed."),
});
export type RegistrationConfirmed = z.infer<typeof RegistrationConfirmedPayload>;

/** `RegistrationCancelled` — registration revoked before/after entitlement issue. */
export const RegistrationCancelledPayload = z.object({
	registrationId: id("Cancelled registration id.", FC.AuthenticatedStudent),
	studentId: id("Owning student.", FC.AuthenticatedStudent),
	examSlotId: id("Slot freed by the cancellation.", FC.Public),
	reason: field(CancellationReason, FC.AdminOnly, "Cancellation reason."),
	cancelledAt: timestamp("When the registration was cancelled."),
});
export type RegistrationCancelled = z.infer<typeof RegistrationCancelledPayload>;

/** `StudentProfileCompleted` — required profile fields captured (portal -> admin). */
export const StudentProfileCompletedPayload = z.object({
	studentId: id("Student whose profile completed.", FC.AuthenticatedStudent),
	guardianId: field(
		z.string().min(1).optional(),
		FC.AuthenticatedStudent,
		"Linked guardian, when the student is a minor.",
	),
	profileVersion: count("Monotonic profile revision.", FC.AuthenticatedStudent),
	completedAt: timestamp("When the profile was completed."),
});
export type StudentProfileCompleted = z.infer<typeof StudentProfileCompletedPayload>;

/** `GuardianConsentCaptured` — DPDP/terms consent captured for a student. */
export const GuardianConsentCapturedPayload = z.object({
	studentId: id("Student the consent covers.", FC.AuthenticatedStudent),
	guardianId: id("Consenting guardian.", FC.AuthenticatedStudent),
	consentType: field(ConsentType, FC.AuthenticatedStudent, "Which consent surface was granted."),
	consentVersion: text("Version of the consent text agreed to.", FC.AuthenticatedStudent),
	capturedAt: timestamp("When consent was captured."),
});
export type GuardianConsentCaptured = z.infer<typeof GuardianConsentCapturedPayload>;

/** `SeatReservationHeld` — a slot seat is temporarily held during checkout. */
export const SeatReservationHeldPayload = z.object({
	seatReservationId: id("Held seat reservation id.", FC.AuthenticatedStudent),
	examSlotId: id("Slot the seat belongs to.", FC.Public),
	studentId: id("Student holding the seat.", FC.AuthenticatedStudent),
	heldAt: timestamp("When the hold was placed."),
	holdExpiresAt: timestamp("When the hold lapses if not converted."),
});
export type SeatReservationHeld = z.infer<typeof SeatReservationHeldPayload>;

/** `SeatReservationExpired` — a held seat lapsed without conversion. */
export const SeatReservationExpiredPayload = z.object({
	seatReservationId: id("Expired seat reservation id.", FC.AuthenticatedStudent),
	examSlotId: id("Slot the seat is returned to.", FC.Public),
	studentId: id("Student whose hold lapsed.", FC.AuthenticatedStudent),
	expiredAt: timestamp("When the hold expired."),
});
export type SeatReservationExpired = z.infer<typeof SeatReservationExpiredPayload>;

/** `PaymentCaptured` — gateway settlement reporting copy (portal -> admin). */
export const PaymentCapturedPayload = z.object({
	paymentOrderId: id("Internal payment order id.", FC.AdminOnly),
	registrationId: id("Registration the payment settles.", FC.AdminOnly),
	razorpayOrderId: id("Razorpay order reference.", FC.PaymentSensitive),
	razorpayPaymentId: id("Razorpay payment reference.", FC.PaymentSensitive),
	amountMinor: count("Captured amount in minor units (paise).", FC.AdminOnly),
	currency: field(Currency, FC.AdminOnly, "Settlement currency."),
	method: field(
		z.string().optional(),
		FC.PaymentSensitive,
		"Instrument/method descriptor from the gateway.",
	),
	capturedAt: timestamp("When the gateway captured the payment."),
});
export type PaymentCaptured = z.infer<typeof PaymentCapturedPayload>;

/** `RefundProcessed` — refund settled against a prior capture (portal -> admin/core). */
export const RefundProcessedPayload = z.object({
	refundId: id("Internal refund id.", FC.AdminOnly),
	paymentOrderId: id("Original payment order being refunded.", FC.AdminOnly),
	registrationId: id("Registration the refund relates to.", FC.AdminOnly),
	amountMinor: count("Refunded amount in minor units (paise).", FC.AdminOnly),
	currency: field(Currency, FC.AdminOnly, "Refund currency."),
	reason: text("Refund reason.", FC.AdminOnly),
	processedAt: timestamp("When the refund settled."),
});
export type RefundProcessed = z.infer<typeof RefundProcessedPayload>;

/** Commerce-family payload catalog, keyed by canonical `eventType`. */
export const COMMERCE_EVENT_PAYLOADS = defineCatalog({
	RegistrationConfirmed: RegistrationConfirmedPayload,
	RegistrationCancelled: RegistrationCancelledPayload,
	StudentProfileCompleted: StudentProfileCompletedPayload,
	GuardianConsentCaptured: GuardianConsentCapturedPayload,
	SeatReservationHeld: SeatReservationHeldPayload,
	SeatReservationExpired: SeatReservationExpiredPayload,
	PaymentCaptured: PaymentCapturedPayload,
	RefundProcessed: RefundProcessedPayload,
});

/** Commerce-family event-type names. */
export const COMMERCE_EVENT_TYPES = Object.keys(
	COMMERCE_EVENT_PAYLOADS,
) as (keyof typeof COMMERCE_EVENT_PAYLOADS)[];
