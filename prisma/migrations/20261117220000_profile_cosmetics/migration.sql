-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'lgbtq');

-- CreateEnum
CREATE TYPE "CosmeticKind" AS ENUM ('title', 'frame', 'effect');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "gender" "Gender",
ADD COLUMN "age" INTEGER,
ADD COLUMN "equipped_title_id" VARCHAR(64),
ADD COLUMN "equipped_frame_id" VARCHAR(64),
ADD COLUMN "equipped_effect_id" VARCHAR(64);

-- CreateTable
CREATE TABLE "cosmetics" (
    "id" VARCHAR(64) NOT NULL,
    "kind" "CosmeticKind" NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "description" VARCHAR(255),
    "shop_price" INTEGER,
    "css_class" VARCHAR(64),
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cosmetics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_cosmetics" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "cosmetic_id" VARCHAR(64) NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_cosmetics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_reward_grants" (
    "id" UUID NOT NULL,
    "period" VARCHAR(16) NOT NULL,
    "label" VARCHAR(32) NOT NULL,
    "rank" INTEGER NOT NULL,
    "user_id" UUID NOT NULL,
    "cosmetic_id" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ranking_reward_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cosmetics_kind_idx" ON "cosmetics"("kind");

-- CreateIndex
CREATE INDEX "user_cosmetics_cosmetic_id_idx" ON "user_cosmetics"("cosmetic_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_cosmetics_user_id_cosmetic_id_key" ON "user_cosmetics"("user_id", "cosmetic_id");

-- CreateIndex
CREATE INDEX "ranking_reward_grants_user_id_idx" ON "ranking_reward_grants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ranking_reward_grants_period_label_rank_key" ON "ranking_reward_grants"("period", "label", "rank");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_equipped_title_id_fkey" FOREIGN KEY ("equipped_title_id") REFERENCES "cosmetics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_equipped_frame_id_fkey" FOREIGN KEY ("equipped_frame_id") REFERENCES "cosmetics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_equipped_effect_id_fkey" FOREIGN KEY ("equipped_effect_id") REFERENCES "cosmetics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_cosmetics" ADD CONSTRAINT "user_cosmetics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_cosmetics" ADD CONSTRAINT "user_cosmetics_cosmetic_id_fkey" FOREIGN KEY ("cosmetic_id") REFERENCES "cosmetics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
