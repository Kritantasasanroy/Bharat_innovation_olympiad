import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
	ADMIN_EVENT_TYPES,
	CATALOG_EVENT_TYPES,
	COMMERCE_EVENT_TYPES,
	classificationOf,
	EVENT_PAYLOAD_SCHEMAS,
	FieldClassification,
	isCatalogEventType,
	PARTNER_EVENT_TYPES,
	PROCTOR_EVENT_TYPES,
	payloadSchemaFor,
	RegistrationConfirmedPayload,
	RUNTIME_EVENT_TYPES,
	unclassifiedFields,
} from "../index.ts";

/**
 * The PLAT-02 §7 canonical cross-repo event catalog (+ §13 ops augmentation),
 * verbatim. The schemas must cover exactly this set — no more, no fewer.
 */
const CANONICAL_CATALOG = [
	// commerce (bio-portal)
	"RegistrationConfirmed",
	"RegistrationCancelled",
	"StudentProfileCompleted",
	"GuardianConsentCaptured",
	"SeatReservationHeld",
	"SeatReservationExpired",
	"PaymentCaptured",
	"RefundProcessed",
	// admin (bio-admin)
	"ExamSlotPublished",
	"ExamSlotCapacityChanged",
	"ExamSlotClosed",
	"ExamSnapshotPublished",
	"ExamSlotRuntimeWindowChanged",
	"ResultReleasePaused",
	"ResultReleaseResumed",
	"attempt.scored",
	"result.release_scheduled",
	"result.released",
	"certificate.issued",
	"OpsIncidentDeclared",
	"OpsBannerChanged",
	"OpsControlExecuted",
	// runtime (bio-exam)
	"attempt.started",
	"answer.saved",
	"attempt.submitted",
	"attempt.auto_submitted",
	"runtime.integrity_signal_raised",
	// proctor (bio-proctor + proctor-domain)
	"ProctorSessionRequested",
	"FrameAnalysisRequested",
	"FaceEnrollmentCompleted",
	"ProctorFrameAccepted",
	"ProctorFrameRejected",
	"ProctorEventRaised",
	"RiskScoreChanged",
	"ProctorReportFinalized",
	"BiometricDataDeleted",
	// partner (bio-admin — PRD-046)
	"PartnerApplicationSubmitted",
	"PartnerStatusChanged",
	"AttributionCredited",
	"CommissionStatementIssued",
	"PayoutStatusChanged",
] as const;

describe("catalog coverage", () => {
	it("covers every canonical catalog event type, and no extras", () => {
		expect([...CATALOG_EVENT_TYPES].sort()).toEqual([...CANONICAL_CATALOG].sort());
	});

	it("partitions the catalog across the five families without overlap", () => {
		const families = [
			COMMERCE_EVENT_TYPES,
			ADMIN_EVENT_TYPES,
			RUNTIME_EVENT_TYPES,
			PROCTOR_EVENT_TYPES,
			PARTNER_EVENT_TYPES,
		];
		const total = families.reduce((sum, fam) => sum + fam.length, 0);
		expect(total).toBe(CATALOG_EVENT_TYPES.length);
		const union = new Set(families.flat());
		expect(union.size).toBe(total);
	});

	it("resolves a schema for every event type via payloadSchemaFor", () => {
		for (const eventType of CATALOG_EVENT_TYPES) {
			expect(payloadSchemaFor(eventType)).toBeInstanceOf(z.ZodObject);
		}
	});
});

describe("field classification (FR-5)", () => {
	it("tags every field of every payload with a classification", () => {
		for (const [eventType, schema] of Object.entries(EVENT_PAYLOAD_SCHEMAS)) {
			expect({ eventType, untagged: unclassifiedFields(schema) }).toEqual({
				eventType,
				untagged: [],
			});
		}
	});

	it("only uses valid FieldClassification members", () => {
		const allowed = new Set<string>(Object.values(FieldClassification));
		for (const schema of Object.values(EVENT_PAYLOAD_SCHEMAS)) {
			for (const fieldSchema of Object.values(schema.shape)) {
				const c = classificationOf(fieldSchema as z.ZodType);
				expect(c).toBeDefined();
				expect(allowed.has(c as string)).toBe(true);
			}
		}
	});
});

describe("isCatalogEventType", () => {
	it("accepts known types and rejects unknown ones", () => {
		expect(isCatalogEventType("RegistrationConfirmed")).toBe(true);
		expect(isCatalogEventType("attempt.submitted")).toBe(true);
		expect(isCatalogEventType("NotARealEvent")).toBe(false);
	});
});

describe("payload validation", () => {
	it("accepts a well-formed RegistrationConfirmed payload", () => {
		const result = RegistrationConfirmedPayload.safeParse({
			registrationId: "reg_1",
			studentId: "stu_1",
			examSeriesId: "series_1",
			examSlotId: "slot_1",
			seatReservationId: "seat_1",
			paymentOrderId: "order_1",
			confirmedAt: "2026-06-23T00:00:00.000Z",
		});
		expect(result.success).toBe(true);
	});

	it("rejects a payload missing a required field", () => {
		const result = RegistrationConfirmedPayload.safeParse({ registrationId: "reg_1" });
		expect(result.success).toBe(false);
	});

	it("rejects an empty identifier", () => {
		const result = RegistrationConfirmedPayload.safeParse({
			registrationId: "",
			studentId: "stu_1",
			examSeriesId: "series_1",
			examSlotId: "slot_1",
			seatReservationId: "seat_1",
			paymentOrderId: "order_1",
			confirmedAt: "2026-06-23T00:00:00.000Z",
		});
		expect(result.success).toBe(false);
	});
});
