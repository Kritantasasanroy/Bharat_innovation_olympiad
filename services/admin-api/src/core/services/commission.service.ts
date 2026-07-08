import { buildCommissionLineItems, isInPeriod } from "../domain/commission";
import type { CommissionStatement } from "../domain/partner-models";
import { NotFoundError, ValidationError } from "../errors";
import type { GenerateStatementInput } from "../ports/in/partner.port";
import type { PartnerEventPublisher } from "../ports/out/partner-event-publisher.port";
import type { Clock, IdGenerator } from "../ports/out/partner-gateways.port";
import type {
	AttributionRepository,
	CommissionStatementRepository,
	PartnerRepository,
	PayoutLedgerRepository,
} from "../ports/out/partner-repositories.port";

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface CommissionServiceDeps {
	readonly statements: CommissionStatementRepository;
	readonly attributions: AttributionRepository;
	readonly partners: PartnerRepository;
	readonly payouts: PayoutLedgerRepository;
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: PartnerEventPublisher;
}

/**
 * Commission statement generation (PRD-046).
 *
 * A statement is IMMUTABLE once issued: "regenerating" never mutates a prior
 * version — it inserts a brand-new version (never overwritten) and issues a
 * fresh payout ledger entry from it. Version 1 is never touched again.
 */
export class CommissionService {
	constructor(private readonly deps: CommissionServiceDeps) {}

	async generate(input: GenerateStatementInput): Promise<CommissionStatement> {
		if (!PERIOD_PATTERN.test(input.period)) {
			throw new ValidationError("Validation failed", [
				{ field: "period", message: 'period must be in "YYYY-MM" form' },
			]);
		}

		const partner = await this.deps.partners.findById(input.partnerId);
		if (!partner) throw new NotFoundError("Partner", input.partnerId);

		const credited = await this.deps.attributions.findCreditedByPartnerId(input.partnerId);
		const periodAttributions = credited.filter(
			(a) => a.convertedAt !== null && isInPeriod(a.convertedAt, input.period),
		);
		const { lineItems, totalPaise } = buildCommissionLineItems(
			periodAttributions,
			partner.commissionRatePct,
		);

		const nextVersion =
			(await this.deps.statements.latestVersion(input.partnerId, input.period)) + 1;
		const now = this.deps.clock.now();
		const statement = await this.deps.statements.create({
			id: this.deps.ids.uuid(),
			partnerId: input.partnerId,
			period: input.period,
			version: nextVersion,
			lineItems,
			totalPaise,
			issuedAt: now,
		});

		await this.deps.payouts.create({
			id: this.deps.ids.uuid(),
			partnerId: input.partnerId,
			statementId: statement.id,
			amountPaise: totalPaise,
			createdAt: now,
		});

		await this.deps.events.publish({
			type: "CommissionStatementIssued",
			statementId: statement.id,
			partnerId: input.partnerId,
			period: input.period,
			version: nextVersion,
			totalPaise,
			issuedAt: now,
		});

		return statement;
	}

	async list(partnerId: string): Promise<readonly CommissionStatement[]> {
		const partner = await this.deps.partners.findById(partnerId);
		if (!partner) throw new NotFoundError("Partner", partnerId);
		return this.deps.statements.findByPartnerId(partnerId);
	}
}
