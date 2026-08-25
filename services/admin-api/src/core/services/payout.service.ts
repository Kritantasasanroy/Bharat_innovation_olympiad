import { PayoutStatus } from "../domain/partner-enums";
import type { Payout } from "../domain/partner-models";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import type { MarkPayoutPaidInput, TriggerPayoutInput } from "../ports/in/partner.port";
import type { AuditSink } from "../ports/out/audit-sink.port";
import type { PartnerEventPublisher } from "../ports/out/partner-event-publisher.port";
import type { Clock, IdGenerator } from "../ports/out/partner-gateways.port";
import type { PartnerRepository, PayoutRepository } from "../ports/out/partner-repositories.port";

export interface PayoutServiceDeps {
	readonly payouts: PayoutRepository;
	readonly partners: PartnerRepository;
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: PartnerEventPublisher;
	readonly audit: AuditSink;
}

/**
 * Admin-triggered payouts: no commission rate, no statement — admin decides
 * an amount and triggers it directly against a partner (TRIGGERED), then
 * marks it paid once the money has actually gone out (PAID). Terminal at
 * PAID; there is no path back.
 */
export class PayoutService {
	constructor(private readonly deps: PayoutServiceDeps) {}

	async trigger(input: TriggerPayoutInput): Promise<Payout> {
		if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
			throw new ValidationError("Validation failed", [
				{ field: "amountPaise", message: "amountPaise must be a positive integer" },
			]);
		}
		if (!input.triggeredBy) {
			throw new ValidationError("Validation failed", [
				{ field: "triggeredBy", message: "triggeredBy is required" },
			]);
		}

		const partner = await this.deps.partners.findById(input.partnerId);
		if (!partner) throw new NotFoundError("Partner", input.partnerId);

		const now = this.deps.clock.now();
		const payout = await this.deps.payouts.create({
			id: this.deps.ids.uuid(),
			partnerId: input.partnerId,
			amountPaise: input.amountPaise,
			note: input.note?.trim() || null,
			triggeredBy: input.triggeredBy,
			triggeredAt: now,
		});

		await this.deps.events.publish({
			type: "PayoutTriggered",
			payoutId: payout.id,
			partnerId: payout.partnerId,
			amountPaise: payout.amountPaise,
			note: payout.note,
			triggeredBy: payout.triggeredBy,
			triggeredAt: payout.triggeredAt,
		});

		await this.deps.audit.record({
			action: "payout.triggered",
			actor: { id: input.triggeredBy, type: "user" },
			resource: { type: "payout", id: payout.id },
			outcome: "success",
			occurredAt: now.toISOString(),
			metadata: { partnerId: payout.partnerId, amountPaise: payout.amountPaise },
		});

		return payout;
	}

	async markPaid(input: MarkPayoutPaidInput): Promise<Payout> {
		if (!input.paidBy) {
			throw new ValidationError("Validation failed", [
				{ field: "paidBy", message: "paidBy is required" },
			]);
		}

		const payout = await this.deps.payouts.findById(input.payoutId);
		if (!payout) throw new NotFoundError("Payout", input.payoutId);
		if (payout.status !== PayoutStatus.TRIGGERED) {
			throw new ConflictError(
				`Payout ${input.payoutId} is already ${payout.status}`,
				"PAYOUT_ALREADY_PAID",
			);
		}

		const now = this.deps.clock.now();
		const updated = await this.deps.payouts.markPaid(input.payoutId, input.paidBy, now);
		if (!updated) throw new NotFoundError("Payout", input.payoutId);

		await this.deps.events.publish({
			type: "PayoutPaid",
			payoutId: updated.id,
			partnerId: updated.partnerId,
			paidBy: input.paidBy,
			paidAt: now,
		});

		await this.deps.audit.record({
			action: "payout.paid",
			actor: { id: input.paidBy, type: "user" },
			resource: { type: "payout", id: updated.id },
			outcome: "success",
			occurredAt: now.toISOString(),
			metadata: { partnerId: updated.partnerId, amountPaise: updated.amountPaise },
		});

		return updated;
	}

	/** Every payout for a partner, newest first. */
	async listForPartner(partnerId: string): Promise<readonly Payout[]> {
		const partner = await this.deps.partners.findById(partnerId);
		if (!partner) throw new NotFoundError("Partner", partnerId);
		const payouts = await this.deps.payouts.findByPartnerId(partnerId);
		return [...payouts].sort((a, b) => b.triggeredAt.getTime() - a.triggeredAt.getTime());
	}
}
