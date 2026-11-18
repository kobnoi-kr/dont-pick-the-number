-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "equipped_extra_title_ids" JSONB NOT NULL DEFAULT '[]';
