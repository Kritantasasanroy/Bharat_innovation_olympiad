/**
 * Admin event family (PLAT-02 §7 catalog + §13 ops augmentation).
 *
 * Producer surface: `bio-admin`. Covers slot publishing/scheduling
 * (`bio-admin -> bio-portal`), key-stripped snapshot + runtime-window signals
 * (`bio-admin -> bio-exam`), the admin-internal scoring/result/certificate
 * lifecycle, and the exam-day operational signals.
 *
 * Pre-release scores and result internals are `admin-only`: they must not reach
 * a student-facing contract before result release (FR-5, §9 acceptance).
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

/** Why a slot was closed. */
const SlotClosedReason = z.enum(["SOLD_OUT", "SCHEDULE_CHANGE", "OPERATIONAL", "CANCELLED"]);

/** Operational incident severity. */
const IncidentSeverity = z.enum(["SEV1", "SEV2", "SEV3"]);

/** Operational control surfaces an admin can execute on exam day. */
const ControlType = z.enum([
	"PAUSE_RESULT_RELEASE",
	"RESUME_RESULT_RELEASE",
	"EXTEND_RUNTIME_WINDOW",
	"FORCE_SUBMIT_BATCH",
]);

/** `ExamSlotPublished` — a bookable slot is published to the catalog (admin -> portal). */
export const ExamSlotPublishedPayload = z.object({
	examSlotId: id("Published slot id.", FC.Public),
	examSeriesId: id("Series the slot belongs to.", FC.Public),
	capacity: count("Total bookable seats.", FC.Public),
	opensAt: timestamp("Booking window opens."),
	closesAt: timestamp("Booking window closes."),
	runtimeWindowStart: timestamp("Exam runtime window start."),
	runtimeWindowEnd: timestamp("Exam runtime window end."),
	publishedAt: timestamp("When the slot was published."),
});
export type ExamSlotPublished = z.infer<typeof ExamSlotPublishedPayload>;

/** `ExamSlotCapacityChanged` — bookable capacity adjusted for a slot. */
export const ExamSlotCapacityChangedPayload = z.object({
	examSlotId: id("Affected slot id.", FC.Public),
	previousCapacity: count("Capacity before the change.", FC.Public),
	newCapacity: count("Capacity after the change.", FC.Public),
	changedAt: timestamp("When capacity changed."),
});
export type ExamSlotCapacityChanged = z.infer<typeof ExamSlotCapacityChangedPayload>;

/** `ExamSlotClosed` — a slot is no longer bookable. */
export const ExamSlotClosedPayload = z.object({
	examSlotId: id("Closed slot id.", FC.Public),
	reason: field(SlotClosedReason, FC.AdminOnly, "Why the slot closed."),
	closedAt: timestamp("When the slot closed."),
});
export type ExamSlotClosed = z.infer<typeof ExamSlotClosedPayload>;

/** `ExamSnapshotPublished` — key-stripped immutable exam snapshot (admin -> exam/portal). */
export const ExamSnapshotPublishedPayload = z.object({
	examSnapshotId: id("Immutable snapshot id.", FC.Public),
	examSeriesId: id("Series the snapshot belongs to.", FC.Public),
	examSlotId: id("Slot the snapshot serves.", FC.Public),
	version: count("Snapshot version.", FC.Public),
	checksum: text("Content checksum of the key-stripped snapshot.", FC.Public),
	questionCount: count("Number of questions in the snapshot.", FC.Public),
	publishedAt: timestamp("When the snapshot was published."),
});
export type ExamSnapshotPublished = z.infer<typeof ExamSnapshotPublishedPayload>;

/** `ExamSlotRuntimeWindowChanged` — runtime window retimed for a slot (admin -> exam). */
export const ExamSlotRuntimeWindowChangedPayload = z.object({
	examSlotId: id("Affected slot id.", FC.Public),
	runtimeWindowStart: timestamp("New runtime window start."),
	runtimeWindowEnd: timestamp("New runtime window end."),
	changedAt: timestamp("When the window changed."),
});
export type ExamSlotRuntimeWindowChanged = z.infer<typeof ExamSlotRuntimeWindowChangedPayload>;

/** `ResultReleasePaused` — operational hold on releasing results for a series. */
export const ResultReleasePausedPayload = z.object({
	examSeriesId: id("Series whose result release is paused.", FC.Public),
	reason: text("Why release was paused.", FC.AdminOnly),
	pausedBy: id("Admin who paused release.", FC.AdminOnly),
	pausedAt: timestamp("When release was paused."),
});
export type ResultReleasePaused = z.infer<typeof ResultReleasePausedPayload>;

/** `ResultReleaseResumed` — operational hold lifted. */
export const ResultReleaseResumedPayload = z.object({
	examSeriesId: id("Series whose result release resumed.", FC.Public),
	resumedBy: id("Admin who resumed release.", FC.AdminOnly),
	resumedAt: timestamp("When release resumed."),
});
export type ResultReleaseResumed = z.infer<typeof ResultReleaseResumedPayload>;

/** `attempt.scored` — an attempt has been scored (admin-internal, pre-release). */
export const AttemptScoredPayload = z.object({
	attemptId: id("Scored attempt id.", FC.AdminOnly),
	studentId: id("Student who owns the attempt.", FC.AdminOnly),
	examSnapshotId: id("Snapshot the attempt ran against.", FC.AdminOnly),
	score: count("Awarded score (pre-release, admin-only).", FC.AdminOnly),
	maxScore: count("Maximum achievable score.", FC.AdminOnly),
	scoredAt: timestamp("When scoring completed."),
});
export type AttemptScored = z.infer<typeof AttemptScoredPayload>;

/** `result.release_scheduled` — a future result-release time is set for a series. */
export const ResultReleaseScheduledPayload = z.object({
	examSeriesId: id("Series being scheduled.", FC.Public),
	scheduledFor: timestamp("When results are scheduled to release."),
	scheduledBy: id("Admin who scheduled release.", FC.AdminOnly),
	scheduledAt: timestamp("When the schedule was set."),
});
export type ResultReleaseScheduled = z.infer<typeof ResultReleaseScheduledPayload>;

/** `result.released` — results are now visible to students for a series. */
export const ResultReleasedPayload = z.object({
	examSeriesId: id("Series whose results are released.", FC.Public),
	releasedBy: id("Admin/system that released results.", FC.AdminOnly),
	releasedAt: timestamp("When results were released."),
});
export type ResultReleased = z.infer<typeof ResultReleasedPayload>;

/** `certificate.issued` — a certificate is issued for a completed attempt. */
export const CertificateIssuedPayload = z.object({
	certificateId: id("Issued certificate id.", FC.AuthenticatedStudent),
	studentId: id("Student the certificate is for.", FC.AuthenticatedStudent),
	examSeriesId: id("Series the certificate certifies.", FC.Public),
	attemptId: id("Attempt the certificate is based on.", FC.AuthenticatedStudent),
	certificateUrl: text("Download URL for the certificate.", FC.AuthenticatedStudent),
	issuedAt: timestamp("When the certificate was issued."),
});
export type CertificateIssued = z.infer<typeof CertificateIssuedPayload>;

/** `OpsIncidentDeclared` — an exam-day incident is opened (§13 ops). */
export const OpsIncidentDeclaredPayload = z.object({
	incidentId: id("Declared incident id.", FC.AdminOnly),
	severity: field(IncidentSeverity, FC.AdminOnly, "Incident severity."),
	summary: text("Short incident summary.", FC.AdminOnly),
	declaredBy: id("Operator who declared the incident.", FC.AdminOnly),
	declaredAt: timestamp("When the incident was declared."),
});
export type OpsIncidentDeclared = z.infer<typeof OpsIncidentDeclaredPayload>;

/** `OpsBannerChanged` — a student-facing status banner is shown/updated/cleared. */
export const OpsBannerChangedPayload = z.object({
	bannerId: id("Banner id.", FC.Public),
	message: text("Student-facing banner message.", FC.Public),
	active: field(z.boolean(), FC.Public, "Whether the banner is currently shown."),
	changedBy: id("Operator who changed the banner.", FC.AdminOnly),
	changedAt: timestamp("When the banner changed."),
});
export type OpsBannerChanged = z.infer<typeof OpsBannerChangedPayload>;

/** `OpsControlExecuted` — an operational control action was run (audit trail). */
export const OpsControlExecutedPayload = z.object({
	controlId: id("Control execution id.", FC.ServiceInternal),
	controlType: field(ControlType, FC.AdminOnly, "Which control was executed."),
	executedBy: id("Operator who ran the control.", FC.AdminOnly),
	executedAt: timestamp("When the control ran."),
});
export type OpsControlExecuted = z.infer<typeof OpsControlExecutedPayload>;

/** Admin-family payload catalog, keyed by canonical `eventType`. */
export const ADMIN_EVENT_PAYLOADS = defineCatalog({
	ExamSlotPublished: ExamSlotPublishedPayload,
	ExamSlotCapacityChanged: ExamSlotCapacityChangedPayload,
	ExamSlotClosed: ExamSlotClosedPayload,
	ExamSnapshotPublished: ExamSnapshotPublishedPayload,
	ExamSlotRuntimeWindowChanged: ExamSlotRuntimeWindowChangedPayload,
	ResultReleasePaused: ResultReleasePausedPayload,
	ResultReleaseResumed: ResultReleaseResumedPayload,
	"attempt.scored": AttemptScoredPayload,
	"result.release_scheduled": ResultReleaseScheduledPayload,
	"result.released": ResultReleasedPayload,
	"certificate.issued": CertificateIssuedPayload,
	OpsIncidentDeclared: OpsIncidentDeclaredPayload,
	OpsBannerChanged: OpsBannerChangedPayload,
	OpsControlExecuted: OpsControlExecutedPayload,
});

/** Admin-family event-type names. */
export const ADMIN_EVENT_TYPES = Object.keys(
	ADMIN_EVENT_PAYLOADS,
) as (keyof typeof ADMIN_EVENT_PAYLOADS)[];
