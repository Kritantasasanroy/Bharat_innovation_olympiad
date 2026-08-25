import { eq } from "drizzle-orm";
import type { BankDetails } from "../../../core/domain/partner-models";
import { ProviderError } from "../../../core/errors";
import type { BankDetailsRepository } from "../../../core/ports/out/partner-repositories.port";
import { getDb } from "./postgres.client";
import { partnerBankDetails } from "./schema/schema";

type BankDetailsRow = typeof partnerBankDetails.$inferSelect;

function toBankDetails(row: BankDetailsRow): BankDetails {
	return {
		partnerId: row.partnerId,
		accountHolderName: row.accountHolderName,
		bankName: row.bankName,
		ifscCode: row.ifscCode,
		accountNumberLast4: row.accountNumberLast4,
		panMasked: row.panMasked,
		submittedAt: row.submittedAt,
		updatedAt: row.updatedAt,
	};
}

/**
 * Drizzle-backed {@link BankDetailsRepository} over the shared Postgres
 * `PartnerBankDetails` table. `accountNumberSealed`/`panSealed` never leave
 * this file except via {@link findSealedByPartnerId}, used only by an
 * authorised, audited reveal.
 */
export class DrizzleBankDetailsRepository implements BankDetailsRepository {
	private readonly db = getDb();

	async findByPartnerId(partnerId: string): Promise<BankDetails | null> {
		const rows = await this.db
			.select()
			.from(partnerBankDetails)
			.where(eq(partnerBankDetails.partnerId, partnerId))
			.limit(1);
		const row = rows[0];
		return row ? toBankDetails(row) : null;
	}

	async findSealedByPartnerId(
		partnerId: string,
	): Promise<{ readonly accountNumberSealed: string; readonly panSealed: string } | null> {
		const rows = await this.db
			.select({
				accountNumberSealed: partnerBankDetails.accountNumberSealed,
				panSealed: partnerBankDetails.panSealed,
			})
			.from(partnerBankDetails)
			.where(eq(partnerBankDetails.partnerId, partnerId))
			.limit(1);
		return rows[0] ?? null;
	}

	async upsert(input: {
		readonly id: string;
		readonly partnerId: string;
		readonly accountHolderName: string;
		readonly bankName: string;
		readonly ifscCode: string;
		readonly accountNumberSealed: string;
		readonly accountNumberLast4: string;
		readonly panSealed: string;
		readonly panMasked: string;
		readonly now: Date;
	}): Promise<BankDetails> {
		const rows = await this.db
			.insert(partnerBankDetails)
			.values({
				id: input.id,
				partnerId: input.partnerId,
				accountHolderName: input.accountHolderName,
				bankName: input.bankName,
				ifscCode: input.ifscCode,
				accountNumberSealed: input.accountNumberSealed,
				accountNumberLast4: input.accountNumberLast4,
				panSealed: input.panSealed,
				panMasked: input.panMasked,
				submittedAt: input.now,
				updatedAt: input.now,
			})
			.onConflictDoUpdate({
				target: partnerBankDetails.partnerId,
				set: {
					accountHolderName: input.accountHolderName,
					bankName: input.bankName,
					ifscCode: input.ifscCode,
					accountNumberSealed: input.accountNumberSealed,
					accountNumberLast4: input.accountNumberLast4,
					panSealed: input.panSealed,
					panMasked: input.panMasked,
					updatedAt: input.now,
				},
			})
			.returning();
		const row = rows[0];
		if (!row)
			throw new ProviderError("Postgres", new Error("PartnerBankDetails upsert returned no row"));
		return toBankDetails(row);
	}
}
