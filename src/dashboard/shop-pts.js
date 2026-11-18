"use strict";

const DEFAULT_SHOP_PTS = {
  enabled: true,
  mode: "random",
  baseWin: 25,
  perHumanOpponent: 15,
  maxBonusHumans: 11,
  randomMin: 20,
  randomMax: 100
};

function clampInt(n, min, max, fallback) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function normalizeShopPtsConfig(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const mode = String(src.mode || "").toLowerCase() === "formula" ? "formula" : "random";
  let randomMin = clampInt(src.randomMin, 0, 100000, DEFAULT_SHOP_PTS.randomMin);
  let randomMax = clampInt(src.randomMax, 0, 100000, DEFAULT_SHOP_PTS.randomMax);
  if (randomMax < randomMin) {
    const t = randomMin;
    randomMin = randomMax;
    randomMax = t;
  }
  return {
    enabled: src.enabled !== false && src.enabled !== "false" && src.enabled !== 0,
    mode,
    baseWin: clampInt(src.baseWin, 0, 100000, DEFAULT_SHOP_PTS.baseWin),
    perHumanOpponent: clampInt(
      src.perHumanOpponent,
      0,
      100000,
      DEFAULT_SHOP_PTS.perHumanOpponent
    ),
    maxBonusHumans: clampInt(src.maxBonusHumans, 0, 32, DEFAULT_SHOP_PTS.maxBonusHumans),
    randomMin,
    randomMax
  };
}

async function loadShopPtsConfig(prisma) {
  if (!prisma) return normalizeShopPtsConfig(DEFAULT_SHOP_PTS);
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: "shop_pts" } });
    if (!row) {
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

function randomIntInclusive(min, max) {
  const a = Math.floor(Number(min));
  const b = Math.floor(Number(max));
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/**
 * Win reward:
 * - random: uniform integer in [randomMin, randomMax]
 * - formula: baseWin + perHumanOpponent * min(humans-1, maxBonusHumans)
 */
function computeWinShopPts(config, humanCount) {
  const cfg = normalizeShopPtsConfig(config);
  if (!cfg.enabled) return 0;
  const humans = Math.max(0, Math.floor(Number(humanCount) || 0));
  if (humans < 1) return 0;
  if (cfg.mode === "random") {
    return randomIntInclusive(cfg.randomMin, cfg.randomMax);
  }
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

  const modeNote =
    meta && meta.modePts === "random"
      ? " (สุ่ม)"
      : meta && meta.humans
        ? " (ล็อบบี้ " + meta.humans + " คนจริง)"
        : "";
  const title = "ได้รับ " + gain + " pts";
  const body = "ชนะเกมแล้วได้ " + gain + " pts สำหรับ Shop" + modeNote;

  const { createUserNotification } = require("./notify");
  await createUserNotification(prisma, {
    userId,
    type: "shop_pts",
    title,
    body,
    payload: Object.assign({ gain, balance: next, href: "/app#shop" }, meta || {}),
    push: { gain, balance: next, href: "/app#shop" }
  });

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
