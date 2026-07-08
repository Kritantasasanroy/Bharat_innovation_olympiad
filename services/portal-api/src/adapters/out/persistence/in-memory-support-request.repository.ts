import type {
	SupportRequest,
	SupportRequestInput,
	SupportRequestRepository,
} from "../../../core/ports/out/index.ts";

/**
 * In-process {@link SupportRequestRepository}.
 *
 * Placeholder until a durable store is wired in — same spirit as admin-api's
 * `NoopAuditSink`. Fine for a single-instance deployment; a multi-instance
 * portal-api deployment (or a restart) needs this swapped for a real store
 * behind the same port before it can be trusted as source of truth.
 */
export class InMemorySupportRequestRepository implements SupportRequestRepository {
	readonly #byPartner = new Map<string, SupportRequest[]>();
	#sequence = 0;

	create(partnerId: string, input: SupportRequestInput): Promise<SupportRequest> {
		this.#sequence += 1;
		const record: SupportRequest = {
			id: `sr_${this.#sequence}`,
			partnerId,
			category: input.category,
			subject: input.subject,
			message: input.message,
			status: "OPEN",
			createdAt: new Date().toISOString(),
		};
		const existing = this.#byPartner.get(partnerId) ?? [];
		existing.push(record);
		this.#byPartner.set(partnerId, existing);
		return Promise.resolve(record);
	}

	listByPartner(partnerId: string): Promise<SupportRequest[]> {
		return Promise.resolve([...(this.#byPartner.get(partnerId) ?? [])]);
	}
}
