ALTER TABLE "Question"
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Question_sectionId_sortOrder_idx" ON "Question"("sectionId", "sortOrder");

-- Backfill: assign sequential sortOrder within each section based on createdAt
WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY "sectionId" ORDER BY "createdAt") - 1 AS rn
  FROM "Question"
  WHERE "sectionId" IS NOT NULL
)
UPDATE "Question" q
SET "sortOrder" = numbered.rn
FROM numbered
WHERE q.id = numbered.id;
