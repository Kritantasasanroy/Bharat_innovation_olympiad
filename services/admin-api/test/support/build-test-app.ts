import { buildApp } from "../../src/app";
import { buildContainer, type PartnerAdapters, type PartnerContainer } from "../../src/container";
import {
	FakeClock,
	FakeIdGenerator,
	InMemoryAttributionRepository,
	InMemoryCampaignRepository,
	InMemoryCommissionStatementRepository,
	InMemoryPartnerApplicationRepository,
	InMemoryPartnerInstitutionAssignmentRepository,
	InMemoryPartnerRepository,
	InMemoryPayoutLedgerRepository,
	RecordingAuditSink,
	RecordingEventPublisher,
} from "./in-memory-repos";

/** A fresh, isolated in-memory partner-engine test harness (adapters + services + app). */
export interface TestHarness {
	readonly adapters: PartnerAdapters;
	readonly container: PartnerContainer;
	readonly app: ReturnType<typeof buildApp>;
	readonly clock: FakeClock;
	readonly events: RecordingEventPublisher;
	readonly audit: RecordingAuditSink;
}

/** Build a brand-new in-memory harness — no shared state leaks between tests. */
export function buildTestHarness(): TestHarness {
	const clock = new FakeClock();
	const events = new RecordingEventPublisher();
	const audit = new RecordingAuditSink();

	const adapters: PartnerAdapters = {
		partners: new InMemoryPartnerRepository(),
		applications: new InMemoryPartnerApplicationRepository(),
		campaigns: new InMemoryCampaignRepository(),
		attributions: new InMemoryAttributionRepository(),
		statements: new InMemoryCommissionStatementRepository(),
		payouts: new InMemoryPayoutLedgerRepository(),
		assignments: new InMemoryPartnerInstitutionAssignmentRepository(),
		clock,
		ids: new FakeIdGenerator(),
		events,
		audit,
	};

	const container = buildContainer(adapters);
	const app = buildApp(container);

	return { adapters, container, app, clock, events, audit };
}

/** POST/PATCH/DELETE JSON helper over `Elysia#handle`, mirroring `fetch`. */
export async function jsonRequest(
	app: ReturnType<typeof buildApp>,
	method: string,
	path: string,
	options: { readonly body?: unknown; readonly headers?: Record<string, string> } = {},
): Promise<Response> {
	const headers: Record<string, string> = { ...(options.headers ?? {}) };
	let body: string | undefined;
	if (options.body !== undefined) {
		headers["content-type"] = "application/json";
		body = JSON.stringify(options.body);
	}
	return app.handle(
		new Request(`http://localhost${path}`, {
			method,
			headers,
			...(body !== undefined ? { body } : {}),
		}),
	);
}
