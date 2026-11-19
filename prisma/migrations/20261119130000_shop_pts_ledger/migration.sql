-- CreateTable
CREATE TABLE "shop_pts_ledger" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_pts_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shop_pts_ledger_user_id_created_at_idx" ON "shop_pts_ledger"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "shop_pts_ledger" ADD CONSTRAINT "shop_pts_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
