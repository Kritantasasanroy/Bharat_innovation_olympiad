import { randomUUID } from "node:crypto";
import { createNoopAuditSink } from "./adapters/out/audit/noop-audit-sink";
import { AesBankDetailsCrypto } from "./adapters/out/crypto/bank-details-crypto.adapter";
import { ContractPartnerEventPublisher } from "./adapters/out/events/partner-event-publisher";
import { DrizzleBankDetailsRepository } from "./adapters/out/persistence/drizzle-bank-details.repository";
import {
	DrizzleAttributionRepository,
	DrizzleCampaignRepository,
} from "./adapters/out/persistence/drizzle-campaign.repository";
import {
	DrizzlePartnerApplicationRepository,
	DrizzlePartnerRepository,
} from "./adapters/out/persistence/drizzle-partner.repository";
import {
	DrizzlePartnerInstitutionAssignmentRepository,
	DrizzlePayoutRepository,
} from "./adapters/out/persistence/drizzle-payout.repository";
import type { AuditSink } from "./core/ports/out/audit-sink.port";
import type { BankDetailsCrypto } from "./core/ports/out/bank-details-crypto.port";
import type { PartnerEventPublisher } from "./core/ports/out/partner-event-publisher.port";
import type { Clock, IdGenerator } from "./core/ports/out/partner-gateways.port";
import type {
	AttributionRepository,
	BankDetailsRepository,
	CampaignRepository,
	PartnerApplicationRepository,
	PartnerInstitutionAssignmentRepository,
	PartnerRepository,
	PayoutRepository,
} from "./core/ports/out/partner-repositories.port";
import {
	AttributionService,
	BankDetailsService,
	CampaignService,
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
	readonly payouts: PayoutRepository;
	readonly bankDetails: BankDetailsRepository;
	readonly bankDetailsCrypto: BankDetailsCrypto;
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
	readonly payoutService: PayoutService;
	readonly bankDetailsService: BankDetailsService;
	readonly institutionAssignmentService: InstitutionAssignmentService;
	readonly exportService: ExportService;
	readonly partnerQueryService: PartnerQueryService;
	/** Exposed directly (not just wrapped inside a service) for the one cross-cutting
	 *  audit call an HTTP route makes itself: recording who revealed a partner's
	 *  bank details, and when. */
	readonly audit: AuditSink;
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
		payoutService: new PayoutService({
			payouts: adapters.payouts,
			partners: adapters.partners,
			clock: adapters.clock,
			ids: adapters.ids,
			events: adapters.events,
			audit: adapters.audit,
		}),
		bankDetailsService: new BankDetailsService({
			bankDetails: adapters.bankDetails,
			partners: adapters.partners,
			crypto: adapters.bankDetailsCrypto,
			clock: adapters.clock,
			ids: adapters.ids,
			events: adapters.events,
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
			payouts: adapters.payouts,
		}),
		partnerQueryService: new PartnerQueryService({ partners: adapters.partners }),
		audit: adapters.audit,
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
		payouts: new DrizzlePayoutRepository(),
		bankDetails: new DrizzleBankDetailsRepository(),
		bankDetailsCrypto: new AesBankDetailsCrypto(),
		assignments: new DrizzlePartnerInstitutionAssignmentRepository(),
		clock,
		ids,
		events: new ContractPartnerEventPublisher(),
		audit: createNoopAuditSink(),
	};
}

/** Composition root — the only place `core` is wired to production `adapters`. */
export const container: PartnerContainer = buildContainer(buildProductionAdapters());
