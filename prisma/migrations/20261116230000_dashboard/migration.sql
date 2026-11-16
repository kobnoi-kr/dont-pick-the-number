-- CreateTable
CREATE TABLE "games" (
    "id" UUID NOT NULL,
    "room_code" VARCHAR(16) NOT NULL,
    "room_name" VARCHAR(64) NOT NULL,
    "game_mode" VARCHAR(32) NOT NULL,
    "visibility" VARCHAR(16) NOT NULL DEFAULT 'public',
    "status" VARCHAR(32) NOT NULL DEFAULT 'finished',
    "player_count" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "duration_sec" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_players" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "user_id" UUID,
    "display_name" VARCHAR(64) NOT NULL,
    "rank" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "won" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "game_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_rounds" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "round_no" INTEGER NOT NULL,
    "summary" JSONB,

    CONSTRAINT "game_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_statistics" (
    "user_id" UUID NOT NULL,
    "total_games" INTEGER NOT NULL DEFAULT 0,
    "games_won" INTEGER NOT NULL DEFAULT 0,
    "games_lost" INTEGER NOT NULL DEFAULT 0,
    "total_points" INTEGER NOT NULL DEFAULT 0,
    "play_time_sec" INTEGER NOT NULL DEFAULT 0,
    "best_win_streak" INTEGER NOT NULL DEFAULT 0,
    "current_win_streak" INTEGER NOT NULL DEFAULT 0,
    "rank_sum" INTEGER NOT NULL DEFAULT 0,
    "favorite_mode" VARCHAR(32),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_statistics_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" TEXT,
    "payload" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "games_ended_at_idx" ON "games"("ended_at");
CREATE INDEX "games_game_mode_idx" ON "games"("game_mode");
CREATE INDEX "game_players_user_id_idx" ON "game_players"("user_id");
CREATE INDEX "game_players_game_id_idx" ON "game_players"("game_id");
CREATE INDEX "game_rounds_game_id_idx" ON "game_rounds"("game_id");
CREATE INDEX "player_statistics_total_points_idx" ON "player_statistics"("total_points");
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- AddForeignKey
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "game_rounds" ADD CONSTRAINT "game_rounds_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "player_statistics" ADD CONSTRAINT "player_statistics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
