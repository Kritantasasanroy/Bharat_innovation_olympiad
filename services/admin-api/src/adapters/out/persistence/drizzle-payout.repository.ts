import { and, eq, isNull } from "drizzle-orm";
import type { PartnerInstitutionAssignment, Payout } from "../../../core/domain/partner-models";
import { ProviderError } from "../../../core/errors";
import type {
	PartnerInstitutionAssignmentRepository,
	PayoutRepository,
} from "../../../core/ports/out/partner-repositories.port";
import { getDb } from "./postgres.client";
import { partnerInstitutionAssignments, payouts } from "./schema/schema";

type PayoutRow = typeof payouts.$inferSelect;
type AssignmentRow = typeof partnerInstitutionAssignments.$inferSelect;

function toPayout(row: PayoutRow): Payout {
	return {
		id: row.id,
		partnerId: row.partnerId,
		amountPaise: row.amountPaise,
		note: row.note,
		status: row.status as Payout["status"],
		triggeredBy: row.triggeredBy,
		triggeredAt: row.triggeredAt,
		paidBy: row.paidBy,
		paidAt: row.paidAt,
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

/** Drizzle-backed {@link PayoutRepository} over the shared Postgres `Payout` table. */
export class DrizzlePayoutRepository implements PayoutRepository {
	private readonly db = getDb();

	async findById(id: string): Promise<Payout | null> {
		const rows = await this.db.select().from(payouts).where(eq(payouts.id, id)).limit(1);
		const row = rows[0];
		return row ? toPayout(row) : null;
	}

	async create(input: {
		readonly id: string;
		readonly partnerId: string;
		readonly amountPaise: number;
		readonly note: string | null;
		readonly triggeredBy: string;
		readonly triggeredAt: Date;
	}): Promise<Payout> {
		const rows = await this.db
			.insert(payouts)
			.values({
				id: input.id,
				partnerId: input.partnerId,
				amountPaise: input.amountPaise,
				note: input.note,
				status: "TRIGGERED",
				triggeredBy: input.triggeredBy,
				triggeredAt: input.triggeredAt,
			})
			.returning();
		const row = rows[0];
		if (!row) throw new ProviderError("Postgres", new Error("Payout insert returned no row"));
		return toPayout(row);
	}

	async markPaid(id: string, paidBy: string, paidAt: Date): Promise<Payout | null> {
		const rows = await this.db
			.update(payouts)
			.set({ status: "PAID", paidBy, paidAt })
			.where(eq(payouts.id, id))
			.returning();
		const row = rows[0];
		return row ? toPayout(row) : null;
	}

	async findByPartnerId(partnerId: string): Promise<readonly Payout[]> {
		const rows = await this.db.select().from(payouts).where(eq(payouts.partnerId, partnerId));
		return rows.map(toPayout);
	}

	async findAll(): Promise<readonly Payout[]> {
		const rows = await this.db.select().from(payouts);
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
