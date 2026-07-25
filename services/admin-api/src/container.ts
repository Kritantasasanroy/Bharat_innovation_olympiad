import { randomUUID } from "node:crypto";
import { createNoopAuditSink } from "./adapters/out/audit/noop-audit-sink";
import { ContractPartnerEventPublisher } from "./adapters/out/events/partner-event-publisher";
import {
	DrizzleAttributionRepository,
	DrizzleCampaignRepository,
} from "./adapters/out/persistence/drizzle-campaign.repository";
import { DrizzleCommissionStatementRepository } from "./adapters/out/persistence/drizzle-commission.repository";
import {
	DrizzlePartnerApplicationRepository,
	DrizzlePartnerRepository,
} from "./adapters/out/persistence/drizzle-partner.repository";
import {
	DrizzlePartnerInstitutionAssignmentRepository,
	DrizzlePayoutLedgerRepository,
} from "./adapters/out/persistence/drizzle-payout.repository";
import type { AuditSink } from "./core/ports/out/audit-sink.port";
import type { PartnerEventPublisher } from "./core/ports/out/partner-event-publisher.port";
import type { Clock, IdGenerator } from "./core/ports/out/partner-gateways.port";
import type {
	AttributionRepository,
	CampaignRepository,
	CommissionStatementRepository,
	PartnerApplicationRepository,
	PartnerInstitutionAssignmentRepository,
	PartnerRepository,
	PayoutLedgerRepository,
} from "./core/ports/out/partner-repositories.port";
import {
	AttributionService,
	CampaignService,
	CommissionService,
	ExportService,
	InstitutionAssignmentService,
	PartnerApplicationService,
	PartnerQueryService,
	PayoutService,
} from "./core/services";

/**
 * The full set of outbound adapters the partner engine (PRD-046) is wired
 * against. Swappable as a unit — production wiring builds this from Drizzle
 * repositories over the shared Postgres database; tests build it from
 * in-memory fakes (see `test/support/`).
 */
export interface PartnerAdapters {
	readonly partners: PartnerRepository;
	readonly applications: PartnerApplicationRepository;
	readonly campaigns: CampaignRepository;
	readonly attributions: AttributionRepository;
	readonly statements: CommissionStatementRepository;
	readonly payouts: PayoutLedgerRepository;
	readonly assignments: PartnerInstitutionAssignmentRepository;
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: PartnerEventPublisher;
	readonly audit: AuditSink;
}

/** The constructed application services, ready to be handed to HTTP routes. */
export interface PartnerContainer {
	readonly partnerApplicationService: PartnerApplicationService;
	readonly campaignService: CampaignService;
	readonly attributionService: AttributionService;
	readonly commissionService: CommissionService;
	readonly payoutService: PayoutService;
	readonly institutionAssignmentService: InstitutionAssignmentService;
	readonly exportService: ExportService;
	readonly partnerQueryService: PartnerQueryService;
}

/** Build the application services from a set of outbound adapters (the composition step). */
export function buildContainer(adapters: PartnerAdapters): PartnerContainer {
	return {
		partnerApplicationService: new PartnerApplicationService({
			applications: adapters.applications,
			partners: adapters.partners,
			clock: adapters.clock,
			ids: adapters.ids,
			events: adapters.events,
			audit: adapters.audit,
		}),
		campaignService: new CampaignService({
			campaigns: adapters.campaigns,
			partners: adapters.partners,
			clock: adapters.clock,
			ids: adapters.ids,
		}),
		attributionService: new AttributionService({
			attributions: adapters.attributions,
			campaigns: adapters.campaigns,
			partners: adapters.partners,
			clock: adapters.clock,
			ids: adapters.ids,
			events: adapters.events,
		}),
		commissionService: new CommissionService({
			statements: adapters.statements,
			attributions: adapters.attributions,
			partners: adapters.partners,
			payouts: adapters.payouts,
			clock: adapters.clock,
			ids: adapters.ids,
			events: adapters.events,
		}),
		payoutService: new PayoutService({
			payouts: adapters.payouts,
			clock: adapters.clock,
			events: adapters.events,
			audit: adapters.audit,
		}),
		institutionAssignmentService: new InstitutionAssignmentService({
			assignments: adapters.assignments,
			partners: adapters.partners,
			clock: adapters.clock,
			ids: adapters.ids,
			audit: adapters.audit,
		}),
		exportService: new ExportService({
			attributions: adapters.attributions,
			statements: adapters.statements,
			payouts: adapters.payouts,
		}),
		partnerQueryService: new PartnerQueryService({ partners: adapters.partners }),
	};
}

/** Production outbound adapters — Drizzle repositories over the shared Postgres database. */
function buildProductionAdapters(): PartnerAdapters {
	const clock: Clock = { now: () => new Date() };
	const ids: IdGenerator = { uuid: () => randomUUID() };

	return {
		partners: new DrizzlePartnerRepository(),
		applications: new DrizzlePartnerApplicationRepository(),
		campaigns: new DrizzleCampaignRepository(),
		attributions: new DrizzleAttributionRepository(),
		statements: new DrizzleCommissionStatementRepository(),
		payouts: new DrizzlePayoutLedgerRepository(),
		assignments: new DrizzlePartnerInstitutionAssignmentRepository(),
		clock,
		ids,
		events: new ContractPartnerEventPublisher(),
		audit: createNoopAuditSink(),
	};
}

/** Composition root — the only place `core` is wired to production `adapters`. */
export const container: PartnerContainer = buildContainer(buildProductionAdapters());
