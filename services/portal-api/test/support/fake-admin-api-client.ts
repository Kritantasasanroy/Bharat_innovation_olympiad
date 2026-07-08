import type {
	AdminApiClient,
	Campaign,
	CampaignInput,
	CampaignUpdateInput,
	PartnerApplication,
	PartnerApplicationInput,
	PartnerFunnel,
	Statement,
	StatementRequestInput,
} from "../../src/core/ports/out/index.ts";

export interface RecordedCall {
	readonly method: string;
	readonly partnerId: string;
	readonly token: string;
}

/**
 * In-memory fake of {@link AdminApiClient}, seeded per-partner-id.
 *
 * Purpose-built for the "no cross-partner leakage" test requirement: every
 * call is recorded with the `partnerId` it was invoked with, so a test can
 * assert portal-api always passed the *token's* `sub` — never a
 * client-supplied id — and that switching tokens changes which partner's
 * seeded data comes back.
 */
export class FakeAdminApiClient implements AdminApiClient {
	readonly calls: RecordedCall[] = [];
	readonly #applications = new Map<string, PartnerApplication>();
	readonly #funnels = new Map<string, PartnerFunnel>();
	readonly #campaigns = new Map<string, Campaign[]>();
	readonly #statements = new Map<string, Statement[]>();

	seedApplication(partnerId: string, application: PartnerApplication): void {
		this.#applications.set(partnerId, application);
	}

	seedFunnel(partnerId: string, funnel: PartnerFunnel): void {
		this.#funnels.set(partnerId, funnel);
	}

	seedStatements(partnerId: string, statements: Statement[]): void {
		this.#statements.set(partnerId, statements);
	}

	createPartnerApplication(
		partnerId: string,
		input: PartnerApplicationInput,
		token: string,
	): Promise<PartnerApplication> {
		this.calls.push({ method: "createPartnerApplication", partnerId, token });
		const application: PartnerApplication = {
			partnerId,
			...input,
			status: "SUBMITTED",
			submittedAt: new Date().toISOString(),
		};
		this.#applications.set(partnerId, application);
		return Promise.resolve(application);
	}

	getPartnerApplication(partnerId: string, token: string): Promise<PartnerApplication | null> {
		this.calls.push({ method: "getPartnerApplication", partnerId, token });
		return Promise.resolve(this.#applications.get(partnerId) ?? null);
	}

	getFunnel(partnerId: string, token: string): Promise<PartnerFunnel> {
		this.calls.push({ method: "getFunnel", partnerId, token });
		const funnel = this.#funnels.get(partnerId);
		if (!funnel) return Promise.reject(new Error(`No seeded funnel for partner ${partnerId}`));
		return Promise.resolve(funnel);
	}

	createCampaign(partnerId: string, input: CampaignInput, token: string): Promise<Campaign> {
		this.calls.push({ method: "createCampaign", partnerId, token });
		const list = this.#campaigns.get(partnerId) ?? [];
		const campaign: Campaign = {
			id: `camp_${partnerId}_${list.length + 1}`,
			partnerId,
			name: input.name,
			code: `${partnerId.toUpperCase()}-${list.length + 1}`,
			shareUrl: `https://portal.bio.example.com/r/${partnerId}-${list.length + 1}`,
			status: "ACTIVE",
			createdAt: new Date().toISOString(),
		};
		list.push(campaign);
		this.#campaigns.set(partnerId, list);
		return Promise.resolve(campaign);
	}

	updateCampaign(
		partnerId: string,
		campaignId: string,
		input: CampaignUpdateInput,
		token: string,
	): Promise<Campaign> {
		this.calls.push({ method: "updateCampaign", partnerId, token });
		const list = this.#campaigns.get(partnerId) ?? [];
		const existing = list.find((campaign) => campaign.id === campaignId);
		if (!existing) {
			return Promise.reject(new Error(`No campaign ${campaignId} for partner ${partnerId}`));
		}
		const updated: Campaign = { ...existing, ...input };
		this.#campaigns.set(
			partnerId,
			list.map((campaign) => (campaign.id === campaignId ? updated : campaign)),
		);
		return Promise.resolve(updated);
	}

	requestStatement(
		partnerId: string,
		input: StatementRequestInput,
		token: string,
	): Promise<Statement> {
		this.calls.push({ method: "requestStatement", partnerId, token });
		const list = this.#statements.get(partnerId) ?? [];
		const statement: Statement = {
			id: `stmt_${partnerId}_${list.length + 1}`,
			partnerId,
			periodStart: input.periodStart,
			periodEnd: input.periodEnd,
			currency: "INR",
			totalCommission: 0,
			payoutStatus: "PENDING",
			financeSignOff: false,
			downloadUrl: null,
			generatedAt: new Date().toISOString(),
		};
		list.push(statement);
		this.#statements.set(partnerId, list);
		return Promise.resolve(statement);
	}

	listStatements(partnerId: string, token: string): Promise<Statement[]> {
		this.calls.push({ method: "listStatements", partnerId, token });
		return Promise.resolve([...(this.#statements.get(partnerId) ?? [])]);
	}
}
