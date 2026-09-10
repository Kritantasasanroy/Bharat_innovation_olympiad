-- 2026-09-10 · ExamFeedback + Grievance.attachmentUrls
--
-- Run BY HAND against every database (Neon prod and bio-dev-postgres).
--
-- Not `prisma db push`: this project has no migration history, and a push drops
-- any admin-api Drizzle table that is not mirrored in schema.prisma — the
-- partner engine's seven tables live in the same database and would go with it.
--
-- Every statement is idempotent, so re-running is safe and a partially-applied
-- run can simply be repeated.
--
-- Purely additive: a new table plus a new column with a default. Existing code
-- ignores both, so this can be applied before the code that uses it ships.

BEGIN;

-- Pre-existing on some databases, missing on others (added by hand during the
-- AWS migration). Guarded so it is a no-op where it already exists.
ALTER TYPE "MediaAssetKind" ADD VALUE IF NOT EXISTS 'AUDIO';

-- Supporting documents on a student support request. Required on new
-- submissions (enforced in GrievanceService); the default keeps existing rows
-- valid without a backfill.
ALTER TABLE "Grievance"
    ADD COLUMN IF NOT EXISTS "attachmentUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- "How much did you like the Innovation Olympiad?" — the star rating collected
-- on the submit screen of every exam.
CREATE TABLE IF NOT EXISTS "ExamFeedback" (
    "id"             TEXT         NOT NULL,
    "userId"         TEXT         NOT NULL,
    "attemptId"      TEXT         NOT NULL,
    "examInstanceId" TEXT         NOT NULL,
    "rating"         INTEGER      NOT NULL,
    "comment"        TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamFeedback_pkey" PRIMARY KEY ("id")
);

-- One rating per attempt: a reload or a double-tap updates, never stacks.
CREATE UNIQUE INDEX IF NOT EXISTS "ExamFeedback_attemptId_key"      ON "ExamFeedback" ("attemptId");
CREATE INDEX        IF NOT EXISTS "ExamFeedback_rating_idx"         ON "ExamFeedback" ("rating");
CREATE INDEX        IF NOT EXISTS "ExamFeedback_examInstanceId_idx" ON "ExamFeedback" ("examInstanceId");
CREATE INDEX        IF NOT EXISTS "ExamFeedback_createdAt_idx"      ON "ExamFeedback" ("createdAt");

-- ADD CONSTRAINT has no IF NOT EXISTS, so each one is guarded by a catalogue
-- lookup rather than left to fail a re-run.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExamFeedback_userId_fkey') THEN
        ALTER TABLE "ExamFeedback" ADD CONSTRAINT "ExamFeedback_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExamFeedback_attemptId_fkey') THEN
        ALTER TABLE "ExamFeedback" ADD CONSTRAINT "ExamFeedback_attemptId_fkey"
            FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExamFeedback_examInstanceId_fkey') THEN
        ALTER TABLE "ExamFeedback" ADD CONSTRAINT "ExamFeedback_examInstanceId_fkey"
            FOREIGN KEY ("examInstanceId") REFERENCES "ExamInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

COMMIT;
