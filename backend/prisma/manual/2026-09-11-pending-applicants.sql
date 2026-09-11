-- PendingApplicant: a registration attempt, captured at "Send Verification
-- Code" time — before any User row can exist. Backs the admin "pending
-- applicants" list (OTP sent, never verified).
--
-- Applied by hand rather than with `prisma db push`, which drops any table not
-- mirrored in this schema (the admin-api Drizzle tables share this database).
-- Idempotent and safe to re-run.

CREATE TABLE IF NOT EXISTS "PendingApplicant" (
    "id"         TEXT NOT NULL,
    "email"      TEXT NOT NULL,
    "firstName"  TEXT NOT NULL,
    "lastName"   TEXT NOT NULL,
    "phone"      TEXT,
    "classBand"  INTEGER,
    "schoolId"   TEXT,
    "schoolName" TEXT,
    "section"    TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PendingApplicant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PendingApplicant_email_key"
    ON "PendingApplicant" ("email");

CREATE INDEX IF NOT EXISTS "PendingApplicant_updatedAt_idx"
    ON "PendingApplicant" ("updatedAt");
