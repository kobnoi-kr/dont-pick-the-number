-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "max_level" INTEGER NOT NULL DEFAULT 1;

-- Backfill from current level
UPDATE "users" SET "max_level" = GREATEST(COALESCE("level", 1), 1) WHERE "max_level" < COALESCE("level", 1);
