-- Shop currency (pts) for cosmetics purchases
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "shop_pts" INTEGER NOT NULL DEFAULT 0;
