-- Priority-tiered exam calendar.
--
-- Sittings stop being derived from each student's signup date and become an
-- explicit published list: `ExamScheduleDate` holds the days an exam runs and
-- the tier each belongs to, and `SlotTiming.priority` says which tier a time
-- belongs to. The assigner walks (priority, date, startMinute) in order.
--
-- Written to be safe to re-run: every statement is guarded, because the
-- previous slot migration was hand-applied in some environments and a bare
-- re-run of a non-idempotent migration is what left a failed P3009 behind.

ALTER TABLE "SlotTiming" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "ExamScheduleDate" (
    "id" TEXT NOT NULL,
    "examInstanceId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExamScheduleDate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExamScheduleDate_examInstanceId_date_key"
    ON "ExamScheduleDate"("examInstanceId", "date");

CREATE INDEX IF NOT EXISTS "ExamScheduleDate_examInstanceId_priority_date_idx"
    ON "ExamScheduleDate"("examInstanceId", "priority", "date");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ExamScheduleDate_examInstanceId_fkey'
    ) THEN
        ALTER TABLE "ExamScheduleDate"
            ADD CONSTRAINT "ExamScheduleDate_examInstanceId_fkey"
            FOREIGN KEY ("examInstanceId") REFERENCES "ExamInstance"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
