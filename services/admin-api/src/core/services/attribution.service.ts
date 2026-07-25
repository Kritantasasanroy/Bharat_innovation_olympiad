import { AttributionRule, CampaignStatus } from "../domain/partner-enums";
import type { AttributionRecord, CampaignFunnel, PartnerFunnel } from "../domain/partner-models";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import type { CapturePaidConversionInput, CaptureSignupInput } from "../ports/in/partner.port";
import type { PartnerEventPublisher } from "../ports/out/partner-event-publisher.port";
import type { Clock, IdGenerator } from "../ports/out/partner-gateways.port";
import type {
	AttributionRepository,
	CampaignRepository,
	PartnerRepository,
} from "../ports/out/partner-repositories.port";

export interface AttributionServiceDeps {
	readonly attributions: AttributionRepository;
	readonly campaigns: CampaignRepository;
	readonly partners: PartnerRepository;
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: PartnerEventPublisher;
}

/**
 * Self-contained attribution capture chain (PRD-046).
 *
 * PRD-020 (landing token issuance), PRD-010 (signup persistence) and PRD-023
 * (paid-conversion event) do not exist as built services anywhere in this
 * codebase, so this service simulates the chain end to end:
 *
 *  1. {@link captureSignup} — "a student signs up with referral code X"
 *     (PRD-010/020 stand-in). Persists an OPEN attribution touch. Only the
 *     *first* signup touch for a student is kept (subsequent calls before
 *     conversion are no-ops) — this is what makes "first-touch wins" possible.
 *  2. {@link capturePaidConversion} — "a paid conversion" (PRD-023 stand-in).
 *     Closes/credits the attribution. If the student already has an OPEN
 *     touch from a *different* campaign than the one the coupon was applied
 *     against, the link (first touch) wins over the coupon (decision:
 *     first-touch tie-break). Idempotent per student+registration: a repeat
 *     call for the same pair never creates a second credit.
 */
export class AttributionService {
	constructor(private readonly deps: AttributionServiceDeps) {}

	async captureSignup(input: CaptureSignupInput): Promise<AttributionRecord> {
		if (!input.studentId) {
			throw new ValidationError("Validation failed", [
				{ field: "studentId", message: "studentId is required" },
			]);
		}

		const campaign = await this.deps.campaigns.findById(input.campaignId);
		if (!campaign) throw new NotFoundError("Campaign", input.campaignId);
		if (campaign.status !== CampaignStatus.ACTIVE) {
			throw new ConflictError(`Campaign ${input.campaignId} is not active`, "CAMPAIGN_INACTIVE");
		}

		// First touch wins: if this student already has an open (uncredited)
		// touch, keep it — do not let a later signup call overwrite it.
		const existing = await this.deps.attributions.findOpenByStudent(input.studentId);
		if (existing) return existing;

		return this.deps.attributions.createOpenTouch({
			id: this.deps.ids.uuid(),
			partnerId: campaign.partnerId,
			campaignId: campaign.id,
			studentId: input.studentId,
			createdAt: this.deps.clock.now(),
		});
	}

	async capturePaidConversion(input: CapturePaidConversionInput): Promise<AttributionRecord> {
		if (!input.studentId || !input.registrationId) {
			throw new ValidationError("Validation failed", [
				{ field: "studentId/registrationId", message: "studentId and registrationId are required" },
			]);
		}
		if (!Number.isFinite(input.amountPaise) || input.amountPaise < 0) {
			throw new ValidationError("Validation failed", [
				{ field: "amountPaise", message: "amountPaise must be a non-negative number" },
			]);
		}

		// Idempotency: a duplicate paid-conversion event for the same
		// student+registration produces NO second credit.
		const already = await this.deps.attributions.findCreditedByStudentAndRegistration(
			input.studentId,
			input.registrationId,
		);
		if (already) return already;

		const checkoutCampaign = await this.deps.campaigns.findById(input.campaignId);
		if (!checkoutCampaign) throw new NotFoundError("Campaign", input.campaignId);

		const openTouch = await this.deps.attributions.findOpenByStudent(input.studentId);

		let existingId: string | null = null;
		let partnerId: string;
		let campaignId: string;
		let ruleApplied: AttributionRule;

		if (openTouch && openTouch.campaignId !== checkoutCampaign.id) {
			// Conflict: a first-touch referral link exists for a DIFFERENT
			// campaign than the one whose coupon was applied at checkout.
			// Decision: first touch wins.
			existingId = openTouch.id;
			partnerId = openTouch.partnerId;
			campaignId = openTouch.campaignId;
			ruleApplied = AttributionRule.LINK_FIRST_TOUCH;
		} else if (openTouch) {
			// Same campaign captured the signup touch and the checkout coupon.
			existingId = openTouch.id;
			partnerId = openTouch.partnerId;
			campaignId = openTouch.campaignId;
			ruleApplied = AttributionRule.LINK_ONLY;
		} else {
			// No prior signup touch at all — the checkout-time coupon governs.
			existingId = null;
			partnerId = checkoutCampaign.partnerId;
			campaignId = checkoutCampaign.id;
			ruleApplied = AttributionRule.COUPON_ONLY;
		}

		const now = this.deps.clock.now();
		const credited = await this.deps.attributions.credit({
			existingId,
			newId: this.deps.ids.uuid(),
			partnerId,
			campaignId,
			studentId: input.studentId,
			registrationId: input.registrationId,
			ruleApplied,
			amountPaise: input.amountPaise,
			convertedAt: now,
		});

		await this.deps.events.publish({
			type: "AttributionCredited",
			attributionId: credited.id,
			partnerId: credited.partnerId,
			campaignId: credited.campaignId,
			studentId: credited.studentId,
			registrationId: input.registrationId,
			ruleApplied,
			amountPaise: input.amountPaise,
			convertedAt: now,
		});

		return credited;
	}

	async getFunnel(partnerId: string): Promise<PartnerFunnel> {
		const partner = await this.deps.partners.findById(partnerId);
		if (!partner) throw new NotFoundError("Partner", partnerId);

		const records = await this.deps.attributions.findAllByPartnerId(partnerId);
		const campaigns = await this.deps.campaigns.findByPartnerId(partnerId);
		const nameByCampaignId = new Map(campaigns.map((c) => [c.id, c.name]));

		const byCampaignId = new Map<string, AttributionRecord[]>();
		for (const record of records) {
			const bucket = byCampaignId.get(record.campaignId) ?? [];
			bucket.push(record);
			byCampaignId.set(record.campaignId, bucket);
		}

		const byCampaign: CampaignFunnel[] = [];
		for (const [campaignId, campaignRecords] of byCampaignId) {
			byCampaign.push(
				summarizeCampaign(
					campaignId,
					nameByCampaignId.get(campaignId) ?? campaignId,
					campaignRecords,
				),
			);
		}
		byCampaign.sort((a, b) => a.campaignId.localeCompare(b.campaignId));

		return {
			partnerId,
			signups: byCampaign.reduce((sum, c) => sum + c.signups, 0),
			registrations: byCampaign.reduce((sum, c) => sum + c.registrations, 0),
			paid: byCampaign.reduce((sum, c) => sum + c.paid, 0),
			byCampaign,
		};
	}
}

/**
 * Per-campaign funnel counts.
 *
 * "signups" counts records that ever had a signup-time touch (an OPEN record,
 * or a credited one whose rule shows a prior link touch existed). A record
 * credited purely off a checkout coupon with no prior touch (`COUPON_ONLY`)
 * is not counted as a signup for this campaign — there was none.
 *
 * "registrations" and "paid" are numerically identical here: PRD-010
 * (registration persistence) and PRD-023 (paid-conversion event) are not
 * built as separate services, so `capturePaidConversion` intentionally
 * simulates both stages as a single event (a registration in this platform
 * IS the paid entitlement — see `RegistrationConfirmed` in the commerce event
 * family). Both are reported so a future split of the two stages is additive,
 * not breaking.
 */
function summarizeCampaign(
	campaignId: string,
	campaignName: string,
	records: readonly AttributionRecord[],
): CampaignFunnel {
	let signups = 0;
	let paid = 0;
	for (const record of records) {
		if (
			record.status === "OPEN" ||
			record.ruleApplied === AttributionRule.LINK_FIRST_TOUCH ||
			record.ruleApplied === AttributionRule.LINK_ONLY
		) {
			signups += 1;
		}
		if (record.status === "CREDITED") {
			paid += 1;
		}
	}
	return { campaignId, campaignName, signups, registrations: paid, paid };
}
