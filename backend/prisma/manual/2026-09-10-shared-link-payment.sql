-- Adds the SharedLinkPayment table (schema.prisma model of the same name).
--
-- Apply BY HAND to every environment (Neon prod AND the AWS RDS dev DB) — this
-- project has no `prisma migrate` history for `backend/`, and `prisma db push`
-- would drop the admin-api Drizzle tables. Idempotent: safe to re-run.
--
--   psql "$DATABASE_URL" -f 2026-09-10-shared-link-payment.sql

BEGIN;

CREATE TABLE IF NOT EXISTS "SharedLinkPayment" (
    "id"                TEXT NOT NULL,
    "razorpayPaymentId" TEXT NOT NULL,
    "razorpayOrderId"   TEXT,
    "email"             TEXT,
    "contact"           TEXT,
    "amount"            INTEGER NOT NULL,
    "currency"          TEXT NOT NULL DEFAULT 'INR',
    "matchedUserId"     TEXT,
    "capturedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedLinkPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SharedLinkPayment_razorpayPaymentId_key"
    ON "SharedLinkPayment"("razorpayPaymentId");
CREATE INDEX IF NOT EXISTS "SharedLinkPayment_email_idx"   ON "SharedLinkPayment"("email");
CREATE INDEX IF NOT EXISTS "SharedLinkPayment_contact_idx" ON "SharedLinkPayment"("contact");

COMMIT;
