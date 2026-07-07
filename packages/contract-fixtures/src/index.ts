/**
 * Cross-repo contract fixtures.
 *
 * Every {@link CrossRepoEventType} that travels between BIO services needs a
 * golden sample from *both* sides of the wire: a `producer` fixture (the shape
 * the emitting service serialises) and a `consumer` fixture (a second scenario
 * the receiving service must accept). `scripts/assert-fixture-coverage.ts`
 * fails CI when any cross-repo event is missing either role, so the two sides
 * can never drift without a fixture to catch it.
 */
import type {
	BioEventEnvelope,
	BioEventProducer,
	CrossRepoEventType,
	EventPayload,
} from "../../domain-contracts/src/index.ts";
import { CONTRACT_VERSION } from "../../shared-types/src/index.ts";

/** Which side of the contract a fixture represents. */
export type FixtureRole = "producer" | "consumer";

/** A golden cross-repo event sample tagged with its event type and wire role. */
export interface ContractFixture<K extends CrossRepoEventType = CrossRepoEventType> {
	readonly eventType: K;
	readonly role: FixtureRole;
	readonly description: string;
	readonly envelope: BioEventEnvelope<EventPayload<K>>;
}

/** Build a fully-formed fixture envelope with deterministic metadata. */
function makeFixture<K extends CrossRepoEventType>(
	eventType: K,
	role: FixtureRole,
	producer: BioEventProducer,
	description: string,
	occurredAt: string,
	payload: EventPayload<K>,
): ContractFixture<K> {
	const slug = `${eventType}_${role}`.replace(/\W+/g, "_").toLowerCase();
	return {
		eventType,
		role,
		description,
		envelope: {
			eventId: `evt_fixture_${slug}`,
			eventType,
			eventVersion: CONTRACT_VERSION,
			occurredAt,
			producer,
			correlationId: `corr_fixture_${slug}`,
			idempotencyKey: `${eventType}-${role}-fixture`,
			payload,
		},
	};
}

// --- commerce (bio-portal) ---------------------------------------------------

const registrationConfirmedProducer = makeFixture(
	"RegistrationConfirmed",
	"producer",
	"bio-portal",
	"Portal confirms a paid registration (the entitlement).",
	"2026-06-08T00:00:00.000Z",
	{
		registrationId: "reg_fixture_producer",
		studentId: "stu_fixture_producer",
		examSeriesId: "series_fixture",
		examSlotId: "slot_fixture",
		seatReservationId: "seat_fixture",
		paymentOrderId: "payorder_fixture",
		confirmedAt: "2026-06-08T00:00:00.000Z",
	},
);

const registrationConfirmedConsumer = makeFixture(
	"RegistrationConfirmed",
	"consumer",
	"bio-portal",
	"Exam runtime ingests a confirmed registration to gate an attempt.",
	"2026-06-09T09:30:00.000Z",
	{
		registrationId: "reg_fixture_consumer",
		studentId: "stu_fixture_consumer",
		examSeriesId: "series_fixture_2",
		examSlotId: "slot_fixture_2",
		seatReservationId: "seat_fixture_2",
		paymentOrderId: "payorder_fixture_2",
		confirmedAt: "2026-06-09T09:30:00.000Z",
	},
);

const registrationCancelledProducer = makeFixture(
	"RegistrationCancelled",
	"producer",
	"bio-portal",
	"Portal cancels a registration at the student's request.",
	"2026-06-10T11:00:00.000Z",
	{
		registrationId: "reg_fixture_cancel",
		studentId: "stu_fixture_cancel",
		examSlotId: "slot_fixture",
		reason: "USER_REQUESTED",
		cancelledAt: "2026-06-10T11:00:00.000Z",
	},
);

const registrationCancelledConsumer = makeFixture(
	"RegistrationCancelled",
	"consumer",
	"bio-portal",
	"Exam runtime revokes an entitlement after a payment-failed cancellation.",
	"2026-06-10T12:15:00.000Z",
	{
		registrationId: "reg_fixture_cancel_2",
		studentId: "stu_fixture_cancel_2",
		examSlotId: "slot_fixture_2",
		reason: "PAYMENT_FAILED",
		cancelledAt: "2026-06-10T12:15:00.000Z",
	},
);

// --- admin (bio-admin) -------------------------------------------------------

const examSnapshotPublishedProducer = makeFixture(
	"ExamSnapshotPublished",
	"producer",
	"bio-admin",
	"Admin publishes an immutable key-stripped exam snapshot.",
	"2026-06-11T08:00:00.000Z",
	{
		examSnapshotId: "snap_fixture",
		examSeriesId: "series_fixture",
		examSlotId: "slot_fixture",
		version: 1,
		checksum: "sha256-fixture-producer",
		questionCount: 40,
		publishedAt: "2026-06-11T08:00:00.000Z",
	},
);

const examSnapshotPublishedConsumer = makeFixture(
	"ExamSnapshotPublished",
	"consumer",
	"bio-admin",
	"Exam runtime loads a re-published snapshot revision.",
	"2026-06-11T18:45:00.000Z",
	{
		examSnapshotId: "snap_fixture_2",
		examSeriesId: "series_fixture_2",
		examSlotId: "slot_fixture_2",
		version: 2,
		checksum: "sha256-fixture-consumer",
		questionCount: 50,
		publishedAt: "2026-06-11T18:45:00.000Z",
	},
);

const examSlotPublishedProducer = makeFixture(
	"ExamSlotPublished",
	"producer",
	"bio-admin",
	"Admin publishes a bookable slot to the catalog.",
	"2026-06-12T07:00:00.000Z",
	{
		examSlotId: "slot_fixture",
		examSeriesId: "series_fixture",
		capacity: 200,
		opensAt: "2026-06-12T09:00:00.000Z",
		closesAt: "2026-06-20T23:59:59.000Z",
		runtimeWindowStart: "2026-06-25T04:30:00.000Z",
		runtimeWindowEnd: "2026-06-25T07:30:00.000Z",
		publishedAt: "2026-06-12T07:00:00.000Z",
	},
);

const examSlotPublishedConsumer = makeFixture(
	"ExamSlotPublished",
	"consumer",
	"bio-admin",
	"Portal catalog ingests a newly published slot.",
	"2026-06-12T07:05:00.000Z",
	{
		examSlotId: "slot_fixture_2",
		examSeriesId: "series_fixture_2",
		capacity: 0,
		opensAt: "2026-06-13T09:00:00.000Z",
		closesAt: "2026-06-21T23:59:59.000Z",
		runtimeWindowStart: "2026-06-26T04:30:00.000Z",
		runtimeWindowEnd: "2026-06-26T07:30:00.000Z",
		publishedAt: "2026-06-12T07:05:00.000Z",
	},
);

// --- runtime (bio-exam) ------------------------------------------------------

const attemptSubmittedProducer = makeFixture(
	"attempt.submitted",
	"producer",
	"bio-exam",
	"Exam runtime emits a student-triggered submission.",
	"2026-06-25T06:30:00.000Z",
	{
		attemptId: "attempt_fixture",
		studentId: "stu_fixture",
		examSnapshotId: "snap_fixture",
		submitReason: "USER",
		answeredCount: 40,
		submittedAt: "2026-06-25T06:30:00.000Z",
	},
);

const attemptSubmittedConsumer = makeFixture(
	"attempt.submitted",
	"consumer",
	"bio-exam",
	"Admin scoring ingests an admin-forced submission.",
	"2026-06-25T07:29:00.000Z",
	{
		attemptId: "attempt_fixture_2",
		studentId: "stu_fixture_2",
		examSnapshotId: "snap_fixture_2",
		submitReason: "ADMIN_FORCE",
		answeredCount: 12,
		submittedAt: "2026-06-25T07:29:00.000Z",
	},
);

// --- proctor (bio-exam -> bio-proctor -> bio-admin) --------------------------

const proctorSessionRequestedProducer = makeFixture(
	"ProctorSessionRequested",
	"producer",
	"bio-exam",
	"Exam runtime requests a proctor session for a starting attempt.",
	"2026-06-25T04:35:00.000Z",
	{
		attemptId: "attempt_fixture",
		studentId: "stu_fixture",
		examSnapshotId: "snap_fixture",
		sessionId: "proctor_session_fixture",
		requestedAt: "2026-06-25T04:35:00.000Z",
	},
);

const proctorSessionRequestedConsumer = makeFixture(
	"ProctorSessionRequested",
	"consumer",
	"bio-exam",
	"Proctor service ingests a session request to begin frame analysis.",
	"2026-06-25T04:36:00.000Z",
	{
		attemptId: "attempt_fixture_2",
		studentId: "stu_fixture_2",
		examSnapshotId: "snap_fixture_2",
		sessionId: "proctor_session_fixture_2",
		requestedAt: "2026-06-25T04:36:00.000Z",
	},
);

const riskScoreChangedProducer = makeFixture(
	"RiskScoreChanged",
	"producer",
	"bio-proctor",
	"Proctor service raises an attempt's risk score into the elevated band.",
	"2026-06-25T05:10:00.000Z",
	{
		attemptId: "attempt_fixture",
		studentId: "stu_fixture",
		previousScore: 10,
		newScore: 55,
		riskBand: "ELEVATED",
		changedAt: "2026-06-25T05:10:00.000Z",
	},
);

const riskScoreChangedConsumer = makeFixture(
	"RiskScoreChanged",
	"consumer",
	"bio-proctor",
	"Admin review console ingests a high-band risk update.",
	"2026-06-25T05:25:00.000Z",
	{
		attemptId: "attempt_fixture_2",
		studentId: "stu_fixture_2",
		previousScore: 55,
		newScore: 90,
		riskBand: "HIGH",
		changedAt: "2026-06-25T05:25:00.000Z",
	},
);

const proctorReportFinalizedProducer = makeFixture(
	"ProctorReportFinalized",
	"producer",
	"bio-proctor",
	"Proctor service finalizes the risk report for a completed attempt.",
	"2026-06-25T08:00:00.000Z",
	{
		reportId: "report_fixture",
		attemptId: "attempt_fixture",
		studentId: "stu_fixture",
		finalRiskScore: 55,
		riskBand: "ELEVATED",
		finalizedAt: "2026-06-25T08:00:00.000Z",
	},
);

const proctorReportFinalizedConsumer = makeFixture(
	"ProctorReportFinalized",
	"consumer",
	"bio-proctor",
	"Admin results pipeline ingests a finalized high-risk report.",
	"2026-06-25T08:30:00.000Z",
	{
		reportId: "report_fixture_2",
		attemptId: "attempt_fixture_2",
		studentId: "stu_fixture_2",
		finalRiskScore: 90,
		riskBand: "HIGH",
		finalizedAt: "2026-06-25T08:30:00.000Z",
	},
);

/**
 * Every cross-repo contract fixture. The list is the single source of truth for
 * coverage: {@link assertFixtureCoverage} reads it to prove every
 * {@link CrossRepoEventType} carries both a producer and a consumer sample.
 */
export const CONTRACT_FIXTURES: readonly ContractFixture[] = [
	registrationConfirmedProducer,
	registrationConfirmedConsumer,
	registrationCancelledProducer,
	registrationCancelledConsumer,
	examSnapshotPublishedProducer,
	examSnapshotPublishedConsumer,
	examSlotPublishedProducer,
	examSlotPublishedConsumer,
	attemptSubmittedProducer,
	attemptSubmittedConsumer,
	proctorSessionRequestedProducer,
	proctorSessionRequestedConsumer,
	riskScoreChangedProducer,
	riskScoreChangedConsumer,
	proctorReportFinalizedProducer,
	proctorReportFinalizedConsumer,
];

/**
 * Canonical confirmed-registration envelope. Kept as a named export for the
 * contract-version test and downstream consumers.
 */
export const registrationConfirmedFixture: BioEventEnvelope<EventPayload<"RegistrationConfirmed">> =
	registrationConfirmedProducer.envelope;
