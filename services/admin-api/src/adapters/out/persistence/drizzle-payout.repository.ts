import { and, eq, isNull } from "drizzle-orm";
import type {
	PartnerInstitutionAssignment,
	PayoutLedgerEntry,
} from "../../../core/domain/partner-models";
import { ProviderError } from "../../../core/errors";
import type {
	PartnerInstitutionAssignmentRepository,
	PayoutLedgerRepository,
} from "../../../core/ports/out/partner-repositories.port";
import { getDb } from "./postgres.client";
import { partnerInstitutionAssignments, payoutLedgerEntries } from "./schema/schema";

type PayoutRow = typeof payoutLedgerEntries.$inferSelect;
type AssignmentRow = typeof partnerInstitutionAssignments.$inferSelect;

function toPayout(row: PayoutRow): PayoutLedgerEntry {
	return {
		id: row.id,
		partnerId: row.partnerId,
		statementId: row.statementId,
		amountPaise: row.amountPaise,
		status: row.status as PayoutLedgerEntry["status"],
		financeSignOffApprover: row.financeSignOffApprover,
		financeSignOffAt: row.financeSignOffAt,
		reason: row.reason,
		createdAt: row.createdAt,
	};
}

function toAssignment(row: AssignmentRow): PartnerInstitutionAssignment {
	return {
		id: row.id,
		partnerId: row.partnerId,
		institutionId: row.institutionId,
		effectiveFrom: row.effectiveFrom,
		effectiveTo: row.effectiveTo,
		assignedBy: row.assignedBy,
	};
}

/** Drizzle-backed {@link PayoutLedgerRepository} over the shared Postgres `PayoutLedgerEntry` table. */
export class DrizzlePayoutLedgerRepository implements PayoutLedgerRepository {
	private readonly db = getDb();

	async findById(id: string): Promise<PayoutLedgerEntry | null> {
		const rows = await this.db
			.select()
			.from(payoutLedgerEntries)
			.where(eq(payoutLedgerEntries.id, id))
			.limit(1);
		const row = rows[0];
		return row ? toPayout(row) : null;
	}

	async create(input: {
		readonly id: string;
		readonly partnerId: string;
		readonly statementId: string;
		readonly amountPaise: number;
		readonly createdAt: Date;
	}): Promise<PayoutLedgerEntry> {
		const rows = await this.db
			.insert(payoutLedgerEntries)
			.values({
				id: input.id,
				partnerId: input.partnerId,
				statementId: input.statementId,
				amountPaise: input.amountPaise,
				status: "PENDING",
				createdAt: input.createdAt,
			})
			.returning();
		const row = rows[0];
		if (!row)
			throw new ProviderError("Postgres", new Error("PayoutLedgerEntry insert returned no row"));
		return toPayout(row);
	}

	async update(
		id: string,
		patch: {
			readonly status: PayoutLedgerEntry["status"];
			readonly financeSignOffApprover?: string | null;
			readonly financeSignOffAt?: Date | null;
			readonly reason?: string | null;
		},
	): Promise<PayoutLedgerEntry | null> {
		const set: Partial<PayoutRow> = { status: patch.status };
		if (patch.financeSignOffApprover !== undefined)
			set.financeSignOffApprover = patch.financeSignOffApprover;
		if (patch.financeSignOffAt !== undefined) set.financeSignOffAt = patch.financeSignOffAt;
		if (patch.reason !== undefined) set.reason = patch.reason;

		const rows = await this.db
			.update(payoutLedgerEntries)
			.set(set)
			.where(eq(payoutLedgerEntries.id, id))
			.returning();
		const row = rows[0];
		return row ? toPayout(row) : null;
	}

	async findByPartnerId(partnerId: string): Promise<readonly PayoutLedgerEntry[]> {
		const rows = await this.db
			.select()
			.from(payoutLedgerEntries)
			.where(eq(payoutLedgerEntries.partnerId, partnerId));
		return rows.map(toPayout);
	}

	async findAll(): Promise<readonly PayoutLedgerEntry[]> {
		const rows = await this.db.select().from(payoutLedgerEntries);
		return rows.map(toPayout);
	}
}

/** Drizzle-backed {@link PartnerInstitutionAssignmentRepository}. */
export class DrizzlePartnerInstitutionAssignmentRepository
	implements PartnerInstitutionAssignmentRepository
{
	private readonly db = getDb();

	async findActive(
		partnerId: string,
		institutionId: string,
	): Promise<PartnerInstitutionAssignment | null> {
		const rows = await this.db
			.select()
			.from(partnerInstitutionAssignments)
			.where(
				and(
					eq(partnerInstitutionAssignments.partnerId, partnerId),
					eq(partnerInstitutionAssignments.institutionId, institutionId),
					isNull(partnerInstitutionAssignments.effectiveTo),
				),
			)
			.limit(1);
		const row = rows[0];
		return row ? toAssignment(row) : null;
	}

	async create(input: {
		readonly id: string;
		readonly partnerId: string;
		readonly institutionId: string;
		readonly effectiveFrom: Date;
		readonly assignedBy: string;
	}): Promise<PartnerInstitutionAssignment> {
		const rows = await this.db
			.insert(partnerInstitutionAssignments)
			.values({
				id: input.id,
				partnerId: input.partnerId,
				institutionId: input.institutionId,
				effectiveFrom: input.effectiveFrom,
				assignedBy: input.assignedBy,
			})
			.returning();
		const row = rows[0];
		if (!row)
			throw new ProviderError(
				"Postgres",
				new Error("PartnerInstitutionAssignment insert returned no row"),
			);
		return toAssignment(row);
	}

	async deactivate(id: string, effectiveTo: Date): Promise<PartnerInstitutionAssignment | null> {
		const rows = await this.db
			.update(partnerInstitutionAssignments)
			.set({ effectiveTo })
			.where(eq(partnerInstitutionAssignments.id, id))
			.returning();
		const row = rows[0];
		return row ? toAssignment(row) : null;
	}

	async findByPartnerId(partnerId: string): Promise<readonly PartnerInstitutionAssignment[]> {
		const rows = await this.db
			.select()
			.from(partnerInstitutionAssignments)
			.where(eq(partnerInstitutionAssignments.partnerId, partnerId));
		return rows.map(toAssignment);
	}
}
