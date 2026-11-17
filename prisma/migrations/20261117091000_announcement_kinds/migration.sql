-- AlterTable
ALTER TABLE "announcements" ADD COLUMN "kind" VARCHAR(32) NOT NULL DEFAULT 'info';
ALTER TABLE "announcements" ADD COLUMN "target_ids" JSONB;

-- CreateIndex
CREATE INDEX "announcements_kind_idx" ON "announcements"("kind");
