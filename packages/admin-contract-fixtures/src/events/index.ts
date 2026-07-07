/**
 * @bio/admin-contract-fixtures — cross-repo event fixtures barrel.
 *
 * Public surface for the bio-admin contract-event fixtures: the event envelope,
 * the bio-admin slice of the `@bio/domain-contracts` cross-repo event catalog,
 * the producer/consumer fixture registries, and the pure coverage check shared
 * by the unit test and the CI gate.
 */

export {
	BIO_ADMIN_EVENT_CATALOG,
	CATALOG_EVENT_TYPES,
	type CatalogEvent,
	type EventDirection,
	findCatalogEvent,
} from "./catalog.ts";
export {
	type CoverageGap,
	type CoverageReport,
	computeCoverage,
	formatCoverageReport,
	type MalformedFixture,
} from "./coverage.ts";
export {
	type BioRepo,
	consumerFixture,
	type EnvelopeInit,
	type EventEnvelope,
	type EventFixture,
	type FieldClassification,
	type FixtureRole,
	makeEnvelope,
	producerFixture,
	REQUIRED_ENVELOPE_FIELDS,
} from "./envelope.ts";
export {
	ALL_EVENT_FIXTURES,
	CONSUMER_FIXTURES,
	PRODUCER_FIXTURES,
} from "./fixtures/index.ts";
