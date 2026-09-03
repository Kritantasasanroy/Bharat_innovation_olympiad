-- Auto-assigned exam sittings.
--
-- Replaces the old pick-a-slot / assign-a-school-to-a-slot model with recurring
-- "slot timings" plus per-participant auto-assignment from their registration
-- date. Written by hand rather than generated so the ExamSlot backfill is
-- explicit: `slotDate` is NOT NULL and every existing row needs a correct value.
--
-- Safe on a live database. Existing sittings and the bookings that point at them
-- are preserved; only SchoolSlotAssignment (whose whole concept is gone) is
-- dropped.

-- ── 1. Recurring sitting times ───────────────────────────────────────────────
CREATE TABLE "SlotTiming" (
    "id"             TEXT NOT NULL,
    "examInstanceId" TEXT NOT NULL,
    "label"          TEXT,
    "startMinute"    INTEGER NOT NULL,
    "endMinute"      INTEGER NOT NULL,
    "capacity"       INTEGER NOT NULL DEFAULT 50,
    "weekdays"       INTEGER[] DEFAULT ARRAY[0, 6]::INTEGER[],
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    "sortOrder"      INTEGER NOT NULL DEFAULT 0,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SlotTiming_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SlotTiming_examInstanceId_idx" ON "SlotTiming"("examInstanceId");

ALTER TABLE "SlotTiming"
    ADD CONSTRAINT "SlotTiming_examInstanceId_fkey"
    FOREIGN KEY ("examInstanceId") REFERENCES "ExamInstance"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 2. ExamSlot gains its timing and its calendar day ────────────────────────
ALTER TABLE "ExamSlot" ADD COLUMN "timingId"  TEXT;
ALTER TABLE "ExamSlot" ADD COLUMN "slotDate"  TIMESTAMP(3);
ALTER TABLE "ExamSlot" ADD COLUMN "updatedAt" TIMESTAMP(3);

-- Backfill: midnight *IST* of the day each existing sitting starts on. The
-- weekday rules are all IST-relative, so truncating in UTC would put an early
-- morning sitting on the wrong calendar day.
UPDATE "ExamSlot"
SET "slotDate" = (date_trunc('day', "startsAt" AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'),
    "updatedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP)
WHERE "slotDate" IS NULL;

ALTER TABLE "ExamSlot" ALTER COLUMN "slotDate"  SET NOT NULL;
ALTER TABLE "ExamSlot" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "ExamSlot" ALTER COLUMN "capacity"  SET DEFAULT 50;

-- One sitting per (timing, date) — the uniqueness that makes lazy
-- materialisation safe to race. Pre-existing rows have a NULL timingId and
-- Postgres treats NULLs as distinct, so they never collide with each other.
CREATE UNIQUE INDEX "ExamSlot_timingId_slotDate_key" ON "ExamSlot"("timingId", "slotDate");
CREATE INDEX "ExamSlot_slotDate_idx" ON "ExamSlot"("slotDate");

ALTER TABLE "ExamSlot"
    ADD CONSTRAINT "ExamSlot_timingId_fkey"
    FOREIGN KEY ("timingId") REFERENCES "SlotTiming"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 3. Booking records who placed the participant ────────────────────────────
ALTER TABLE "Booking" ADD COLUMN "assignedBy" TEXT;
-- New bookings are appointments, not purchases, so they start CONFIRMED.
-- Existing PENDING rows are deliberately left alone: they are still treated as
-- active seats, so nobody loses a place they already hold.
ALTER TABLE "Booking" ALTER COLUMN "status" SET DEFAULT 'CONFIRMED';

-- ── 4. Per-instance assignment rules ─────────────────────────────────────────
ALTER TABLE "ExamInstance" ADD COLUMN "slotLeadDays"      INTEGER   NOT NULL DEFAULT 14;
ALTER TABLE "ExamInstance" ADD COLUMN "slotHorizonDays"   INTEGER   NOT NULL DEFAULT 56;
ALTER TABLE "ExamInstance" ADD COLUMN "slotDayPreference" INTEGER[] DEFAULT ARRAY[0, 6]::INTEGER[];

-- ── 5. School-level slot assignment is gone ──────────────────────────────────
-- Sittings now follow each participant's own registration date, so a school no
-- longer has a single slot. Bookings made under the old model survive — they
-- live on Booking, not here.
DROP TABLE IF EXISTS "SchoolSlotAssignment";
