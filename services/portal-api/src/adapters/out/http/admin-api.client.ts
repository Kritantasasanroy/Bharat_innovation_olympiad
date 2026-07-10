import { NotFoundError, ProviderError } from "../../../core/errors";
import type {
	AdminApiClient,
	Campaign,
	CampaignInput,
	CampaignUpdateInput,
	Partner,
	PartnerApplication,
	PartnerApplicationInput,
	PartnerFunnel,
	Statement,
	StatementRequestInput,
} from "../../../core/ports/out/index.ts";

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
	readonly #fetchImpl: typeof fetch;

	constructor(baseUrl: string, fetchImpl: typeof fetch = fetch) {
		this.#baseUrl = baseUrl.replace(/\/+$/, "");
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

	getFunnel(partnerId: string, token: string): Promise<PartnerFunnel> {
		return this.#request<PartnerFunnel>(
			"GET",
			`/partners/${encodeURIComponent(partnerId)}/funnel`,
			token,
		);
	}

	createCampaign(partnerId: string, input: CampaignInput, token: string): Promise<Campaign> {
		return this.#request<Campaign>(
			"POST",
			`/partners/${encodeURIComponent(partnerId)}/campaigns`,
			token,
			input,
		);
	}

	updateCampaign(
		partnerId: string,
		campaignId: string,
		input: CampaignUpdateInput,
		token: string,
	): Promise<Campaign> {
		return this.#request<Campaign>(
			"PATCH",
			`/partners/${encodeURIComponent(partnerId)}/campaigns/${encodeURIComponent(campaignId)}`,
			token,
			input,
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

	async #request<T>(method: string, path: string, token: string, body?: unknown): Promise<T> {
		let response: Response;
		try {
			response = await this.#fetchImpl(`${this.#baseUrl}${path}`, {
				method,
				headers: {
					"content-type": "application/json",
					...(token ? { authorization: `Bearer ${token}` } : {}),
				},
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
			});
		} catch (cause) {
			throw new ProviderError("admin-api", cause instanceof Error ? cause : undefined);
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
