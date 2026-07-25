import { toCsv } from "../domain/csv";
import { ValidationError } from "../errors";
import type { ExportKind } from "../ports/in/partner.port";
import type {
	AttributionRepository,
	CommissionStatementRepository,
	PayoutLedgerRepository,
} from "../ports/out/partner-repositories.port";

export interface ExportServiceDeps {
	readonly attributions: AttributionRepository;
	readonly statements: CommissionStatementRepository;
	readonly payouts: PayoutLedgerRepository;
}

/** CSV export of attribution records, commission statements, and payout ledger entries (PRD-046). */
export class ExportService {
	constructor(private readonly deps: ExportServiceDeps) {}

	async export(kind: ExportKind): Promise<string> {
		switch (kind) {
			case "attribution":
				return this.exportAttribution();
			case "statements":
				return this.exportStatements();
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

	private async exportStatements(): Promise<string> {
		const statements = await this.deps.statements.findAll();
		return toCsv(
			["id", "partnerId", "period", "version", "totalPaise", "status", "issuedAt"],
			statements.map((s) => [
				s.id,
				s.partnerId,
				s.period,
				s.version,
				s.totalPaise,
				s.status,
				s.issuedAt.toISOString(),
			]),
		);
	}

	private async exportPayouts(): Promise<string> {
		const payouts = await this.deps.payouts.findAll();
		return toCsv(
			[
				"id",
				"partnerId",
				"statementId",
				"amountPaise",
				"status",
				"financeSignOffApprover",
				"financeSignOffAt",
				"createdAt",
			],
			payouts.map((p) => [
				p.id,
				p.partnerId,
				p.statementId,
				p.amountPaise,
				p.status,
				p.financeSignOffApprover ?? "",
				p.financeSignOffAt?.toISOString() ?? "",
				p.createdAt.toISOString(),
			]),
		);
	}
}
