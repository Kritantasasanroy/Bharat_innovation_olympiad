import { integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Drizzle schema for the Partner Attribution & Payout Engine (PRD-046,
 * payouts reworked for admin-triggered amounts — see design note below).
 *
 * These are BRAND NEW tables — they do not exist in the legacy Prisma schema
 * (`backend/prisma/schema.prisma`). They live on the SAME shared Neon Postgres
 * database as every other service in this workspace (same `DATABASE_URL`), so
 * they follow the same naming convention already established for the shared
 * database by the Prisma-backed tables that `exam-api` reads (PascalCase
 * table names, camelCase columns, `text` ids) — see
 * `services/exam-api/src/adapters/out/persistence/schema/schema.ts`. Unlike
 * those tables, this schema is authoritative: `drizzle-kit generate` owns the
 * migration for these tables.
 *
 * Payouts no longer derive from a commission-rate calculation against a
 * statement: admin decides an amount directly and triggers a `Payout`. The
 * fixed-rate commission engine (`commissionRatePct`, `CommissionStatement`)
 * is retired — see the partner-payouts design note for why.
 */

const ts = (name: string) => timestamp(name, { mode: "date", precision: 3 });

export const partnerStatus = pgEnum("PartnerStatus", [
	"PENDING",
	"APPROVED",
	"REJECTED",
	"REVOKED",
]);
export const applicationStatus = pgEnum("PartnerApplicationStatus", [
	"SUBMITTED",
	"APPROVED",
	"REJECTED",
]);
export const campaignStatus = pgEnum("CampaignStatus", ["ACTIVE", "DEACTIVATED"]);
export const attributionStatus = pgEnum("AttributionStatus", ["OPEN", "CREDITED"]);
export const attributionRule = pgEnum("AttributionRule", [
	"LINK_FIRST_TOUCH",
	"COUPON_ONLY",
	"LINK_ONLY",
]);
export const payoutStatus = pgEnum("PayoutStatus", ["TRIGGERED", "PAID"]);

export const partners = pgTable("Partner", {
	id: text("id").primaryKey(),
	orgName: text("orgName").notNull(),
	contactPerson: text("contactPerson").notNull(),
	email: text("email").notNull(),
	phone: text("phone").notNull(),
	status: partnerStatus("status").notNull().default("PENDING"),
	createdAt: ts("createdAt").notNull().defaultNow(),
});

export const partnerApplications = pgTable("PartnerApplication", {
	id: text("id").primaryKey(),
	partnerId: text("partnerId").notNull(),
	orgName: text("orgName").notNull(),
	contactPerson: text("contactPerson").notNull(),
	email: text("email").notNull(),
	phone: text("phone").notNull(),
	status: applicationStatus("status").notNull().default("SUBMITTED"),
	decisionReason: text("decisionReason"),
	decidedBy: text("decidedBy"),
	decidedAt: ts("decidedAt"),
	createdAt: ts("createdAt").notNull().defaultNow(),
});

export const campaigns = pgTable(
	"Campaign",
	{
		id: text("id").primaryKey(),
		partnerId: text("partnerId").notNull(),
		name: text("name").notNull(),
		linkToken: text("linkToken").notNull(),
		referralCode: text("referralCode").notNull(),
		status: campaignStatus("status").notNull().default("ACTIVE"),
		caps: jsonb("caps"),
		createdAt: ts("createdAt").notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex("campaign_link_token_key").on(table.linkToken),
		uniqueIndex("campaign_referral_code_key").on(table.referralCode),
	],
);

export const attributionRecords = pgTable(
	"AttributionRecord",
	{
		id: text("id").primaryKey(),
		partnerId: text("partnerId").notNull(),
		campaignId: text("campaignId").notNull(),
		studentId: text("studentId").notNull(),
		registrationId: text("registrationId"),
		status: attributionStatus("status").notNull().default("OPEN"),
		ruleApplied: attributionRule("ruleApplied"),
		amountPaise: integer("amountPaise"),
		convertedAt: ts("convertedAt"),
		createdAt: ts("createdAt").notNull().defaultNow(),
	},
	(table) => [
		// One credit per paid registration: at most one attribution row per
		// partner+student+registration (PRD-046 decision).
		uniqueIndex("attribution_partner_student_registration_key").on(
			table.partnerId,
			table.studentId,
			table.registrationId,
		),
	],
);

/**
 * A specific amount admin decided to send a partner, and whether it has
 * actually gone out yet. Not derived from any statement or rate — admin sets
 * `amountPaise` directly when triggering.
 */
export const payouts = pgTable("Payout", {
	id: text("id").primaryKey(),
	partnerId: text("partnerId").notNull(),
	amountPaise: integer("amountPaise").notNull(),
	note: text("note"),
	status: payoutStatus("status").notNull().default("TRIGGERED"),
	triggeredBy: text("triggeredBy").notNull(),
	triggeredAt: ts("triggeredAt").notNull().defaultNow(),
	paidBy: text("paidBy"),
	paidAt: ts("paidAt"),
});

/**
 * Where a partner's payouts get sent. `accountNumberSealed`/`panSealed` are
 * AES-256-GCM ciphertext (see `infra/bank-details-encryption.ts`) — the only
 * two fields sensitive enough to encrypt; holder name, bank name and IFSC are
 * not secret and are needed unmasked just to render a list row. The masked
 * companions are derived once at submit time so a list view never decrypts.
 */
export const partnerBankDetails = pgTable(
	"PartnerBankDetails",
	{
		id: text("id").primaryKey(),
		partnerId: text("partnerId").notNull(),
		accountHolderName: text("accountHolderName").notNull(),
		bankName: text("bankName").notNull(),
		ifscCode: text("ifscCode").notNull(),
		accountNumberSealed: text("accountNumberSealed").notNull(),
		accountNumberLast4: text("accountNumberLast4").notNull(),
		panSealed: text("panSealed").notNull(),
		panMasked: text("panMasked").notNull(),
		submittedAt: ts("submittedAt").notNull().defaultNow(),
		updatedAt: ts("updatedAt").notNull().defaultNow(),
	},
	(table) => [uniqueIndex("partner_bank_details_partner_id_key").on(table.partnerId)],
);

export const partnerInstitutionAssignments = pgTable("PartnerInstitutionAssignment", {
	id: text("id").primaryKey(),
	partnerId: text("partnerId").notNull(),
	institutionId: text("institutionId").notNull(),
	effectiveFrom: ts("effectiveFrom").notNull().defaultNow(),
	effectiveTo: ts("effectiveTo"),
	assignedBy: text("assignedBy").notNull(),
});
