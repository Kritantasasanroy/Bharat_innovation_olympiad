import { eq } from "drizzle-orm";
import type { ApplicationStatus, PartnerStatus } from "../../../core/domain/partner-enums";
import type { Partner, PartnerApplication } from "../../../core/domain/partner-models";
import { ProviderError } from "../../../core/errors";
import type {
	NewPartnerApplication,
	PartnerApplicationRepository,
	PartnerRepository,
} from "../../../core/ports/out/partner-repositories.port";
import { getDb } from "./postgres.client";
import { partnerApplications, partners } from "./schema/schema";

type PartnerRow = typeof partners.$inferSelect;
type ApplicationRow = typeof partnerApplications.$inferSelect;

function toPartner(row: PartnerRow): Partner {
	return {
		id: row.id,
		orgName: row.orgName,
		contactPerson: row.contactPerson,
		email: row.email,
		phone: row.phone,
		commissionRatePct: row.commissionRatePct,
		status: row.status as PartnerStatus,
		createdAt: row.createdAt,
	};
}

function toApplication(row: ApplicationRow): PartnerApplication {
	return {
		id: row.id,
		partnerId: row.partnerId,
		orgName: row.orgName,
		contactPerson: row.contactPerson,
		email: row.email,
		phone: row.phone,
		status: row.status as ApplicationStatus,
		decisionReason: row.decisionReason,
		decidedBy: row.decidedBy,
		decidedAt: row.decidedAt,
		createdAt: row.createdAt,
	};
}

/** Drizzle-backed {@link PartnerRepository} over the shared Postgres `Partner` table. */
export class DrizzlePartnerRepository implements PartnerRepository {
	private readonly db = getDb();

	async findById(id: string): Promise<Partner | null> {
		const rows = await this.db.select().from(partners).where(eq(partners.id, id)).limit(1);
		const row = rows[0];
		return row ? toPartner(row) : null;
	}

	async create(input: {
		readonly id: string;
		readonly orgName: string;
		readonly contactPerson: string;
		readonly email: string;
		readonly phone: string;
		readonly commissionRatePct: number;
		readonly createdAt: Date;
	}): Promise<Partner> {
		const rows = await this.db
			.insert(partners)
			.values({
				id: input.id,
				orgName: input.orgName,
				contactPerson: input.contactPerson,
				email: input.email,
				phone: input.phone,
				commissionRatePct: input.commissionRatePct,
				status: "PENDING",
				createdAt: input.createdAt,
			})
			.returning();
		const row = rows[0];
		if (!row) throw new ProviderError("Postgres", new Error("Partner insert returned no row"));
		return toPartner(row);
	}

	async updateStatus(id: string, status: PartnerStatus): Promise<Partner | null> {
		const rows = await this.db
			.update(partners)
			.set({ status })
			.where(eq(partners.id, id))
			.returning();
		const row = rows[0];
		return row ? toPartner(row) : null;
	}
}

/** Drizzle-backed {@link PartnerApplicationRepository} over the shared Postgres table. */
export class DrizzlePartnerApplicationRepository implements PartnerApplicationRepository {
	private readonly db = getDb();

	async findById(id: string): Promise<PartnerApplication | null> {
		const rows = await this.db
			.select()
			.from(partnerApplications)
			.where(eq(partnerApplications.id, id))
			.limit(1);
		const row = rows[0];
		return row ? toApplication(row) : null;
	}

	async create(input: NewPartnerApplication): Promise<PartnerApplication> {
		const rows = await this.db
			.insert(partnerApplications)
			.values({
				id: input.applicationId,
				partnerId: input.partnerId,
				orgName: input.orgName,
				contactPerson: input.contactPerson,
				email: input.email,
				phone: input.phone,
				status: "SUBMITTED",
				createdAt: input.createdAt,
			})
			.returning();
		const row = rows[0];
		if (!row)
			throw new ProviderError("Postgres", new Error("PartnerApplication insert returned no row"));
		return toApplication(row);
	}

	async decide(
		id: string,
		status: Extract<ApplicationStatus, "APPROVED" | "REJECTED">,
		reason: string,
		decidedBy: string,
		decidedAt: Date,
	): Promise<PartnerApplication | null> {
		const rows = await this.db
			.update(partnerApplications)
			.set({ status, decisionReason: reason, decidedBy, decidedAt })
			.where(eq(partnerApplications.id, id))
			.returning();
		const row = rows[0];
		return row ? toApplication(row) : null;
	}
}
