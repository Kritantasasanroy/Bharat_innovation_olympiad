import { CampaignStatus, PartnerStatus } from "../domain/partner-enums";
import type { Campaign } from "../domain/partner-models";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import type { CreateCampaignInput, UpdateCampaignInput } from "../ports/in/partner.port";
import type { Clock, IdGenerator } from "../ports/out/partner-gateways.port";
import type { CampaignRepository, PartnerRepository } from "../ports/out/partner-repositories.port";

const MAX_TOKEN_GENERATION_ATTEMPTS = 5;

export interface CampaignServiceDeps {
	readonly campaigns: CampaignRepository;
	readonly partners: PartnerRepository;
	readonly clock: Clock;
	readonly ids: IdGenerator;
}

/**
 * Campaign (referral link + coupon) generation — approved-partner self-service
 * (PRD-046). An unapproved partner cannot generate campaigns.
 */
export class CampaignService {
	constructor(private readonly deps: CampaignServiceDeps) {}

	/**
	 * Resolve a shared referral code (the `?ref=` a student carries in from a
	 * partner's link) to its campaign. Only ACTIVE campaigns resolve, so a
	 * deactivated link simply stops attributing rather than breaking signup.
	 */
	async getByReferralCode(referralCode: string): Promise<Campaign> {
		if (!referralCode || referralCode.trim().length === 0) {
			throw new ValidationError("Validation failed", [
				{ field: "referralCode", message: "referralCode is required" },
			]);
		}
		const campaign = await this.deps.campaigns.findByReferralCode(referralCode.trim());
		if (!campaign) throw new NotFoundError("Campaign", referralCode);
		if (campaign.status !== CampaignStatus.ACTIVE) {
			throw new ConflictError(`Campaign ${campaign.id} is not active`, "CAMPAIGN_INACTIVE");
		}
		return campaign;
	}

	async create(input: CreateCampaignInput): Promise<Campaign> {
		if (!input.name || input.name.trim().length === 0) {
			throw new ValidationError("Validation failed", [
				{ field: "name", message: "name is required" },
			]);
		}

		const partner = await this.deps.partners.findById(input.partnerId);
		if (!partner) throw new NotFoundError("Partner", input.partnerId);
		if (partner.status !== PartnerStatus.APPROVED) {
			throw new ForbiddenError(
				`Partner ${input.partnerId} is not approved and cannot generate campaigns`,
				"PARTNER_NOT_APPROVED",
			);
		}

		const { linkToken, referralCode } = await this.generateUniqueTokens();
		return this.deps.campaigns.create({
			id: this.deps.ids.uuid(),
			partnerId: input.partnerId,
			name: input.name,
			linkToken,
			referralCode,
			caps: input.caps ?? null,
			createdAt: this.deps.clock.now(),
		});
	}

	async update(input: UpdateCampaignInput): Promise<Campaign> {
		const campaign = await this.deps.campaigns.findById(input.campaignId);
		if (!campaign || campaign.partnerId !== input.partnerId) {
			throw new NotFoundError("Campaign", input.campaignId);
		}

		if (input.name !== undefined || input.caps !== undefined) {
			const patch: { name?: string; caps?: Campaign["caps"] } = {};
			if (input.name !== undefined) patch.name = input.name;
			if (input.caps !== undefined) patch.caps = input.caps;
			const updated = await this.deps.campaigns.update(input.campaignId, patch);
			if (!updated) throw new NotFoundError("Campaign", input.campaignId);
		}

		// `deactivate` is a two-way switch: true pauses the campaign, false
		// resumes it. (Previously only the pause direction was honoured, so a
		// paused referral link could never be brought back.)
		if (input.deactivate !== undefined) {
			const nextStatus = input.deactivate ? CampaignStatus.DEACTIVATED : CampaignStatus.ACTIVE;
			const switched = await this.deps.campaigns.setStatus(input.campaignId, nextStatus);
			if (!switched) throw new NotFoundError("Campaign", input.campaignId);
			return switched;
		}

		const result = await this.deps.campaigns.findById(input.campaignId);
		if (!result) throw new NotFoundError("Campaign", input.campaignId);
		return result;
	}

	/** Every campaign belonging to a partner (referral code, link token, status). */
	async listByPartner(partnerId: string): Promise<readonly Campaign[]> {
		const partner = await this.deps.partners.findById(partnerId);
		if (!partner) throw new NotFoundError("Partner", partnerId);
		return this.deps.campaigns.findByPartnerId(partnerId);
	}

	private async generateUniqueTokens(): Promise<{ linkToken: string; referralCode: string }> {
		for (let attempt = 0; attempt < MAX_TOKEN_GENERATION_ATTEMPTS; attempt += 1) {
			const linkToken = `lnk_${this.deps.ids.uuid()}`;
			const referralCode = `ref_${this.deps.ids.uuid()}`;
			if (await this.deps.campaigns.isUnique(linkToken, referralCode)) {
				return { linkToken, referralCode };
			}
		}
		throw new ConflictError(
			"Could not generate a unique campaign link/code",
			"TOKEN_GENERATION_FAILED",
		);
	}
}
