import { and, eq } from "drizzle-orm";
import type { CommissionLineItem, CommissionStatement } from "../../../core/domain/partner-models";
import { ProviderError } from "../../../core/errors";
import type { CommissionStatementRepository } from "../../../core/ports/out/partner-repositories.port";
import { getDb } from "./postgres.client";
import { commissionStatements } from "./schema/schema";

type StatementRow = typeof commissionStatements.$inferSelect;

function toStatement(row: StatementRow): CommissionStatement {
	return {
		id: row.id,
		partnerId: row.partnerId,
		period: row.period,
		version: row.version,
		lineItems: row.lineItemsJson as readonly CommissionLineItem[],
		totalPaise: row.totalPaise,
		status: row.status as CommissionStatement["status"],
		issuedAt: row.issuedAt,
	};
}

/**
 * Drizzle-backed {@link CommissionStatementRepository}. Statements are
 * append-only: no method here ever issues an `UPDATE` against a prior
 * version's row — `create` always inserts a brand-new row (immutability).
 */
export class DrizzleCommissionStatementRepository implements CommissionStatementRepository {
	private readonly db = getDb();

	async findById(id: string): Promise<CommissionStatement | null> {
		const rows = await this.db
			.select()
			.from(commissionStatements)
			.where(eq(commissionStatements.id, id))
			.limit(1);
		const row = rows[0];
		return row ? toStatement(row) : null;
	}

	async latestVersion(partnerId: string, period: string): Promise<number> {
		const rows = await this.db
			.select({ version: commissionStatements.version })
			.from(commissionStatements)
			.where(
				and(eq(commissionStatements.partnerId, partnerId), eq(commissionStatements.period, period)),
			);
		const versions = rows.map((r) => r.version);
		return versions.length === 0 ? 0 : Math.max(...versions);
	}

	async create(input: {
		readonly id: string;
		readonly partnerId: string;
		readonly period: string;
		readonly version: number;
		readonly lineItems: readonly CommissionLineItem[];
		readonly totalPaise: number;
		readonly issuedAt: Date;
	}): Promise<CommissionStatement> {
		const rows = await this.db
			.insert(commissionStatements)
			.values({
				id: input.id,
				partnerId: input.partnerId,
				period: input.period,
				version: input.version,
				lineItemsJson: input.lineItems,
				totalPaise: input.totalPaise,
				status: "ISSUED",
				issuedAt: input.issuedAt,
			})
			.returning();
		const row = rows[0];
		if (!row)
			throw new ProviderError("Postgres", new Error("CommissionStatement insert returned no row"));
		return toStatement(row);
	}

	async findByPartnerId(partnerId: string): Promise<readonly CommissionStatement[]> {
		const rows = await this.db
			.select()
			.from(commissionStatements)
			.where(eq(commissionStatements.partnerId, partnerId));
		return rows.map(toStatement);
	}

	async findAll(): Promise<readonly CommissionStatement[]> {
		const rows = await this.db.select().from(commissionStatements);
		return rows.map(toStatement);
	}
}
