-- AlterTable
ALTER TABLE "contact_messages" ADD COLUMN "admin_reply" TEXT;
ALTER TABLE "contact_messages" ADD COLUMN "replied_at" TIMESTAMP(3);
ALTER TABLE "contact_messages" ADD COLUMN "replied_by" UUID;
