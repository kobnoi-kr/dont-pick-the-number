-- AlterTable
ALTER TABLE "announcements" ADD COLUMN "published_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "announcements_published_at_idx" ON "announcements"("published_at");
