import { PayoutStatus } from "../domain/partner-enums";
import type { PayoutLedgerEntry } from "../domain/partner-models";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import type { UpdatePayoutStatusInput } from "../ports/in/partner.port";
import type { AuditSink } from "../ports/out/audit-sink.port";
import type { PartnerEventPublisher } from "../ports/out/partner-event-publisher.port";
import type { Clock } from "../ports/out/partner-gateways.port";
import type {
	PartnerRepository,
	PayoutLedgerRepository,
} from "../ports/out/partner-repositories.port";

export interface PayoutServiceDeps {
	readonly payouts: PayoutLedgerRepository;
	readonly partners: PartnerRepository;
	readonly clock: Clock;
	readonly events: PartnerEventPublisher;
	readonly audit: AuditSink;
}

/**
 * Payout ledger status transitions (PRD-046): `PENDING -> SIGNED_OFF -> RELEASED`,
 * staff-set via an audited API. A transition to `RELEASED` is BLOCKED unless a
 * finance sign-off field (approver + timestamp) is already set.
 */
export class PayoutService {
	constructor(private readonly deps: PayoutServiceDeps) {}

	async updateStatus(input: UpdatePayoutStatusInput): Promise<PayoutLedgerEntry> {
		if (!input.actor) {
			throw new ValidationError("Validation failed", [
				{ field: "actor", message: "actor is required" },
			]);
		}

		const payout = await this.deps.payouts.findById(input.payoutId);
		if (!payout) throw new NotFoundError("Payout", input.payoutId);

		const now = this.deps.clock.now();
		const previousStatus = payout.status;
		let updated: PayoutLedgerEntry | null;

		if (input.status === "SIGNED_OFF") {
			if (payout.status !== PayoutStatus.PENDING) {
				throw new ConflictError(
					`Payout ${input.payoutId} must be PENDING to sign off (current: ${payout.status})`,
					"INVALID_PAYOUT_TRANSITION",
				);
			}
			if (!input.approver) {
				throw new ValidationError("Validation failed", [
					{ field: "approver", message: "approver is required to sign off a payout" },
				]);
			}
			updated = await this.deps.payouts.update(input.payoutId, {
				status: PayoutStatus.SIGNED_OFF,
				financeSignOffApprover: input.approver,
				financeSignOffAt: now,
				reason: input.reason ?? payout.reason,
			});
		} else {
			// RELEASED — blocked unless finance sign-off (approver + timestamp) is
			// already recorded on the ledger entry.
			if (payout.financeSignOffApprover === null || payout.financeSignOffAt === null) {
				throw new ConflictError(
					`Payout ${input.payoutId} cannot be released before finance sign-off (approver + timestamp) is recorded`,
					"PAYOUT_NOT_SIGNED_OFF",
				);
			}
			if (payout.status !== PayoutStatus.SIGNED_OFF) {
				throw new ConflictError(
					`Payout ${input.payoutId} must be SIGNED_OFF before it can be RELEASED (current: ${payout.status})`,
					"INVALID_PAYOUT_TRANSITION",
				);
			}
			updated = await this.deps.payouts.update(input.payoutId, {
				status: PayoutStatus.RELEASED,
				reason: input.reason ?? payout.reason,
			});
		}

		if (!updated) throw new NotFoundError("Payout", input.payoutId);

		await this.deps.events.publish({
			type: "PayoutStatusChanged",
			payoutId: updated.id,
			partnerId: updated.partnerId,
			statementId: updated.statementId,
			previousStatus,
			newStatus: updated.status,
			changedBy: input.actor,
			changedAt: now,
		});

		await this.deps.audit.record({
			action: `payout.${input.status.toLowerCase()}`,
			actor: { id: input.actor, type: "user" },
			resource: { type: "payout", id: updated.id },
			outcome: "success",
			occurredAt: now.toISOString(),
			metadata: { previousStatus, newStatus: updated.status, partnerId: updated.partnerId },
		});

		return updated;
	}

	/** Every payout ledger entry for a partner, newest statement first. */
	async listForPartner(partnerId: string): Promise<readonly PayoutLedgerEntry[]> {
		const partner = await this.deps.partners.findById(partnerId);
		if (!partner) throw new NotFoundError("Partner", partnerId);
		return this.deps.payouts.findByPartnerId(partnerId);
	}
}
