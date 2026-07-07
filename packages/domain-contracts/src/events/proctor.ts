/**
 * Proctor event family (PLAT-02 §7 catalog).
 *
 * The proctoring lifecycle, grouped by domain rather than producer: the
 * runtime-originated session/frame requests (`bio-exam -> bio-proctor`) live
 * here alongside the proctor results (`bio-proctor -> bio-exam`/`bio-admin`).
 *
 * Raw biometric data (face templates, frames) is never serialized into an
 * event: payloads carry references plus `biometric/sensitive` confidences only,
 * and biometric deletion is proven by reference (FR-5, DPDP / PROCTOR-05).
 */
import { z } from "zod";
import {
	defineCatalog,
	FieldClassification as FC,
	field,
	id,
	ratio,
	score,
	text,
	timestamp,
} from "./_shared.ts";

/** Typed proctor signal kinds (PROCTOR-03 `ProctorEventType` enum). */
const ProctorEventType = z.enum([
	"NO_FACE",
	"MULTIPLE_FACES",
	"FACE_MISMATCH",
	"LOW_CONFIDENCE",
	"TAB_SWITCH",
	"WINDOW_BLUR",
	"SCREEN_CAPTURE",
	"NETWORK_DISCONNECT",
	"SEB_VIOLATION",
	"DEGRADED_MODE",
]);

/** Severity of a raised proctor event. */
const ProctorSeverity = z.enum(["LOW", "MEDIUM", "HIGH"]);

/** Origin of a proctor signal. */
const ProctorSource = z.enum(["SERVER", "CLIENT", "SEB"]);

/** Risk banding derived from the rolling risk score. */
const RiskBand = z.enum(["LOW", "ELEVATED", "HIGH"]);

/** Why a frame was rejected during analysis. */
const FrameRejectionReason = z.enum([
	"NO_FACE",
	"MULTIPLE_FACES",
	"LOW_QUALITY",
	"MISMATCH",
	"SPOOF_SUSPECTED",
]);

/** Why biometric data was deleted (DPDP retention lifecycle). */
const BiometricDeletionReason = z.enum(["RETENTION_EXPIRED", "USER_REQUEST", "CONSENT_WITHDRAWN"]);

/** `ProctorSessionRequested` — runtime asks proctor to open a session (exam -> proctor). */
export const ProctorSessionRequestedPayload = z.object({
	attemptId: id("Attempt needing proctoring.", FC.AuthenticatedStudent),
	studentId: id("Student under proctoring.", FC.AuthenticatedStudent),
	examSnapshotId: id("Snapshot the attempt runs against.", FC.Public),
	sessionId: id("Proctor session id.", FC.ServiceInternal),
	requestedAt: timestamp("When the session was requested."),
});
export type ProctorSessionRequested = z.infer<typeof ProctorSessionRequestedPayload>;

/** `FrameAnalysisRequested` — runtime submits a frame for analysis (exam -> proctor). */
export const FrameAnalysisRequestedPayload = z.object({
	attemptId: id("Attempt the frame belongs to.", FC.AuthenticatedStudent),
	sessionId: id("Proctor session id.", FC.ServiceInternal),
	frameRef: text("Opaque reference to the captured frame.", FC.ServiceInternal),
	capturedAt: timestamp("When the frame was captured."),
	requestedAt: timestamp("When analysis was requested."),
});
export type FrameAnalysisRequested = z.infer<typeof FrameAnalysisRequestedPayload>;

/** `FaceEnrollmentCompleted` — a student's reference face is enrolled. */
export const FaceEnrollmentCompletedPayload = z.object({
	studentId: id("Enrolled student.", FC.AuthenticatedStudent),
	enrollmentId: id("Enrollment record id (reference only).", FC.ServiceInternal),
	modelVersion: text("Embedding model version used.", FC.ServiceInternal),
	completedAt: timestamp("When enrollment completed."),
});
export type FaceEnrollmentCompleted = z.infer<typeof FaceEnrollmentCompletedPayload>;

/** `ProctorFrameAccepted` — a submitted frame passed analysis. */
export const ProctorFrameAcceptedPayload = z.object({
	attemptId: id("Attempt the frame belongs to.", FC.AuthenticatedStudent),
	frameId: id("Analysed frame id.", FC.ServiceInternal),
	matchConfidence: ratio("Face-match confidence [0,1].", FC.BiometricSensitive),
	acceptedAt: timestamp("When the frame was accepted."),
});
export type ProctorFrameAccepted = z.infer<typeof ProctorFrameAcceptedPayload>;

/** `ProctorFrameRejected` — a submitted frame failed analysis. */
export const ProctorFrameRejectedPayload = z.object({
	attemptId: id("Attempt the frame belongs to.", FC.AuthenticatedStudent),
	frameId: id("Analysed frame id.", FC.ServiceInternal),
	rejectionReason: field(FrameRejectionReason, FC.AdminOnly, "Why the frame was rejected."),
	matchConfidence: ratio("Face-match confidence [0,1].", FC.BiometricSensitive),
	rejectedAt: timestamp("When the frame was rejected."),
});
export type ProctorFrameRejected = z.infer<typeof ProctorFrameRejectedPayload>;

/** `ProctorEventRaised` — a typed integrity event accepted by secure ingest. */
export const ProctorEventRaisedPayload = z.object({
	proctorEventId: id("Raised proctor event id.", FC.ServiceInternal),
	attemptId: id("Attempt the event relates to.", FC.AuthenticatedStudent),
	studentId: id("Student the event relates to.", FC.AuthenticatedStudent),
	type: field(ProctorEventType, FC.AdminOnly, "Typed proctor event kind."),
	severity: field(ProctorSeverity, FC.AdminOnly, "Event severity."),
	source: field(ProctorSource, FC.ServiceInternal, "Where the event originated."),
	confidence: field(
		z.number().min(0).max(1).optional(),
		FC.BiometricSensitive,
		"Detection confidence [0,1], when applicable.",
	),
	modelVersion: field(
		z.string().optional(),
		FC.ServiceInternal,
		"Analysis model version, for server-side events.",
	),
	occurredAt: timestamp("When the event occurred."),
	recordedAt: timestamp("When the event was recorded by ingest."),
});
export type ProctorEventRaised = z.infer<typeof ProctorEventRaisedPayload>;

/** `RiskScoreChanged` — the rolling integrity risk score updated. */
export const RiskScoreChangedPayload = z.object({
	attemptId: id("Attempt whose risk changed.", FC.AuthenticatedStudent),
	studentId: id("Student under proctoring.", FC.AuthenticatedStudent),
	previousScore: score("Risk score before the update.", FC.AdminOnly),
	newScore: score("Risk score after the update.", FC.AdminOnly),
	riskBand: field(RiskBand, FC.AdminOnly, "Banded risk level."),
	changedAt: timestamp("When the risk score changed."),
});
export type RiskScoreChanged = z.infer<typeof RiskScoreChangedPayload>;

/** `ProctorReportFinalized` — the per-attempt proctoring report is closed. */
export const ProctorReportFinalizedPayload = z.object({
	reportId: id("Finalized report id.", FC.AdminOnly),
	attemptId: id("Attempt the report covers.", FC.AdminOnly),
	studentId: id("Student the report is about.", FC.AdminOnly),
	finalRiskScore: score("Final aggregated risk score.", FC.AdminOnly),
	riskBand: field(RiskBand, FC.AdminOnly, "Final banded risk level."),
	finalizedAt: timestamp("When the report was finalized."),
});
export type ProctorReportFinalized = z.infer<typeof ProctorReportFinalizedPayload>;

/** `BiometricDataDeleted` — biometric data erased, with a verifiable proof reference (DPDP). */
export const BiometricDataDeletedPayload = z.object({
	studentId: id("Student whose biometric data was deleted.", FC.AuthenticatedStudent),
	deletionId: id("Deletion record id.", FC.ServiceInternal),
	reason: field(BiometricDeletionReason, FC.AdminOnly, "Why the data was deleted."),
	proofRef: text("Reference to the cryptographic deletion proof.", FC.BiometricSensitive),
	deletedAt: timestamp("When the data was deleted."),
});
export type BiometricDataDeleted = z.infer<typeof BiometricDataDeletedPayload>;

/** Proctor-family payload catalog, keyed by canonical `eventType`. */
export const PROCTOR_EVENT_PAYLOADS = defineCatalog({
	ProctorSessionRequested: ProctorSessionRequestedPayload,
	FrameAnalysisRequested: FrameAnalysisRequestedPayload,
	FaceEnrollmentCompleted: FaceEnrollmentCompletedPayload,
	ProctorFrameAccepted: ProctorFrameAcceptedPayload,
	ProctorFrameRejected: ProctorFrameRejectedPayload,
	ProctorEventRaised: ProctorEventRaisedPayload,
	RiskScoreChanged: RiskScoreChangedPayload,
	ProctorReportFinalized: ProctorReportFinalizedPayload,
	BiometricDataDeleted: BiometricDataDeletedPayload,
});

/** Proctor-family event-type names. */
export const PROCTOR_EVENT_TYPES = Object.keys(
	PROCTOR_EVENT_PAYLOADS,
) as (keyof typeof PROCTOR_EVENT_PAYLOADS)[];
