CREATE TYPE "public"."PartnerApplicationStatus" AS ENUM('SUBMITTED', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."AttributionRule" AS ENUM('LINK_FIRST_TOUCH', 'COUPON_ONLY', 'LINK_ONLY');--> statement-breakpoint
CREATE TYPE "public"."AttributionStatus" AS ENUM('OPEN', 'CREDITED');--> statement-breakpoint
CREATE TYPE "public"."CampaignStatus" AS ENUM('ACTIVE', 'DEACTIVATED');--> statement-breakpoint
CREATE TYPE "public"."PartnerStatus" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."PayoutStatus" AS ENUM('PENDING', 'SIGNED_OFF', 'RELEASED');--> statement-breakpoint
CREATE TYPE "public"."CommissionStatementStatus" AS ENUM('ISSUED');--> statement-breakpoint
CREATE TABLE "AttributionRecord" (
	"id" text PRIMARY KEY NOT NULL,
	"partnerId" text NOT NULL,
	"campaignId" text NOT NULL,
	"studentId" text NOT NULL,
	"registrationId" text,
	"status" "AttributionStatus" DEFAULT 'OPEN' NOT NULL,
	"ruleApplied" "AttributionRule",
	"amountPaise" integer,
	"convertedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Campaign" (
	"id" text PRIMARY KEY NOT NULL,
	"partnerId" text NOT NULL,
	"name" text NOT NULL,
	"linkToken" text NOT NULL,
	"referralCode" text NOT NULL,
	"status" "CampaignStatus" DEFAULT 'ACTIVE' NOT NULL,
	"caps" jsonb,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "CommissionStatement" (
	"id" text PRIMARY KEY NOT NULL,
	"partnerId" text NOT NULL,
	"period" text NOT NULL,
	"version" integer NOT NULL,
	"lineItemsJson" jsonb NOT NULL,
	"totalPaise" integer NOT NULL,
	"status" "CommissionStatementStatus" DEFAULT 'ISSUED' NOT NULL,
	"issuedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PartnerApplication" (
	"id" text PRIMARY KEY NOT NULL,
	"partnerId" text NOT NULL,
	"orgName" text NOT NULL,
	"contactPerson" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"status" "PartnerApplicationStatus" DEFAULT 'SUBMITTED' NOT NULL,
	"decisionReason" text,
	"decidedBy" text,
	"decidedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PartnerInstitutionAssignment" (
	"id" text PRIMARY KEY NOT NULL,
	"partnerId" text NOT NULL,
	"institutionId" text NOT NULL,
	"effectiveFrom" timestamp (3) DEFAULT now() NOT NULL,
	"effectiveTo" timestamp (3),
	"assignedBy" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Partner" (
	"id" text PRIMARY KEY NOT NULL,
	"orgName" text NOT NULL,
	"contactPerson" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"commissionRatePct" integer NOT NULL,
	"status" "PartnerStatus" DEFAULT 'PENDING' NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PayoutLedgerEntry" (
	"id" text PRIMARY KEY NOT NULL,
	"partnerId" text NOT NULL,
	"statementId" text NOT NULL,
	"amountPaise" integer NOT NULL,
	"status" "PayoutStatus" DEFAULT 'PENDING' NOT NULL,
	"financeSignOffApprover" text,
	"financeSignOffAt" timestamp (3),
	"reason" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "attribution_partner_student_registration_key" ON "AttributionRecord" USING btree ("partnerId","studentId","registrationId");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_link_token_key" ON "Campaign" USING btree ("linkToken");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_referral_code_key" ON "Campaign" USING btree ("referralCode");--> statement-breakpoint
CREATE UNIQUE INDEX "statement_partner_period_version_key" ON "CommissionStatement" USING btree ("partnerId","period","version");