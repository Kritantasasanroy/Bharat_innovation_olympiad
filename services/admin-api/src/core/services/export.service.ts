import { toCsv } from "../domain/csv";
import { ValidationError } from "../errors";
import type { ExportKind } from "../ports/in/partner.port";
import type {
	AttributionRepository,
	PayoutRepository,
} from "../ports/out/partner-repositories.port";

export interface ExportServiceDeps {
	readonly attributions: AttributionRepository;
	readonly payouts: PayoutRepository;
}

/**
 * CSV export of attribution records and payouts (PRD-046). Bank details are
 * deliberately never exportable — masked-by-default extends to exports too.
 */
export class ExportService {
	constructor(private readonly deps: ExportServiceDeps) {}

	async export(kind: ExportKind): Promise<string> {
		switch (kind) {
			case "attribution":
				return this.exportAttribution();
			case "payouts":
				return this.exportPayouts();
			default: {
				const exhaustive: never = kind;
				throw new ValidationError("Validation failed", [
					{ field: "kind", message: `unknown export kind: ${String(exhaustive)}` },
				]);
			}
		}
	}

	private async exportAttribution(): Promise<string> {
		const records = await this.deps.attributions.findAll();
		return toCsv(
			[
				"id",
				"partnerId",
				"campaignId",
				"studentId",
				"registrationId",
				"status",
				"ruleApplied",
				"amountPaise",
				"convertedAt",
				"createdAt",
			],
			records.map((r) => [
				r.id,
				r.partnerId,
				r.campaignId,
				r.studentId,
				r.registrationId,
				r.status,
				r.ruleApplied,
				r.amountPaise,
				r.convertedAt?.toISOString() ?? "",
				r.createdAt.toISOString(),
			]),
		);
	}

	private async exportPayouts(): Promise<string> {
		const payouts = await this.deps.payouts.findAll();
		return toCsv(
			[
				"id",
				"partnerId",
				"amountPaise",
				"note",
				"status",
				"triggeredBy",
				"triggeredAt",
				"paidBy",
				"paidAt",
			],
			payouts.map((p) => [
				p.id,
				p.partnerId,
				p.amountPaise,
				p.note ?? "",
				p.status,
				p.triggeredBy,
				p.triggeredAt.toISOString(),
				p.paidBy ?? "",
				p.paidAt?.toISOString() ?? "",
			]),
		);
	}
}
