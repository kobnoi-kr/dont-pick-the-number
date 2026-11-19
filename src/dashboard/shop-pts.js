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

/**
 * Append a ledger row. `db` may be prisma or a transaction client.
 */
async function appendShopPtsLedger(db, entry) {
  if (!db || !db.shopPtsLedger || !entry || !entry.userId) return null;
  const delta = Math.floor(Number(entry.delta) || 0);
  if (!delta) return null;
  const balance = Math.max(0, Math.floor(Number(entry.balance) || 0));
  const kind = String(entry.kind || "other").slice(0, 32);
  const title = String(entry.title || (delta > 0 ? "ได้รับ pts" : "ใช้ pts")).slice(0, 120);
  try {
    return await db.shopPtsLedger.create({
      data: {
        userId: entry.userId,
        delta,
        balance,
        kind,
        title,
        meta: entry.meta && typeof entry.meta === "object" ? entry.meta : undefined
      }
    });
  } catch (err) {
    console.warn("[shop-pts] ledger write failed", err && err.message ? err.message : err);
    return null;
  }
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

  const isAdmin = !!(meta && meta.reason === "admin_grant");
  const kind = isAdmin ? "admin_grant" : "win";
  const title = isAdmin ? "แอดมินเพิ่ม " + gain + " pts" : "ชนะเกม +" + gain + " pts";
  const modeNote =
    meta && meta.modePts === "random"
      ? " (สุ่ม)"
      : meta && meta.humans
        ? " (ล็อบบี้ " + meta.humans + " คนจริง)"
        : "";
  const body = isAdmin
    ? "ได้รับ " + gain + " pts จากแอดมิน"
    : "ชนะเกมแล้วได้ " + gain + " pts สำหรับ Shop" + modeNote;

  await appendShopPtsLedger(prisma, {
    userId,
    delta: gain,
    balance: next,
    kind,
    title,
    meta: Object.assign({}, meta || {}, { gain })
  });

  const { createUserNotification } = require("./notify");
  await createUserNotification(prisma, {
    userId,
    type: "shop_pts",
    title: isAdmin ? title : "ได้รับ " + gain + " pts",
    body,
    payload: Object.assign({ gain, balance: next, href: "/app#pts-history" }, meta || {}),
    push: { gain, balance: next, href: "/app#pts-history" }
  });

  return { gain, balance: next };
}

async function listShopPtsHistory(prisma, userId, opts) {
  if (!prisma || !prisma.shopPtsLedger || !userId) return [];
  const take = Math.min(100, Math.max(1, Math.floor(Number(opts && opts.limit) || 50)));
  const rows = await prisma.shopPtsLedger.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take
  });
  return rows.map((row) => ({
    id: row.id,
    delta: row.delta,
    balance: row.balance,
    kind: row.kind,
    title: row.title,
    meta: row.meta || null,
    createdAt: row.createdAt
  }));
}

module.exports = {
  DEFAULT_SHOP_PTS,
  normalizeShopPtsConfig,
  loadShopPtsConfig,
  saveShopPtsConfig,
  countHumanPlayers,
  computeWinShopPts,
  awardShopPts,
  appendShopPtsLedger,
  listShopPtsHistory
};
