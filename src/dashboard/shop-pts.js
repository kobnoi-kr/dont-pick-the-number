"use strict";

const DEFAULT_SHOP_PTS = {
  enabled: true,
  baseWin: 25,
  perHumanOpponent: 15,
  maxBonusHumans: 11
};

function clampInt(n, min, max, fallback) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function normalizeShopPtsConfig(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    enabled: src.enabled !== false && src.enabled !== "false" && src.enabled !== 0,
    baseWin: clampInt(src.baseWin, 0, 100000, DEFAULT_SHOP_PTS.baseWin),
    perHumanOpponent: clampInt(
      src.perHumanOpponent,
      0,
      100000,
      DEFAULT_SHOP_PTS.perHumanOpponent
    ),
    maxBonusHumans: clampInt(src.maxBonusHumans, 0, 32, DEFAULT_SHOP_PTS.maxBonusHumans)
  };
}

async function loadShopPtsConfig(prisma) {
  if (!prisma) return normalizeShopPtsConfig(DEFAULT_SHOP_PTS);
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: "shop_pts" } });
    if (!row) {
      // First boot: persist defaults so admin UI + player shop stay in sync (enabled).
      return saveShopPtsConfig(prisma, DEFAULT_SHOP_PTS);
    }
    return normalizeShopPtsConfig(row.value);
  } catch {
    return normalizeShopPtsConfig(DEFAULT_SHOP_PTS);
  }
}

async function saveShopPtsConfig(prisma, raw) {
  const value = normalizeShopPtsConfig(raw);
  await prisma.systemSetting.upsert({
    where: { key: "shop_pts" },
    update: { value },
    create: { key: "shop_pts", value }
  });
  return value;
}

/** Human seats in lobby (exclude bots). */
function countHumanPlayers(room) {
  return (room && room.players ? room.players : []).filter((p) => p && !p.bot).length;
}

/**
 * Win reward: baseWin + perHumanOpponent * min(humans-1, maxBonusHumans)
 * Bots do not count toward lobby size.
 */
function computeWinShopPts(config, humanCount) {
  const cfg = normalizeShopPtsConfig(config);
  if (!cfg.enabled) return 0;
  const humans = Math.max(0, Math.floor(Number(humanCount) || 0));
  if (humans < 1) return 0;
  const opponents = Math.min(Math.max(0, humans - 1), cfg.maxBonusHumans);
  return cfg.baseWin + cfg.perHumanOpponent * opponents;
}

async function awardShopPts(prisma, userId, amount, meta) {
  if (!prisma || !userId) return null;
  const gain = Math.floor(Number(amount) || 0);
  if (gain < 1) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, shopPts: true, accountType: true }
  });
  if (!user) return null;
  const next = (user.shopPts || 0) + gain;
  await prisma.user.update({
    where: { id: userId },
    data: { shopPts: next }
  });
  // Guests earn/hold pts too; buying still requires a registered account.
  await prisma.notification
    .create({
      data: {
        userId,
        type: "shop_pts",
        title: "ได้รับ " + gain + " pts",
        body:
          "ชนะเกมแล้วได้ " +
          gain +
          " pts สำหรับ Shop" +
          (meta && meta.humans ? " (ล็อบบี้ " + meta.humans + " คนจริง)" : ""),
        payload: Object.assign(
          { gain, balance: next, href: "/app#shop" },
          meta || {}
        )
      }
    })
    .catch(() => {});
  return { gain, balance: next };
}

module.exports = {
  DEFAULT_SHOP_PTS,
  normalizeShopPtsConfig,
  loadShopPtsConfig,
  saveShopPtsConfig,
  countHumanPlayers,
  computeWinShopPts,
  awardShopPts
};
