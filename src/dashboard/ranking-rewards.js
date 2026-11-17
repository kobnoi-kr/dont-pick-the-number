"use strict";

const { getPrisma, authEnabled } = require("../db");
const { previousRankingWindow } = require("./ranking-period");
const {
  ensureCosmeticsCatalog,
  grantCosmetic,
  RANK_TITLE_IDS
} = require("./cosmetics");

async function topUsersForWindow(prisma, since, until) {
  const players = await prisma.gamePlayer.findMany({
    where: {
      userId: { not: null },
      user: { accountType: "registered", status: "active" },
      game: { endedAt: { gte: since, lt: until } }
    },
    select: { userId: true, points: true, won: true }
  });
  const byUser = new Map();
  for (const p of players) {
    if (!p.userId) continue;
    let row = byUser.get(p.userId);
    if (!row) {
      row = { userId: p.userId, totalPoints: 0, gamesWon: 0, totalGames: 0 };
      byUser.set(p.userId, row);
    }
    row.totalPoints += Number(p.points) || 0;
    row.totalGames += 1;
    if (p.won) row.gamesWon += 1;
  }
  return Array.from(byUser.values())
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.gamesWon !== a.gamesWon) return b.gamesWon - a.gamesWon;
      return b.totalGames - a.totalGames;
    })
    .slice(0, 3);
}

async function grantPeriodRewards(prisma, period) {
  const window = previousRankingWindow(period);
  const titles = RANK_TITLE_IDS[period] || [];
  if (!titles.length) return { period, label: window.label, granted: 0 };

  const already = await prisma.rankingRewardGrant.count({
    where: { period, label: window.label }
  });
  if (already > 0) return { period, label: window.label, granted: 0, skipped: true };

  const top = await topUsersForWindow(prisma, window.since, window.resetsAt);
  let granted = 0;
  for (let i = 0; i < top.length; i++) {
    const rank = i + 1;
    const cosmeticId = titles[i];
    const userId = top[i].userId;
    if (!cosmeticId || !userId) continue;
    try {
      await prisma.rankingRewardGrant.create({
        data: { period, label: window.label, rank, userId, cosmeticId }
      });
      await grantCosmetic(prisma, userId, cosmeticId, `ranking_${period}`);
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { equippedTitleId: true }
      });
      // Auto-equip if they still use the starter title.
      if (user && (!user.equippedTitleId || user.equippedTitleId === "title.rookie")) {
        await prisma.user.update({
          where: { id: userId },
          data: { equippedTitleId: cosmeticId }
        });
      }
      granted += 1;
    } catch (err) {
      if (err && err.code === "P2002") continue;
      console.warn("[ranking-rewards] grant failed", period, window.label, rank, err && err.message);
    }
  }
  if (granted) {
    console.log(`[ranking-rewards] ${period} ${window.label}: granted ${granted} titles`);
  }
  return { period, label: window.label, granted };
}

async function runRankingRewardsOnce() {
  if (!authEnabled()) return;
  const prisma = await getPrisma();
  await ensureCosmeticsCatalog(prisma);
  await grantPeriodRewards(prisma, "weekly");
  await grantPeriodRewards(prisma, "monthly");
}

function startRankingRewardsScheduler() {
  const tick = () => {
    runRankingRewardsOnce().catch((err) => {
      console.warn("[ranking-rewards]", err && err.message ? err.message : err);
    });
  };
  tick();
  // Check hourly — grants are idempotent per period label.
  setInterval(tick, 60 * 60 * 1000);
}

module.exports = { runRankingRewardsOnce, startRankingRewardsScheduler, grantPeriodRewards };
