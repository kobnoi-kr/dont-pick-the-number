"use strict";

const { sendJson, readJsonBody } = require("../auth/http");
const { requireAuth } = require("../auth/middleware");
const { getPrisma, authEnabled } = require("../db");

/** 33 base names × I/II/III = Lv.1–99 · Lv.100 = NUMVERSE Elite */
const RANK_BASE_TITLES = [
  "มือใหม่",
  "ผู้ฝึกหัด",
  "นักสำรวจ",
  "นักแข่ง",
  "นักกลยุทธ์",
  "นักล่าเลข",
  "ผู้กล้า",
  "นักรบ",
  "มือโปร",
  "อัศวิน",
  "จ้าวสนาม",
  "นักล่าชัย",
  "แชมป์",
  "ผู้พิชิต",
  "วีรบุรุษ",
  "มาสเตอร์",
  "ปรมาจารย์",
  "ตำนาน",
  "มายา",
  "เทพเกม",
  "จักรพรรดิ",
  "ทวยเทพ",
  "มหาเทพ",
  "อวตาร",
  "นิรันดร์",
  "จักรวาล",
  "มิติ",
  "อภิมหา",
  "สุดยอด",
  "แกรนด์มาสเตอร์",
  "สุดขอบฟ้า",
  "เหนือชั้น",
  "อมตะ"
];

const RANK_ROMANS = ["I", "II", "III"];

const RANK_PALETTE = [
  "#94a3b8",
  "#64748b",
  "#60a5fa",
  "#3b82f6",
  "#22d3ee",
  "#14b8a6",
  "#34d399",
  "#4ade80",
  "#a3e635",
  "#facc15",
  "#fbbf24",
  "#fb923c",
  "#f97316",
  "#a78bfa",
  "#8b5cf6",
  "#c084fc",
  "#e879f9",
  "#f472b6",
  "#fb7185",
  "#f43f5e",
  "#ef4444",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#10b981",
  "#06b6d4",
  "#0ea5e9",
  "#6366f1",
  "#8b5cf6",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#e2e8f0" // อมตะ — Elite keeps brand cyan separately
];

function expForLevel(level) {
  const L = Math.max(1, Number(level) || 1);
  if (L <= 1) return 0;
  // Gentle curve · ~Lv.100 ≈ 42k total EXP (≈1.0–1.4k matches at current rates)
  return Math.round(50 * Math.pow(L - 1, 1.45));
}

function buildDefaultLevels() {
  const levels = [];
  for (let i = 0; i < RANK_BASE_TITLES.length; i++) {
    const base = RANK_BASE_TITLES[i];
    const color = RANK_PALETTE[i % RANK_PALETTE.length];
    for (let r = 0; r < RANK_ROMANS.length; r++) {
      const level = i * 3 + r + 1;
      levels.push({
        level,
        exp: expForLevel(level),
        title: base + " " + RANK_ROMANS[r],
        color
      });
    }
  }
  // Lv.100 — unique capstone (no Roman numeral)
  levels.push({
    level: 100,
    exp: expForLevel(100),
    title: "NUMVERSE Elite",
    color: "#38bdf8"
  });
  return levels;
}

const DEFAULT_LEVEL_CONFIG = {
  expWin: 40,
  expPlay: 15,
  levels: buildDefaultLevels()
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
  const defaults = DEFAULT_LEVEL_CONFIG.levels;
  const cleaned = list
    .map((row, i) => {
      const level = clampInt(row && row.level, 1, 100, i + 1);
      const exp = clampInt(row && row.exp, 0, 10_000_000, i === 0 ? 0 : i * 100);
      const title = String((row && row.title) || "Level " + level)
        .trim()
        .slice(0, 32);
      const fallbackColor = defaults[Math.min(i, defaults.length - 1)].color;
      const color = normalizeHexColor(row && row.color, fallbackColor);
      return { level, exp, title: title || "Level " + level, color };
    })
    .sort((a, b) => a.level - b.level || a.exp - b.exp);

  if (!cleaned.length) return defaults.map((x) => ({ ...x }));

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
  return out.slice(0, 100);
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

function looksLikeLegacyTenTier(config) {
  const levels = (config && config.levels) || [];
  if (levels.length !== 10) return false;
  const last = levels[levels.length - 1];
  return Number(last && last.level) === 10 && String(last && last.title) === "NUMVERSE Elite";
}

async function ensureLevelConfig(prisma) {
  const existing = await prisma.systemSetting.findUnique({ where: { key: "level_config" } });
  let value;
  if (existing) {
    value = normalizeConfig(existing.value);
    // Auto-upgrade the original 10-tier pack → 100 ranks (Elite at 100).
    if (looksLikeLegacyTenTier(value)) {
      value = normalizeConfig(DEFAULT_LEVEL_CONFIG);
      await prisma.systemSetting.update({
        where: { key: "level_config" },
        data: { value }
      });
    }
  } else {
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
    try {
      const { createUserNotification } = require("./notify");
      await createUserNotification(prisma, {
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
        },
        push: { level: after.level, href: "/app#decorate" }
      });
    } catch {
      /* ignore */
    }
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
  RANK_BASE_TITLES,
  buildDefaultLevels,
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
