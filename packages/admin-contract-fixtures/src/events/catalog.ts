/**
 * bio-admin cross-repo event catalog.
 *
 * A verbatim projection of the canonical cross-repo event catalog
 * (PRD-PLAT-02 §7, the single source of truth) restricted to the events that
 * **bio-admin** either emits or consumes. The authoritative catalog ships in
 * the `@bio/domain-contracts` package (`bio-contracts` repo); that package is
 * not a workspace dependency of bio-admin, so this module re-declares the
 * bio-admin slice locally for fixture authoring. The {@link contract-version}
 * gate keeps the two definitions pinned to the same contract release.
 *
 * Each entry records bio-admin's relationship to the event (`emit` vs
 * `consume`), the producing/consuming repos, the most sensitive field class the
 * payload may carry (FR-5), and the event-family version. The fixture-coverage
 * check asserts that *every* entry here has **both** a producer and a consumer
 * fixture, regardless of direction — drift on either side fails CI (FR-8).
 *
 * Internal bio-admin events (`attempt.scored`, `result.release_scheduled`,
 * `result.released`, `certificate.issued`) are intentionally excluded: they do
 * not cross a repo boundary and so carry no cross-repo producer/consumer
 * contract.
 */

import type { BioRepo, FieldClassification } from "./envelope.ts";

/** bio-admin's relationship to a catalog event. */
export type EventDirection = "emit" | "consume";

/** One canonical cross-repo event that bio-admin participates in. */
export interface CatalogEvent {
	/** Canonical event-type name — use verbatim from PRD-PLAT-02 §7. */
	readonly eventType: string;
	/** Whether bio-admin emits or consumes the event. */
	readonly direction: EventDirection;
	/** The repo that produces the event. */
	readonly producer: BioRepo;
	/** Every repo that consumes the event (an event may fan out to several). */
	readonly consumers: readonly BioRepo[];
	/** Event-family SemVer (FR-8); consumers reject unknown majors. */
	readonly version: string;
	/** Most sensitive field class the payload may carry (FR-5). */
	readonly classification: FieldClassification;
	/** One-line description of the business meaning. */
	readonly description: string;
}

/**
 * The bio-admin cross-repo event catalog.
 *
 * Grouped by edge for readability; `eventType` is unique across the list and is
 * the key the fixture registries are indexed by. `ExamSnapshotPublished` fans
 * out to both bio-portal (public catalog metadata) and bio-exam (key-stripped
 * runtime snapshot) and therefore lists two consumers under one entry.
 */
export const BIO_ADMIN_EVENT_CATALOG: readonly CatalogEvent[] = [
	// ── bio-admin → bio-portal (emit) ─────────────────────────────────────────
	{
		eventType: "ExamSlotPublished",
		direction: "emit",
		producer: "bio-admin",
		consumers: ["bio-portal"],
		version: "1.0.0",
		classification: "public",
		description: "A new exam slot is published to the student-facing catalog.",
	},
	{
		eventType: "ExamSlotCapacityChanged",
		direction: "emit",
		producer: "bio-admin",
		consumers: ["bio-portal"],
		version: "1.0.0",
		classification: "public",
		description: "Remaining seat capacity for a published slot changed.",
	},
	{
		eventType: "ExamSlotClosed",
		direction: "emit",
		producer: "bio-admin",
		consumers: ["bio-portal"],
		version: "1.0.0",
		classification: "public",
		description: "A slot is closed to further booking.",
	},
	{
		eventType: "ExamSnapshotPublished",
		direction: "emit",
		producer: "bio-admin",
		consumers: ["bio-portal", "bio-exam"],
		version: "1.0.0",
		classification: "public",
		description:
			"An immutable, key-stripped exam snapshot is published for catalog display (portal) and runtime delivery (exam).",
	},
	// ── bio-admin → bio-exam (emit) ───────────────────────────────────────────
	{
		eventType: "ExamSlotRuntimeWindowChanged",
		direction: "emit",
		producer: "bio-admin",
		consumers: ["bio-exam"],
		version: "1.0.0",
		classification: "service-internal",
		description: "The runtime open/close window for a slot was adjusted.",
	},
	{
		eventType: "ResultReleasePaused",
		direction: "emit",
		producer: "bio-admin",
		consumers: ["bio-exam"],
		version: "1.0.0",
		classification: "service-internal",
		description: "Operational signal pausing result release for a slot/series.",
	},
	{
		eventType: "ResultReleaseResumed",
		direction: "emit",
		producer: "bio-admin",
		consumers: ["bio-exam"],
		version: "1.0.0",
		classification: "service-internal",
		description: "Operational signal resuming a previously paused result release.",
	},
	// ── bio-portal → bio-admin (consume) ──────────────────────────────────────
	{
		eventType: "StudentProfileCompleted",
		direction: "consume",
		producer: "bio-portal",
		consumers: ["bio-admin"],
		version: "1.0.0",
		classification: "authenticated-student",
		description: "A student finished their registration profile.",
	},
	{
		eventType: "GuardianConsentCaptured",
		direction: "consume",
		producer: "bio-portal",
		consumers: ["bio-admin"],
		version: "1.0.0",
		classification: "authenticated-student",
		description: "DPDP guardian consent was captured for a minor student.",
	},
	{
		eventType: "SeatReservationHeld",
		direction: "consume",
		producer: "bio-portal",
		consumers: ["bio-admin"],
		version: "1.0.0",
		classification: "authenticated-student",
		description: "A seat was held pending payment.",
	},
	{
		eventType: "SeatReservationExpired",
		direction: "consume",
		producer: "bio-portal",
		consumers: ["bio-admin"],
		version: "1.0.0",
		classification: "authenticated-student",
		description: "A held seat reservation expired without payment.",
	},
	{
		eventType: "PaymentCaptured",
		direction: "consume",
		producer: "bio-portal",
		consumers: ["bio-admin"],
		version: "1.0.0",
		classification: "payment-sensitive",
		description: "A reservation's payment was captured (no payment secrets cross the wire).",
	},
	{
		eventType: "RefundProcessed",
		direction: "consume",
		producer: "bio-portal",
		consumers: ["bio-admin"],
		version: "1.0.0",
		classification: "payment-sensitive",
		description: "A refund completed for a cancelled registration.",
	},
	{
		eventType: "RegistrationConfirmed",
		direction: "consume",
		producer: "bio-portal",
		consumers: ["bio-admin"],
		version: "1.0.0",
		classification: "authenticated-student",
		description: "Reporting/audit copy of a confirmed paid registration (the entitlement).",
	},
	{
		eventType: "RegistrationCancelled",
		direction: "consume",
		producer: "bio-portal",
		consumers: ["bio-admin"],
		version: "1.0.0",
		classification: "authenticated-student",
		description: "Reporting/audit copy of a cancelled registration.",
	},
	// ── bio-exam → bio-admin (consume) ────────────────────────────────────────
	{
		eventType: "attempt.started",
		direction: "consume",
		producer: "bio-exam",
		consumers: ["bio-admin"],
		version: "1.0.0",
		classification: "service-internal",
		description: "A student started an exam attempt.",
	},
	{
		eventType: "answer.saved",
		direction: "consume",
		producer: "bio-exam",
		consumers: ["bio-admin"],
		version: "1.0.0",
		classification: "service-internal",
		description: "Aggregate/telemetry signal that an answer was autosaved.",
	},
	{
		eventType: "attempt.submitted",
		direction: "consume",
		producer: "bio-exam",
		consumers: ["bio-admin"],
		version: "1.0.0",
		classification: "service-internal",
		description: "An attempt was submitted (submitReason carries USER/AUTO/ADMIN/SYSTEM).",
	},
	{
		eventType: "attempt.auto_submitted",
		direction: "consume",
		producer: "bio-exam",
		consumers: ["bio-admin"],
		version: "1.0.0",
		classification: "service-internal",
		description: "An attempt was auto-submitted by the durable timer.",
	},
	{
		eventType: "runtime.integrity_signal_raised",
		direction: "consume",
		producer: "bio-exam",
		consumers: ["bio-admin"],
		version: "1.0.0",
		classification: "service-internal",
		description: "A runtime integrity signal was raised during an attempt.",
	},
	// ── bio-proctor → bio-admin (consume) ─────────────────────────────────────
	{
		eventType: "RiskScoreChanged",
		direction: "consume",
		producer: "bio-proctor",
		consumers: ["bio-admin"],
		version: "1.0.0",
		classification: "service-internal",
		description: "A proctor risk score changed for an attempt (no raw biometric data).",
	},
	{
		eventType: "ProctorReportFinalized",
		direction: "consume",
		producer: "bio-proctor",
		consumers: ["bio-admin"],
		version: "1.0.0",
		classification: "service-internal",
		description: "A proctor report was finalized for review/results/ops.",
	},
];

/** Every event type in the catalog (unique, verbatim). */
export const CATALOG_EVENT_TYPES: readonly string[] = BIO_ADMIN_EVENT_CATALOG.map(
	(event) => event.eventType,
);

/** Look up a catalog entry by its event type. */
export function findCatalogEvent(eventType: string): CatalogEvent | undefined {
	return BIO_ADMIN_EVENT_CATALOG.find((event) => event.eventType === eventType);
}
