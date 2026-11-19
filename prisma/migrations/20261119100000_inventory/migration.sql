-- CreateTable
CREATE TABLE "inventory_items" (
    "id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "description" VARCHAR(255),
    "shop_price" INTEGER,
    "image_url" VARCHAR(255),
    "effect" VARCHAR(32),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_inventory_items" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "item_id" VARCHAR(64) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_inventory_items_item_id_idx" ON "user_inventory_items"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_inventory_items_user_id_item_id_key" ON "user_inventory_items"("user_id", "item_id");

-- AddForeignKey
ALTER TABLE "user_inventory_items" ADD CONSTRAINT "user_inventory_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_inventory_items" ADD CONSTRAINT "user_inventory_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
