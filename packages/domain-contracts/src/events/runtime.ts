/**
 * Runtime event family (PLAT-02 §7 catalog).
 *
 * Producer surface: `bio-exam` (the exam-window runtime). Covers the attempt
 * lifecycle (`bio-exam -> bio-admin`): start, autosave telemetry, user and auto
 * submission, and runtime integrity signals.
 *
 * Saved-answer contents never cross the wire: `answer.saved` carries only
 * progress telemetry (`service-internal`), not the selected option (FR-5).
 */
import { z } from "zod";
import {
	count,
	defineCatalog,
	FieldClassification as FC,
	field,
	id,
	timestamp,
} from "./_shared.ts";

/**
 * Why an attempt was submitted. One event with a discriminator (PLAT-02 §13):
 * `attempt.submitted` carries USER / ADMIN_FORCE / SYSTEM_RECOVERY; timer-driven
 * closes surface as `attempt.auto_submitted` with {@link AutoSubmitReason}.
 */
const SubmitReason = z.enum(["USER", "ADMIN_FORCE", "SYSTEM_RECOVERY"]);

/** Why an attempt auto-submitted without an explicit user action. */
const AutoSubmitReason = z.enum([
	"TIMER_EXPIRED",
	"CONNECTION_LOST",
	"SEB_TERMINATED",
	"PROCTOR_FORCED",
]);

/** Runtime integrity signal categories raised by the player/SEB shell. */
const IntegritySignalType = z.enum([
	"TAB_SWITCH",
	"WINDOW_BLUR",
	"FULLSCREEN_EXIT",
	"COPY_PASTE",
	"NETWORK_DISCONNECT",
	"CLOCK_DRIFT",
	"SEB_VIOLATION",
]);

/** Severity ranking for a runtime integrity signal. */
const IntegritySeverity = z.enum(["INFO", "WARN", "CRITICAL"]);

/** Where a runtime signal originated. */
const SignalSource = z.enum(["CLIENT", "SERVER", "SEB"]);

/** `attempt.started` — a student begins an entitled attempt. */
export const AttemptStartedPayload = z.object({
	attemptId: id("Started attempt id.", FC.AuthenticatedStudent),
	studentId: id("Student running the attempt.", FC.AuthenticatedStudent),
	registrationId: id("Entitlement that authorised the attempt.", FC.AuthenticatedStudent),
	examSnapshotId: id("Snapshot the attempt runs against.", FC.Public),
	startedAt: timestamp("When the attempt started."),
});
export type AttemptStarted = z.infer<typeof AttemptStartedPayload>;

/** `answer.saved` — autosave progress telemetry (no answer content). */
export const AnswerSavedPayload = z.object({
	attemptId: id("Attempt the save belongs to.", FC.AuthenticatedStudent),
	questionId: id("Question whose answer was saved.", FC.ServiceInternal),
	revision: count("Monotonic autosave revision.", FC.ServiceInternal),
	answeredCount: count("Total questions answered so far.", FC.AuthenticatedStudent),
	savedAt: timestamp("When the answer was saved."),
});
export type AnswerSaved = z.infer<typeof AnswerSavedPayload>;

/** `attempt.submitted` — an attempt is submitted by user/admin/recovery. */
export const AttemptSubmittedPayload = z.object({
	attemptId: id("Submitted attempt id.", FC.AuthenticatedStudent),
	studentId: id("Student who owns the attempt.", FC.AuthenticatedStudent),
	examSnapshotId: id("Snapshot the attempt ran against.", FC.Public),
	submitReason: field(SubmitReason, FC.AuthenticatedStudent, "What triggered the submission."),
	answeredCount: count("Questions answered at submission.", FC.AuthenticatedStudent),
	submittedAt: timestamp("When the attempt was submitted."),
});
export type AttemptSubmitted = z.infer<typeof AttemptSubmittedPayload>;

/** `attempt.auto_submitted` — an attempt closed automatically (timer/connection/SEB). */
export const AttemptAutoSubmittedPayload = z.object({
	attemptId: id("Auto-submitted attempt id.", FC.AuthenticatedStudent),
	studentId: id("Student who owns the attempt.", FC.AuthenticatedStudent),
	examSnapshotId: id("Snapshot the attempt ran against.", FC.Public),
	autoSubmitReason: field(AutoSubmitReason, FC.AuthenticatedStudent, "Why it auto-submitted."),
	answeredCount: count("Questions answered at auto-submission.", FC.AuthenticatedStudent),
	submittedAt: timestamp("When the attempt auto-submitted."),
});
export type AttemptAutoSubmitted = z.infer<typeof AttemptAutoSubmittedPayload>;

/** `runtime.integrity_signal_raised` — the runtime flags an integrity event. */
export const RuntimeIntegritySignalRaisedPayload = z.object({
	attemptId: id("Attempt the signal relates to.", FC.AuthenticatedStudent),
	studentId: id("Student running the attempt.", FC.AuthenticatedStudent),
	signalType: field(IntegritySignalType, FC.ServiceInternal, "Integrity signal category."),
	severity: field(IntegritySeverity, FC.AdminOnly, "Signal severity."),
	source: field(SignalSource, FC.ServiceInternal, "Where the signal originated."),
	raisedAt: timestamp("When the signal was raised."),
});
export type RuntimeIntegritySignalRaised = z.infer<typeof RuntimeIntegritySignalRaisedPayload>;

/** Runtime-family payload catalog, keyed by canonical `eventType`. */
export const RUNTIME_EVENT_PAYLOADS = defineCatalog({
	"attempt.started": AttemptStartedPayload,
	"answer.saved": AnswerSavedPayload,
	"attempt.submitted": AttemptSubmittedPayload,
	"attempt.auto_submitted": AttemptAutoSubmittedPayload,
	"runtime.integrity_signal_raised": RuntimeIntegritySignalRaisedPayload,
});

/** Runtime-family event-type names. */
export const RUNTIME_EVENT_TYPES = Object.keys(
	RUNTIME_EVENT_PAYLOADS,
) as (keyof typeof RUNTIME_EVENT_PAYLOADS)[];
