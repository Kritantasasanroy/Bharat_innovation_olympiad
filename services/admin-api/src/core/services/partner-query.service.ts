import type { Partner } from "../domain/partner-models";
import { NotFoundError } from "../errors";
import type { PartnerRepository } from "../ports/out/partner-repositories.port";

export interface PartnerQueryServiceDeps {
	readonly partners: PartnerRepository;
}

/** Simple partner read (used by routes that need to render partner context). */
export class PartnerQueryService {
	constructor(private readonly deps: PartnerQueryServiceDeps) {}

	async get(partnerId: string): Promise<Partner> {
		const partner = await this.deps.partners.findById(partnerId);
		if (!partner) throw new NotFoundError("Partner", partnerId);
		return partner;
	}
}
