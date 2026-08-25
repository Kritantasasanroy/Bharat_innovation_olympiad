-- Admin-triggered payouts replace the fixed-rate commission engine (see the
-- partner-payouts design note): no more CommissionStatement, no more
-- commissionRatePct, and PayoutLedgerEntry's PENDING/SIGNED_OFF/RELEASED
-- lifecycle is replaced by a plain TRIGGERED->PAID Payout. New
-- PartnerBankDetails table holds where a partner's payouts get sent, with
-- account number and PAN encrypted at rest.
--
-- Verified before writing this migration: PayoutLedgerEntry and
-- CommissionStatement both have 0 live rows, so dropping them loses no data.
DROP TABLE "PayoutLedgerEntry";--> statement-breakpoint
DROP TABLE "CommissionStatement";--> statement-breakpoint
DROP TYPE "PayoutStatus";--> statement-breakpoint
DROP TYPE "CommissionStatementStatus";--> statement-breakpoint
ALTER TABLE "Partner" DROP COLUMN "commissionRatePct";--> statement-breakpoint
CREATE TYPE "public"."PayoutStatus" AS ENUM('TRIGGERED', 'PAID');--> statement-breakpoint
CREATE TABLE "Payout" (
	"id" text PRIMARY KEY NOT NULL,
	"partnerId" text NOT NULL,
	"amountPaise" integer NOT NULL,
	"note" text,
	"status" "PayoutStatus" DEFAULT 'TRIGGERED' NOT NULL,
	"triggeredBy" text NOT NULL,
	"triggeredAt" timestamp (3) DEFAULT now() NOT NULL,
	"paidBy" text,
	"paidAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "PartnerBankDetails" (
	"id" text PRIMARY KEY NOT NULL,
	"partnerId" text NOT NULL,
	"accountHolderName" text NOT NULL,
	"bankName" text NOT NULL,
	"ifscCode" text NOT NULL,
	"accountNumberSealed" text NOT NULL,
	"accountNumberLast4" text NOT NULL,
	"panSealed" text NOT NULL,
	"panMasked" text NOT NULL,
	"submittedAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "partner_bank_details_partner_id_key" ON "PartnerBankDetails" USING btree ("partnerId");
