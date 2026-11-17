"use strict";

const { sendJson, readJsonBody } = require("../auth/http");
const { requireAuth } = require("../auth/middleware");
const { getPrisma, authEnabled } = require("../db");

const RANK_TITLE_IDS = {
  weekly: ["title.weekly.1", "title.weekly.2", "title.weekly.3"],
  monthly: ["title.monthly.1", "title.monthly.2", "title.monthly.3"]
};

const STARTER_COSMETICS = [
  {
    id: "title.rookie",
    kind: "title",
    name: "มือใหม่",
    description: "ยศเริ่มต้น",
    shopPrice: null,
    cssClass: "title-rookie",
    meta: { color: "#94a3b8" }
  },
  {
    id: "frame.basic",
    kind: "frame",
    name: "กรอบเรียบ",
    description: "กรอบเริ่มต้น",
    shopPrice: null,
    cssClass: "frame-basic",
    meta: {}
  },
  {
    id: "effect.none",
    kind: "effect",
    name: "ไม่มีเอฟเฟกต์",
    description: "ค่าเริ่มต้น",
    shopPrice: null,
    cssClass: "",
    meta: {}
  },
  {
    id: "title.weekly.1",
    kind: "title",
    name: "Weekly Champion",
    description: "Top 1 ประจำสัปดาห์",
    shopPrice: null,
    cssClass: "title-weekly-1",
    meta: { color: "#fbbf24", rank: 1, period: "weekly" }
  },
  {
    id: "title.weekly.2",
    kind: "title",
    name: "Weekly Elite",
    description: "Top 2 ประจำสัปดาห์",
    shopPrice: null,
    cssClass: "title-weekly-2",
    meta: { color: "#cbd5e1", rank: 2, period: "weekly" }
  },
  {
    id: "title.weekly.3",
    kind: "title",
    name: "Weekly Contender",
    description: "Top 3 ประจำสัปดาห์",
    shopPrice: null,
    cssClass: "title-weekly-3",
    meta: { color: "#cd7f32", rank: 3, period: "weekly" }
  },
  {
    id: "title.monthly.1",
    kind: "title",
    name: "Monthly Legend",
    description: "Top 1 ประจำเดือน",
    shopPrice: null,
    cssClass: "title-monthly-1",
    meta: { color: "#fbbf24", rank: 1, period: "monthly" }
  },
  {
    id: "title.monthly.2",
    kind: "title",
    name: "Monthly Ace",
    description: "Top 2 ประจำเดือน",
    shopPrice: null,
    cssClass: "title-monthly-2",
    meta: { color: "#cbd5e1", rank: 2, period: "monthly" }
  },
  {
    id: "title.monthly.3",
    kind: "title",
    name: "Monthly Star",
    description: "Top 3 ประจำเดือน",
    shopPrice: null,
    cssClass: "title-monthly-3",
    meta: { color: "#cd7f32", rank: 3, period: "monthly" }
  },
  {
    id: "frame.gold",
    kind: "frame",
    name: "กรอบทอง",
    description: "เร็วๆ นี้ใน Shop",
    shopPrice: 500,
    cssClass: "frame-gold",
    meta: { comingSoon: true }
  },
  {
    id: "effect.sparkle",
    kind: "effect",
    name: "ประกาย",
    description: "เร็วๆ นี้ใน Shop",
    shopPrice: 300,
    cssClass: "effect-sparkle",
    meta: { comingSoon: true }
  }
];

function method(req) {
  return String(req.method || "GET").toUpperCase();
}

function publicCosmetic(c) {
  if (!c) return null;
  return {
    id: c.id,
    kind: c.kind,
    name: c.name,
    description: c.description || null,
    shopPrice: c.shopPrice == null ? null : c.shopPrice,
    cssClass: c.cssClass || null,
    meta: c.meta || null
  };
}

function equippedBundle(user) {
  return {
    title: publicCosmetic(user.equippedTitle),
    frame: publicCosmetic(user.equippedFrame),
    effect: publicCosmetic(user.equippedEffect)
  };
}

async function ensureCosmeticsCatalog(prisma) {
  for (const item of STARTER_COSMETICS) {
    await prisma.cosmetic.upsert({
      where: { id: item.id },
      update: {
        kind: item.kind,
        name: item.name,
        description: item.description,
        shopPrice: item.shopPrice,
        cssClass: item.cssClass,
        meta: item.meta
      },
      create: item
    });
  }
}

async function grantCosmetic(prisma, userId, cosmeticId, source) {
  await prisma.userCosmetic.upsert({
    where: { userId_cosmeticId: { userId, cosmeticId } },
    create: { userId, cosmeticId, source },
    update: {}
  });
}

function levelTitleCosmeticId(level) {
  return "title.level." + Number(level);
}

/** Upsert level-title cosmetics from Level config. Never deletes old titles. */
async function syncLevelTitleCosmetics(prisma, levels) {
  const list = Array.isArray(levels) ? levels : [];
  for (const row of list) {
    const level = Number(row && row.level) || 0;
    if (level < 1) continue;
    const id = levelTitleCosmeticId(level);
    const name = String((row && row.title) || "Level " + level).trim().slice(0, 64) || "Level " + level;
    const color = String((row && row.color) || "#94a3b8");
    const item = {
      id,
      kind: "title",
      name,
      description: "ยศเลเวล " + level + " (เก็บได้ถาวร)",
      shopPrice: null,
      cssClass: "title-level-" + level,
      meta: { color, level, source: "level" }
    };
    await prisma.cosmetic.upsert({
      where: { id },
      update: {
        kind: item.kind,
        name: item.name,
        description: item.description,
        cssClass: item.cssClass,
        meta: item.meta
      },
      create: item
    });
  }
}

/** Grant every unlocked level title up to current level — keeps forever. */
async function grantLevelTitlesUpTo(prisma, userId, level) {
  const max = Math.max(0, Number(level) || 0);
  for (let lv = 1; lv <= max; lv++) {
    await grantCosmetic(prisma, userId, levelTitleCosmeticId(lv), "level");
  }
}

async function ensureLevelOneTitleCosmetic(prisma) {
  const id = levelTitleCosmeticId(1);
  const existing = await prisma.cosmetic.findUnique({ where: { id } });
  if (existing) return existing;
  let title = "มือใหม่";
  let color = "#94a3b8";
  try {
    const { loadLevelConfig } = require("./levels");
    const config = await loadLevelConfig(prisma);
    const row = (config.levels || []).find((x) => Number(x.level) === 1);
    if (row) {
      if (row.title) title = String(row.title).trim().slice(0, 64) || title;
      if (row.color) color = String(row.color);
    }
  } catch {
    /* use defaults */
  }
  return prisma.cosmetic.upsert({
    where: { id },
    update: {},
    create: {
      id,
      kind: "title",
      name: title,
      description: "ยศเลเวล 1 (เก็บได้ถาวร)",
      shopPrice: null,
      cssClass: "title-level-1",
      meta: { color, level: 1, source: "level" }
    }
  });
}

async function ensureStarterCosmetics(prisma, userId) {
  // Level 1 title is the real starter rank — avoid a second "มือใหม่" from title.rookie.
  await ensureLevelOneTitleCosmetic(prisma);
  await grantCosmetic(prisma, userId, levelTitleCosmeticId(1), "level");
  await grantCosmetic(prisma, userId, "frame.basic", "starter");
  await grantCosmetic(prisma, userId, "effect.none", "starter");
  try {
    await prisma.userCosmetic.deleteMany({
      where: { userId, cosmeticId: "title.rookie" }
    });
  } catch {
    /* ignore */
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { equippedTitleId: true, equippedFrameId: true, equippedEffectId: true }
  });
  if (!user) return;
  const data = {};
  if (!user.equippedTitleId || user.equippedTitleId === "title.rookie") {
    data.equippedTitleId = levelTitleCosmeticId(1);
  }
  if (!user.equippedFrameId) data.equippedFrameId = "frame.basic";
  if (!user.equippedEffectId) data.equippedEffectId = "effect.none";
  if (Object.keys(data).length) {
    await prisma.user.update({ where: { id: userId }, data });
  }
}

async function loadUserCosmetics(prisma, userId) {
  await ensureCosmeticsCatalog(prisma);
  try {
    const { loadLevelConfig } = require("./levels");
    const config = await loadLevelConfig(prisma);
    await syncLevelTitleCosmetics(prisma, config.levels);
  } catch {
    /* ignore */
  }
  const userLite = await prisma.user.findUnique({
    where: { id: userId },
    select: { level: true }
  });
  const level = Math.max(1, (userLite && userLite.level) || 1);
  await grantLevelTitlesUpTo(prisma, userId, level);
  await ensureStarterCosmetics(prisma, userId);
  const owned = await prisma.userCosmetic.findMany({
    where: { userId },
    include: { cosmetic: true },
    orderBy: { acquiredAt: "desc" }
  });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      equippedTitle: true,
      equippedFrame: true,
      equippedEffect: true
    }
  });
  // Hide legacy starter title so inventory never shows duplicate มือใหม่.
  const ownedPublic = owned
    .filter((row) => row.cosmetic && row.cosmetic.id !== "title.rookie")
    .map((row) => ({
      ...publicCosmetic(row.cosmetic),
      source: row.source,
      acquiredAt: row.acquiredAt
    }));
  return {
    owned: ownedPublic,
    equipped: equippedBundle(user || {})
  };
}

async function handleCosmeticsApi(req, res, pathname) {
  if (!authEnabled()) {
    sendJson(res, 503, { error: "auth_disabled" });
    return true;
  }

  if (pathname === "/api/v1/cosmetics/me") {
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const auth = await requireAuth(req, res);
    if (!auth) return true;
    if (auth.user.accountType !== "registered") {
      sendJson(res, 403, { error: "registered_required" });
      return true;
    }
    const data = await loadUserCosmetics(auth.prisma, auth.user.id);
    sendJson(res, 200, data);
    return true;
  }

  if (pathname === "/api/v1/cosmetics/equip") {
    if (method(req) !== "POST") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const auth = await requireAuth(req, res);
    if (!auth) return true;
    if (auth.user.accountType !== "registered") {
      sendJson(res, 403, { error: "registered_required" });
      return true;
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "invalid_json" });
      return true;
    }
    const cosmeticId = String(body.cosmeticId || "").trim();
    if (!cosmeticId) {
      sendJson(res, 400, { error: "invalid_input" });
      return true;
    }
    await ensureStarterCosmetics(auth.prisma, auth.user.id);
    const owned = await auth.prisma.userCosmetic.findUnique({
      where: { userId_cosmeticId: { userId: auth.user.id, cosmeticId } },
      include: { cosmetic: true }
    });
    if (!owned || !owned.cosmetic) {
      sendJson(res, 404, { error: "not_owned" });
      return true;
    }
    const kind = owned.cosmetic.kind;
    const data =
      kind === "title"
        ? { equippedTitleId: cosmeticId }
        : kind === "frame"
          ? { equippedFrameId: cosmeticId }
          : { equippedEffectId: cosmeticId };
    await auth.prisma.user.update({ where: { id: auth.user.id }, data });
    const fresh = await loadUserCosmetics(auth.prisma, auth.user.id);
    sendJson(res, 200, fresh);
    return true;
  }

  if (pathname === "/api/v1/shop/catalog") {
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const prisma = await getPrisma();
    await ensureCosmeticsCatalog(prisma);
    const items = await prisma.cosmetic.findMany({
      where: { shopPrice: { not: null } },
      orderBy: [{ kind: "asc" }, { shopPrice: "asc" }]
    });
    sendJson(res, 200, {
      comingSoon: true,
      items: items.map(publicCosmetic)
    });
    return true;
  }

  return false;
}

module.exports = {
  STARTER_COSMETICS,
  RANK_TITLE_IDS,
  publicCosmetic,
  equippedBundle,
  ensureCosmeticsCatalog,
  ensureStarterCosmetics,
  grantCosmetic,
  levelTitleCosmeticId,
  syncLevelTitleCosmetics,
  grantLevelTitlesUpTo,
  loadUserCosmetics,
  handleCosmeticsApi
};
