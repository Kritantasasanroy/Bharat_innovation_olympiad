-- AlterEnum
-- Remove SEB_VIOLATION and add EXIT_FULLSCREEN to ProctorEventType
BEGIN;
CREATE TYPE "ProctorEventType_new" AS ENUM ('NO_FACE', 'MULTIPLE_FACES', 'FACE_MISMATCH', 'TAB_SWITCH', 'EXIT_FULLSCREEN', 'SCREEN_CAPTURE', 'NETWORK_DISCONNECT', 'IP_CHANGE');
ALTER TABLE "ProctorEvent" ALTER COLUMN "type" TYPE "ProctorEventType_new" USING ("type"::text::"ProctorEventType_new");
ALTER TYPE "ProctorEventType" RENAME TO "ProctorEventType_old";
ALTER TYPE "ProctorEventType_new" RENAME TO "ProctorEventType";
DROP TYPE "ProctorEventType_old";
COMMIT;

-- AlterTable
-- Change requireSeb default from true to false
ALTER TABLE "ExamInstance" ALTER COLUMN "requireSeb" SET DEFAULT false;
