-- Decouple Question from a single Section: introduce SectionQuestion join.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "SectionQuestion" (
  "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "sectionId"  TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "sortOrder"  INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SectionQuestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SectionQuestion_sectionId_questionId_key"
  ON "SectionQuestion" ("sectionId", "questionId");
CREATE INDEX "SectionQuestion_sectionId_sortOrder_idx"
  ON "SectionQuestion" ("sectionId", "sortOrder");
CREATE INDEX "SectionQuestion_questionId_idx"
  ON "SectionQuestion" ("questionId");

ALTER TABLE "SectionQuestion"
  ADD CONSTRAINT "SectionQuestion_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "ExamSection"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SectionQuestion"
  ADD CONSTRAINT "SectionQuestion_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing Question.sectionId becomes a SectionQuestion row,
-- preserving the old sortOrder.
INSERT INTO "SectionQuestion" ("id", "sectionId", "questionId", "sortOrder")
SELECT gen_random_uuid()::text, "sectionId", "id", "sortOrder"
FROM "Question"
WHERE "sectionId" IS NOT NULL;

-- Now drop the legacy single-section columns from Question.
ALTER TABLE "Question" DROP CONSTRAINT IF EXISTS "Question_sectionId_fkey";
DROP INDEX IF EXISTS "Question_sectionId_idx";
DROP INDEX IF EXISTS "Question_sectionId_sortOrder_idx";
ALTER TABLE "Question" DROP COLUMN IF EXISTS "sectionId";
ALTER TABLE "Question" DROP COLUMN IF EXISTS "sortOrder";
