"use strict";

const { sendJson, readJsonBody } = require("../auth/http");
const { requireAuth } = require("../auth/middleware");
const { getPrisma, authEnabled } = require("../db");

const DEFAULT_LEVEL_CONFIG = {
  expWin: 40,
  expPlay: 15,
  levels: [
    { level: 1, exp: 0, title: "มือใหม่", color: "#94a3b8" },
    { level: 2, exp: 100, title: "ผู้ฝึกหัด", color: "#60a5fa" },
    { level: 3, exp: 250, title: "นักแข่ง", color: "#34d399" },
    { level: 4, exp: 500, title: "มือโปร", color: "#a78bfa" },
    { level: 5, exp: 900, title: "แชมป์", color: "#fbbf24" },
    { level: 6, exp: 1500, title: "ตำนาน", color: "#f97316" },
    { level: 7, exp: 2400, title: "มาสเตอร์", color: "#ef4444" },
    { level: 8, exp: 3600, title: "แกรนด์มาสเตอร์", color: "#ec4899" },
    { level: 9, exp: 5200, title: "ตำนานสูงสุด", color: "#e879f9" },
    { level: 10, exp: 7500, title: "NUMVERSE Elite", color: "#38bdf8" }
  ]
};

function method(req) {
  return String(req.method || "GET").toUpperCase();
}

function clampInt(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(v)));
}

function normalizeHexColor(raw, fallback) {
  const s = String(raw || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1],
      g = s[2],
      b = s[3];
    return ("#" + r + r + g + g + b + b).toLowerCase();
  }
  return fallback;
}

function normalizeLevels(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const cleaned = list
    .map((row, i) => {
      const level = clampInt(row && row.level, 1, 99, i + 1);
      const exp = clampInt(row && row.exp, 0, 10_000_000, i === 0 ? 0 : i * 100);
      const title = String((row && row.title) || "Level " + level)
        .trim()
        .slice(0, 32);
      const color = normalizeHexColor(row && row.color, DEFAULT_LEVEL_CONFIG.levels[Math.min(i, 9)].color);
      return { level, exp, title: title || "Level " + level, color };
    })
    .sort((a, b) => a.level - b.level || a.exp - b.exp);

  if (!cleaned.length) return DEFAULT_LEVEL_CONFIG.levels.map((x) => ({ ...x }));

  // Ensure first tier starts at 0 exp and levels are unique ascending.
  const out = [];
  const seen = new Set();
  for (const row of cleaned) {
    if (seen.has(row.level)) continue;
    seen.add(row.level);
    out.push(row);
  }
  out.sort((a, b) => a.level - b.level);
  out[0].exp = 0;
  for (let i = 1; i < out.length; i++) {
    if (out[i].exp <= out[i - 1].exp) out[i].exp = out[i - 1].exp + 1;
  }
  return out.slice(0, 50);
}

function normalizeConfig(raw) {
  const base = raw && typeof raw === "object" ? raw : {};
  return {
    expWin: clampInt(base.expWin, 0, 100000, DEFAULT_LEVEL_CONFIG.expWin),
    expPlay: clampInt(base.expPlay, 0, 100000, DEFAULT_LEVEL_CONFIG.expPlay),
    levels: normalizeLevels(base.levels)
  };
}

async function loadLevelConfig(prisma) {
  if (!prisma) return normalizeConfig(DEFAULT_LEVEL_CONFIG);
  const row = await prisma.systemSetting.findUnique({ where: { key: "level_config" } });
  return normalizeConfig(row && row.value);
}

async function ensureLevelConfig(prisma) {
  const existing = await prisma.systemSetting.findUnique({ where: { key: "level_config" } });
  let value;
  if (existing) value = normalizeConfig(existing.value);
  else {
    value = normalizeConfig(DEFAULT_LEVEL_CONFIG);
    await prisma.systemSetting.create({ data: { key: "level_config", value } });
  }
  try {
    const { syncLevelTitleCosmetics } = require("./cosmetics");
    // Cached inside sync — ไม่ upsert ยศทุกครั้งที่เปิดหน้า
    await syncLevelTitleCosmetics(prisma, value.levels);
  } catch {
    /* ignore */
  }
  return value;
}

function levelFromExp(config, totalExp) {
  const exp = Math.max(0, Number(totalExp) || 0);
  const levels = (config && config.levels) || DEFAULT_LEVEL_CONFIG.levels;
  let current = levels[0];
  for (const row of levels) {
    if (exp >= row.exp) current = row;
    else break;
  }
  const idx = levels.findIndex((r) => r.level === current.level);
  const next = idx >= 0 && idx < levels.length - 1 ? levels[idx + 1] : null;
  const floor = current.exp;
  const ceil = next ? next.exp : null;
  const into = Math.max(0, exp - floor);
  const need = ceil != null ? Math.max(1, ceil - floor) : 0;
  const pct = ceil == null ? 100 : Math.min(100, Math.round((into / need) * 1000) / 10);
  return {
    level: current.level,
    title: current.title,
    color: current.color,
    exp,
    currentExp: into,
    nextExp: ceil == null ? null : need,
    nextLevel: next ? next.level : null,
    nextTitle: next ? next.title : null,
    nextColor: next ? next.color : null,
    progressPct: pct,
    maxed: !next,
    tiers: levels
  };
}

async function applyExpGain(prisma, userId, gain, { notifyLevelUp = true } = {}) {
  const amount = Math.floor(Number(gain) || 0);
  if (!prisma || !userId || amount === 0) return null;
  const config = await loadLevelConfig(prisma);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, exp: true, level: true, accountType: true, status: true }
  });
  if (!user || user.accountType !== "registered" || user.status === "deleted") return null;

  const before = levelFromExp(config, user.exp || 0);
  const nextExp = Math.max(0, (user.exp || 0) + amount);
  const after = levelFromExp(config, nextExp);

  await prisma.user.update({
    where: { id: userId },
    data: { exp: nextExp, level: after.level }
  });

  try {
    const { grantLevelTitlesUpTo, syncLevelTitleCosmetics } = require("./cosmetics");
    await syncLevelTitleCosmetics(prisma, config.levels);
    await grantLevelTitlesUpTo(prisma, userId, after.level);
  } catch {
    /* ignore */
  }

  if (notifyLevelUp && after.level > before.level) {
    await prisma.notification
      .create({
        data: {
          userId,
          type: "level_up",
          title: `ขึ้นเลเวล ${after.level} แล้ว!`,
          body: `ได้ยศ「${after.title}」เก็บเข้าคลังแล้ว — สวมใส่ได้ที่เมนู ตกแต่ง`,
          payload: {
            kind: "level",
            level: after.level,
            title: after.title,
            color: after.color,
            href: "/app#decorate"
          }
        }
      })
      .catch(() => {});
  }

  return { gain: amount, before, after, exp: nextExp };
}

async function awardExp(prisma, userId, { won } = {}) {
  if (!prisma || !userId) return null;
  const config = await loadLevelConfig(prisma);
  const gain = (won ? config.expWin : 0) + config.expPlay;
  if (gain <= 0) return null;
  return applyExpGain(prisma, userId, gain);
}

/** Admin/system grant — returns result for notification fan-out. */
async function adminAddExp(prisma, userId, amount) {
  const gain = Math.floor(Number(amount) || 0);
  if (gain < 1 || gain > 1_000_000) {
    const err = new Error("invalid_amount");
    err.code = "invalid_amount";
    throw err;
  }
  return applyExpGain(prisma, userId, gain, { notifyLevelUp: true });
}

function progressPayload(user, config) {
  const progress = levelFromExp(config, user && user.exp);
  return {
    exp: progress.exp,
    level: progress.level,
    title: progress.title,
    color: progress.color,
    currentExp: progress.currentExp,
    nextExp: progress.nextExp,
    nextLevel: progress.nextLevel,
    nextTitle: progress.nextTitle,
    nextColor: progress.nextColor,
    progressPct: progress.progressPct,
    maxed: progress.maxed,
    rewards: {
      expWin: config.expWin,
      expPlay: config.expPlay
    },
    tiers: progress.tiers
  };
}

async function handleLevelsApi(req, res, pathname) {
  if (!pathname.startsWith("/api/v1/levels")) return false;
  if (!authEnabled()) {
    sendJson(res, 503, { error: "auth_disabled" });
    return true;
  }
  const prisma = await getPrisma();

  if (pathname === "/api/v1/levels/me" && method(req) === "GET") {
    const auth = await requireAuth(req, res);
    if (!auth) return true;
    const config = await ensureLevelConfig(prisma);
    const user = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { exp: true, level: true, accountType: true }
    });
    sendJson(res, 200, { progress: progressPayload(user || { exp: 0, level: 1 }, config) });
    return true;
  }

  if (pathname === "/api/v1/levels/config" && method(req) === "GET") {
    const config = await ensureLevelConfig(prisma);
    sendJson(res, 200, { config });
    return true;
  }

  sendJson(res, 404, { error: "not_found" });
  return true;
}

async function handleAdminLevelsApi(req, res, pathname) {
  if (!pathname.startsWith("/api/v1/admin/levels")) return false;
  const { requireAdmin, userHasPermission } = require("../auth/middleware");
  const { writeAdminLog } = require("../admin/audit");
  const prisma = await getPrisma();

  if (pathname === "/api/v1/admin/levels" && method(req) === "GET") {
    const auth = await requireAdmin(req, res);
    if (!auth) return true;
    if (
      !userHasPermission(auth.user, "levels.view") &&
      !userHasPermission(auth.user, "settings.view")
    ) {
      sendJson(res, 403, { error: "permission_denied", permission: "levels.view" });
      return true;
    }
    const config = await ensureLevelConfig(prisma);
    sendJson(res, 200, { config });
    return true;
  }

  if (pathname === "/api/v1/admin/levels" && method(req) === "PUT") {
    const auth = await requireAdmin(req, res);
    if (!auth) return true;
    if (
      !userHasPermission(auth.user, "levels.manage") &&
      !userHasPermission(auth.user, "settings.manage")
    ) {
      sendJson(res, 403, { error: "permission_denied", permission: "levels.manage" });
      return true;
    }
    const body = await readJsonBody(req).catch(() => null);
    if (!body || !body.config || typeof body.config !== "object") {
      sendJson(res, 400, { error: "invalid_body" });
      return true;
    }
    const config = normalizeConfig(body.config);
    await prisma.systemSetting.upsert({
      where: { key: "level_config" },
      update: { value: config },
      create: { key: "level_config", value: config }
    });
    try {
      const { syncLevelTitleCosmetics } = require("./cosmetics");
      await syncLevelTitleCosmetics(prisma, config.levels, { force: true });
    } catch {
      /* ignore */
    }
    try {
      await writeAdminLog(prisma, {
        adminId: auth.user.id,
        action: "levels.update",
        metadata: { tiers: config.levels.length, expWin: config.expWin, expPlay: config.expPlay }
      });
    } catch {
      /* optional */
    }
    sendJson(res, 200, { config });
    return true;
  }

  sendJson(res, 405, { error: "method_not_allowed" });
  return true;
}

module.exports = {
  DEFAULT_LEVEL_CONFIG,
  normalizeConfig,
  loadLevelConfig,
  ensureLevelConfig,
  levelFromExp,
  awardExp,
  applyExpGain,
  adminAddExp,
  progressPayload,
  handleLevelsApi,
  handleAdminLevelsApi
};
