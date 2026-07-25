import { integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Drizzle schema for the Partner Attribution, Commission & Payout Engine
 * (PRD-046).
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
export const statementStatus = pgEnum("CommissionStatementStatus", ["ISSUED"]);
export const payoutStatus = pgEnum("PayoutStatus", ["PENDING", "SIGNED_OFF", "RELEASED"]);

export const partners = pgTable("Partner", {
	id: text("id").primaryKey(),
	orgName: text("orgName").notNull(),
	contactPerson: text("contactPerson").notNull(),
	email: text("email").notNull(),
	phone: text("phone").notNull(),
	commissionRatePct: integer("commissionRatePct").notNull(),
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

export const commissionStatements = pgTable(
	"CommissionStatement",
	{
		id: text("id").primaryKey(),
		partnerId: text("partnerId").notNull(),
		period: text("period").notNull(),
		version: integer("version").notNull(),
		lineItemsJson: jsonb("lineItemsJson").notNull(),
		totalPaise: integer("totalPaise").notNull(),
		status: statementStatus("status").notNull().default("ISSUED"),
		issuedAt: ts("issuedAt").notNull().defaultNow(),
	},
	(table) => [
		// A version is immutable once issued; each partner+period+version is unique.
		uniqueIndex("statement_partner_period_version_key").on(
			table.partnerId,
			table.period,
			table.version,
		),
	],
);

export const payoutLedgerEntries = pgTable("PayoutLedgerEntry", {
	id: text("id").primaryKey(),
	partnerId: text("partnerId").notNull(),
	statementId: text("statementId").notNull(),
	amountPaise: integer("amountPaise").notNull(),
	status: payoutStatus("status").notNull().default("PENDING"),
	financeSignOffApprover: text("financeSignOffApprover"),
	financeSignOffAt: ts("financeSignOffAt"),
	reason: text("reason"),
	createdAt: ts("createdAt").notNull().defaultNow(),
});

export const partnerInstitutionAssignments = pgTable("PartnerInstitutionAssignment", {
	id: text("id").primaryKey(),
	partnerId: text("partnerId").notNull(),
	institutionId: text("institutionId").notNull(),
	effectiveFrom: ts("effectiveFrom").notNull().defaultNow(),
	effectiveTo: ts("effectiveTo"),
	assignedBy: text("assignedBy").notNull(),
});
