import { NotFoundError, ProviderError } from "../../../core/errors";
import type {
	AdminApiCampaignRow,
	AdminApiClient,
	AssignedInstitution,
	Campaign,
	CampaignInput,
	CampaignUpdateInput,
	Partner,
	PartnerApplication,
	PartnerApplicationInput,
	PartnerFunnel,
	Payout,
	Statement,
	StatementRequestInput,
} from "../../../core/ports/out/index.ts";

/**
 * Render answers 502/503/504 while a sleeping free-tier service cold-starts.
 * A measured cold start is ~33s, so the budget has to clear that — a partner
 * staring at a spinner is a better outcome than a dashboard that errors out
 * because we gave up at 20s.
 */
const RETRY_STATUSES = new Set([502, 503, 504]);
const RETRY_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 12_000, 15_000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The raw funnel admin-api returns: totals + counts keyed by campaign id only. */
interface AdminApiFunnel {
	readonly partnerId: string;
	readonly signups: number;
	readonly registrations: number;
	readonly paid: number;
	readonly byCampaign: readonly {
		readonly campaignId: string;
		readonly signups: number;
		readonly registrations: number;
		readonly paid: number;
	}[];
}

/**
 * HTTP adapter to `admin-api`'s partner engine (PRD-046). See the docblock on
 * {@link AdminApiClient} (`core/ports/out/admin-api-client.port.ts`) for the
 * full list of assumptions made about the (not-yet-visible) admin-api
 * contract — this class is the one place those assumptions turn into actual
 * URLs, so reconciling against the real admin-api later should mean editing
 * only this file.
 */
export class HttpAdminApiClient implements AdminApiClient {
	readonly #baseUrl: string;
	readonly #studentAppUrl: string;
	readonly #schoolAppUrl: string;
	readonly #fetchImpl: typeof fetch;

	constructor(
		baseUrl: string,
		studentAppUrl = "http://localhost:3000",
		fetchImpl: typeof fetch = fetch,
		schoolAppUrl = "http://localhost:3500",
	) {
		this.#baseUrl = baseUrl.replace(/\/+$/, "");
		this.#studentAppUrl = studentAppUrl.replace(/\/+$/, "");
		this.#schoolAppUrl = schoolAppUrl.replace(/\/+$/, "");
		this.#fetchImpl = fetchImpl;
	}

	createPartnerApplication(
		partnerId: string,
		input: PartnerApplicationInput,
		token: string,
	): Promise<PartnerApplication> {
		return this.#request<PartnerApplication>("POST", "/partner-applications", token, {
			partnerId,
			...input,
		});
	}

	async getPartnerApplication(
		partnerId: string,
		token: string,
	): Promise<PartnerApplication | null> {
		try {
			return await this.#request<PartnerApplication>(
				"GET",
				`/partner-applications/${encodeURIComponent(partnerId)}`,
				token,
			);
		} catch (error) {
			if (error instanceof NotFoundError) return null;
			throw error;
		}
	}

	/** `GET /partners/:id` — the Partner aggregate whose `status` gates the dashboard. */
	async getPartner(partnerId: string, token: string): Promise<Partner | null> {
		try {
			return await this.#request<Partner>(
				"GET",
				`/partners/${encodeURIComponent(partnerId)}`,
				token,
			);
		} catch (error) {
			if (error instanceof NotFoundError) return null;
			throw error;
		}
	}

	/**
	 * admin-api splits what the portal needs across two reads: `/funnel` gives
	 * the per-campaign counts (keyed only by campaign id), and `/campaigns` gives
	 * each campaign's name, referral code, and status. This merges them and
	 * derives the shareable `?ref=` link, so the portal gets one coherent DTO.
	 * A campaign with no attribution yet still appears, at zero.
	 */
	async getFunnel(partnerId: string, token: string): Promise<PartnerFunnel> {
		const [funnel, rows] = await Promise.all([
			this.#request<AdminApiFunnel>(
				"GET",
				`/partners/${encodeURIComponent(partnerId)}/funnel`,
				token,
			),
			this.#listCampaigns(partnerId, token),
		]);

		const countsById = new Map(funnel.byCampaign.map((c) => [c.campaignId, c]));
		const campaigns = rows.map((row) => {
			const counts = countsById.get(row.id);
			return {
				campaignId: row.id,
				name: row.name,
				code: row.referralCode,
				shareUrl: this.#shareUrl(row.referralCode),
				schoolShareUrl: this.#schoolShareUrl(row.referralCode),
				status: row.status,
				signups: counts?.signups ?? 0,
				registrations: counts?.registrations ?? 0,
				paid: counts?.paid ?? 0,
			};
		});

		return {
			partnerId: funnel.partnerId,
			totals: {
				signups: funnel.signups,
				registrations: funnel.registrations,
				paid: funnel.paid,
			},
			campaigns,
			generatedAt: new Date().toISOString(),
		};
	}

	getInstitutions(partnerId: string, token: string): Promise<readonly AssignedInstitution[]> {
		return this.#request<readonly AssignedInstitution[]>(
			"GET",
			`/partners/${encodeURIComponent(partnerId)}/institutions`,
			token,
		);
	}

	#listCampaigns(partnerId: string, token: string): Promise<readonly AdminApiCampaignRow[]> {
		return this.#request<readonly AdminApiCampaignRow[]>(
			"GET",
			`/partners/${encodeURIComponent(partnerId)}/campaigns`,
			token,
		);
	}

	/** The link a partner shares; the student app captures `?ref=` on first touch. */
	#shareUrl(referralCode: string): string {
		return `${this.#studentAppUrl}/?ref=${encodeURIComponent(referralCode)}`;
	}

	/** The school-onboarding link; the school portal's activate page captures `?ref=`. */
	#schoolShareUrl(referralCode: string): string {
		return `${this.#schoolAppUrl}/activate?ref=${encodeURIComponent(referralCode)}`;
	}

	createCampaign(partnerId: string, input: CampaignInput, token: string): Promise<Campaign> {
		return this.#request<Campaign>(
			"POST",
			`/partners/${encodeURIComponent(partnerId)}/campaigns`,
			token,
			input,
		);
	}

	/**
	 * admin-api's update takes a `deactivate` boolean, not a status string —
	 * translate here (this adapter is the one place such assumptions become
	 * real URLs/bodies).
	 */
	updateCampaign(
		partnerId: string,
		campaignId: string,
		input: CampaignUpdateInput,
		token: string,
	): Promise<Campaign> {
		const body: { name?: string; deactivate?: boolean } = {};
		if (input.name !== undefined) body.name = input.name;
		if (input.status !== undefined) body.deactivate = input.status === "DEACTIVATED";

		return this.#request<Campaign>(
			"PATCH",
			`/partners/${encodeURIComponent(partnerId)}/campaigns/${encodeURIComponent(campaignId)}`,
			token,
			body,
		);
	}

	requestStatement(
		partnerId: string,
		input: StatementRequestInput,
		token: string,
	): Promise<Statement> {
		return this.#request<Statement>(
			"POST",
			`/partners/${encodeURIComponent(partnerId)}/statements`,
			token,
			input,
		);
	}

	listStatements(partnerId: string, token: string): Promise<Statement[]> {
		return this.#request<Statement[]>(
			"GET",
			`/partners/${encodeURIComponent(partnerId)}/statements`,
			token,
		);
	}

	listPayouts(partnerId: string, token: string): Promise<Payout[]> {
		return this.#request<Payout[]>(
			"GET",
			`/partners/${encodeURIComponent(partnerId)}/payouts`,
			token,
		);
	}

	/** One attempt; `null` when the socket itself failed. */
	async #attempt(
		method: string,
		path: string,
		token: string,
		body?: unknown,
	): Promise<Response | null> {
		try {
			return await this.#fetchImpl(`${this.#baseUrl}${path}`, {
				method,
				headers: {
					"content-type": "application/json",
					...(token ? { authorization: `Bearer ${token}` } : {}),
				},
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
			});
		} catch {
			return null;
		}
	}

	async #request<T>(method: string, path: string, token: string, body?: unknown): Promise<T> {
		let response: Response | null = null;

		// admin-api sleeps on Render's free tier; while it cold-starts, Render's
		// edge answers 502/503/504. Those are transient, so retry with backoff
		// rather than surfacing a dead dashboard to the partner.
		for (let i = 0; i <= RETRY_BACKOFF_MS.length; i += 1) {
			response = await this.#attempt(method, path, token, body);

			const coldStart = response === null || RETRY_STATUSES.has(response.status);
			if (!coldStart) break;

			const delay = RETRY_BACKOFF_MS[i];
			if (delay === undefined) break; // retries exhausted
			await sleep(delay);
		}

		if (!response) {
			throw new ProviderError("admin-api", new Error("unreachable"));
		}

		if (response.status === 404) {
			throw new NotFoundError("admin-api resource", path);
		}
		if (!response.ok) {
			throw new ProviderError(
				"admin-api",
				new Error(`responded ${response.status} for ${method} ${path}`),
			);
		}

		const json = (await response.json()) as unknown;
		if (json && typeof json === "object" && "success" in json) {
			const envelope = json as { success: boolean; data?: T; error?: { message?: string } };
			if (!envelope.success) {
				throw new ProviderError(
					"admin-api",
					new Error(envelope.error?.message ?? "returned an error envelope"),
				);
			}
			return envelope.data as T;
		}
		return json as T;
	}
}
