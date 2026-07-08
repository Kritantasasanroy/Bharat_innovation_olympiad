import { and, eq } from "drizzle-orm";
import type { AttributionRule, CampaignStatus } from "../../../core/domain/partner-enums";
import type {
	AttributionRecord,
	Campaign,
	CampaignCaps,
} from "../../../core/domain/partner-models";
import { ProviderError } from "../../../core/errors";
import type {
	AttributionRepository,
	CampaignRepository,
	NewCampaign,
} from "../../../core/ports/out/partner-repositories.port";
import { getDb } from "./postgres.client";
import { attributionRecords, campaigns } from "./schema/schema";

type CampaignRow = typeof campaigns.$inferSelect;
type AttributionRow = typeof attributionRecords.$inferSelect;

function toCampaign(row: CampaignRow): Campaign {
	return {
		id: row.id,
		partnerId: row.partnerId,
		name: row.name,
		linkToken: row.linkToken,
		referralCode: row.referralCode,
		status: row.status as CampaignStatus,
		caps: (row.caps as CampaignCaps | null) ?? null,
		createdAt: row.createdAt,
	};
}

function toAttribution(row: AttributionRow): AttributionRecord {
	return {
		id: row.id,
		partnerId: row.partnerId,
		campaignId: row.campaignId,
		studentId: row.studentId,
		registrationId: row.registrationId,
		status: row.status as AttributionRecord["status"],
		ruleApplied: row.ruleApplied as AttributionRule | null,
		amountPaise: row.amountPaise,
		convertedAt: row.convertedAt,
		createdAt: row.createdAt,
	};
}

/** Drizzle-backed {@link CampaignRepository} over the shared Postgres `Campaign` table. */
export class DrizzleCampaignRepository implements CampaignRepository {
	private readonly db = getDb();

	async findById(id: string): Promise<Campaign | null> {
		const rows = await this.db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
		const row = rows[0];
		return row ? toCampaign(row) : null;
	}

	async findByPartnerId(partnerId: string): Promise<readonly Campaign[]> {
		const rows = await this.db.select().from(campaigns).where(eq(campaigns.partnerId, partnerId));
		return rows.map(toCampaign);
	}

	async isUnique(linkToken: string, referralCode: string): Promise<boolean> {
		const byLink = await this.db
			.select({ id: campaigns.id })
			.from(campaigns)
			.where(eq(campaigns.linkToken, linkToken))
			.limit(1);
		if (byLink.length > 0) return false;
		const byCode = await this.db
			.select({ id: campaigns.id })
			.from(campaigns)
			.where(eq(campaigns.referralCode, referralCode))
			.limit(1);
		return byCode.length === 0;
	}

	async create(input: NewCampaign): Promise<Campaign> {
		const rows = await this.db
			.insert(campaigns)
			.values({
				id: input.id,
				partnerId: input.partnerId,
				name: input.name,
				linkToken: input.linkToken,
				referralCode: input.referralCode,
				status: "ACTIVE",
				caps: input.caps,
				createdAt: input.createdAt,
			})
			.returning();
		const row = rows[0];
		if (!row) throw new ProviderError("Postgres", new Error("Campaign insert returned no row"));
		return toCampaign(row);
	}

	async update(
		id: string,
		patch: { readonly name?: string; readonly caps?: CampaignCaps | null },
	): Promise<Campaign | null> {
		const set: Partial<CampaignRow> = {};
		if (patch.name !== undefined) set.name = patch.name;
		if (patch.caps !== undefined) set.caps = patch.caps;
		const rows = await this.db.update(campaigns).set(set).where(eq(campaigns.id, id)).returning();
		const row = rows[0];
		return row ? toCampaign(row) : null;
	}

	async setStatus(id: string, status: CampaignStatus): Promise<Campaign | null> {
		const rows = await this.db
			.update(campaigns)
			.set({ status })
			.where(eq(campaigns.id, id))
			.returning();
		const row = rows[0];
		return row ? toCampaign(row) : null;
	}
}

/** Drizzle-backed {@link AttributionRepository} over the shared Postgres `AttributionRecord` table. */
export class DrizzleAttributionRepository implements AttributionRepository {
	private readonly db = getDb();

	async findById(id: string): Promise<AttributionRecord | null> {
		const rows = await this.db
			.select()
			.from(attributionRecords)
			.where(eq(attributionRecords.id, id))
			.limit(1);
		const row = rows[0];
		return row ? toAttribution(row) : null;
	}

	async findOpenByStudent(studentId: string): Promise<AttributionRecord | null> {
		const rows = await this.db
			.select()
			.from(attributionRecords)
			.where(
				and(eq(attributionRecords.studentId, studentId), eq(attributionRecords.status, "OPEN")),
			)
			.limit(1);
		const row = rows[0];
		return row ? toAttribution(row) : null;
	}

	async findCreditedByStudentAndRegistration(
		studentId: string,
		registrationId: string,
	): Promise<AttributionRecord | null> {
		const rows = await this.db
			.select()
			.from(attributionRecords)
			.where(
				and(
					eq(attributionRecords.studentId, studentId),
					eq(attributionRecords.registrationId, registrationId),
					eq(attributionRecords.status, "CREDITED"),
				),
			)
			.limit(1);
		const row = rows[0];
		return row ? toAttribution(row) : null;
	}

	async createOpenTouch(input: {
		readonly id: string;
		readonly partnerId: string;
		readonly campaignId: string;
		readonly studentId: string;
		readonly createdAt: Date;
	}): Promise<AttributionRecord> {
		const rows = await this.db
			.insert(attributionRecords)
			.values({
				id: input.id,
				partnerId: input.partnerId,
				campaignId: input.campaignId,
				studentId: input.studentId,
				status: "OPEN",
				createdAt: input.createdAt,
			})
			.returning();
		const row = rows[0];
		if (!row)
			throw new ProviderError("Postgres", new Error("AttributionRecord insert returned no row"));
		return toAttribution(row);
	}

	async credit(input: {
		readonly existingId: string | null;
		readonly newId: string;
		readonly partnerId: string;
		readonly campaignId: string;
		readonly studentId: string;
		readonly registrationId: string;
		readonly ruleApplied: AttributionRule;
		readonly amountPaise: number;
		readonly convertedAt: Date;
	}): Promise<AttributionRecord> {
		if (input.existingId) {
			const rows = await this.db
				.update(attributionRecords)
				.set({
					status: "CREDITED",
					registrationId: input.registrationId,
					ruleApplied: input.ruleApplied,
					amountPaise: input.amountPaise,
					convertedAt: input.convertedAt,
				})
				.where(eq(attributionRecords.id, input.existingId))
				.returning();
			const row = rows[0];
			if (!row)
				throw new ProviderError("Postgres", new Error("Attribution credit update returned no row"));
			return toAttribution(row);
		}

		const inserted = await this.db
			.insert(attributionRecords)
			.values({
				id: input.newId,
				partnerId: input.partnerId,
				campaignId: input.campaignId,
				studentId: input.studentId,
				registrationId: input.registrationId,
				status: "CREDITED",
				ruleApplied: input.ruleApplied,
				amountPaise: input.amountPaise,
				convertedAt: input.convertedAt,
				createdAt: input.convertedAt,
			})
			.onConflictDoNothing({
				target: [
					attributionRecords.partnerId,
					attributionRecords.studentId,
					attributionRecords.registrationId,
				],
			})
			.returning();

		const insertedRow = inserted[0];
		if (insertedRow) return toAttribution(insertedRow);

		// Conflict: another call already credited this student+registration.
		// Idempotent fallback — return the existing credited row.
		const existing = await this.findCreditedByStudentAndRegistration(
			input.studentId,
			input.registrationId,
		);
		if (!existing) {
			throw new ProviderError(
				"Postgres",
				new Error("Attribution credit conflicted but no existing row was found"),
			);
		}
		return existing;
	}

	async findCreditedByPartnerId(partnerId: string): Promise<readonly AttributionRecord[]> {
		const rows = await this.db
			.select()
			.from(attributionRecords)
			.where(
				and(eq(attributionRecords.partnerId, partnerId), eq(attributionRecords.status, "CREDITED")),
			);
		return rows.map(toAttribution);
	}

	async findAllByPartnerId(partnerId: string): Promise<readonly AttributionRecord[]> {
		const rows = await this.db
			.select()
			.from(attributionRecords)
			.where(eq(attributionRecords.partnerId, partnerId));
		return rows.map(toAttribution);
	}

	async findAll(): Promise<readonly AttributionRecord[]> {
		const rows = await this.db.select().from(attributionRecords);
		return rows.map(toAttribution);
	}
}
