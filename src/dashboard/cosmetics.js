"use strict";

const fs = require("fs");
const path = require("path");
const { sendJson, readJsonBody, clientIp } = require("../auth/http");
const { requireAuth } = require("../auth/middleware");
const { getPrisma, authEnabled } = require("../db");

const PUBLIC_DIR = path.join(__dirname, "..", "..", "public");
const COSMETIC_UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads", "cosmetics");
const COSMETIC_IMAGE_MAX_BYTES = 1_500_000;

function parseDataUrlImage(dataUrl) {
  const m = String(dataUrl || "").match(
    /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/i
  );
  if (!m) return null;
  const extRaw = m[1].toLowerCase();
  const ext = extRaw === "jpeg" ? "jpg" : extRaw;
  let buf;
  try {
    buf = Buffer.from(String(m[2]).replace(/\s+/g, ""), "base64");
  } catch {
    return null;
  }
  if (!buf || buf.length < 24 || buf.length > COSMETIC_IMAGE_MAX_BYTES) return null;
  return { ext, buf };
}

function saveCosmeticImage(dataUrl, idHint) {
  const parsed = parseDataUrlImage(dataUrl);
  if (!parsed) return null;
  fs.mkdirSync(COSMETIC_UPLOAD_DIR, { recursive: true });
  const safe = String(idHint || "cos")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "cos";
  const name = `${safe}-${Date.now().toString(36)}.${parsed.ext}`;
  fs.writeFileSync(path.join(COSMETIC_UPLOAD_DIR, name), parsed.buf);
  return `/uploads/cosmetics/${name}`;
}

/** Accept https URL, /uploads/cosmetics path, or data URL (saved to disk). */
function resolveCosmeticImageUrl(value, idHint) {
  if (value == null) return { ok: true, url: null };
  const raw = String(value).trim();
  if (!raw) return { ok: true, url: null };
  if (/^https:\/\/[^\s]{1,2000}$/i.test(raw)) {
    return { ok: true, url: raw.slice(0, 2000) };
  }
  if (/^\/uploads\/cosmetics\/[a-z0-9._-]+\.(png|jpe?g|webp|gif)$/i.test(raw)) {
    return { ok: true, url: raw };
  }
  if (raw.startsWith("data:image/")) {
    const saved = saveCosmeticImage(raw, idHint);
    if (!saved) return { ok: false, error: "invalid_image" };
    return { ok: true, url: saved };
  }
  return { ok: false, error: "invalid_image" };
}

function cosmeticImageOf(c) {
  if (!c || !c.meta || typeof c.meta !== "object") return null;
  const url = c.meta.imageUrl || c.meta.mediaUrl || null;
  return url ? String(url) : null;
}

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
    description: "กรอบตัวอย่าง — โทนทอง",
    shopPrice: null,
    cssClass: "frame-gold",
    meta: { color: "#fbbf24", sample: true }
  },
  {
    id: "frame.neon",
    kind: "frame",
    name: "กรอบนีออน",
    description: "กรอบตัวอย่าง — ขอบนีออนฟ้าชมพู",
    shopPrice: null,
    cssClass: "frame-neon",
    meta: { color: "#22d3ee", sample: true }
  },
  {
    id: "frame.ice",
    kind: "frame",
    name: "กรอบน้ำแข็ง",
    description: "กรอบตัวอย่าง — เย็นสดใส",
    shopPrice: null,
    cssClass: "frame-ice",
    meta: { color: "#93c5fd", sample: true }
  },
  {
    id: "frame.crimson",
    kind: "frame",
    name: "กรอบแดงโลหิต",
    description: "กรอบตัวอย่าง — แดงเข้ม",
    shopPrice: null,
    cssClass: "frame-crimson",
    meta: { color: "#ef4444", sample: true }
  },
  {
    id: "effect.sparkle",
    kind: "effect",
    name: "ประกาย",
    description: "เอฟเฟกต์ตัวอย่าง — กระพริบเบาๆ",
    shopPrice: null,
    cssClass: "effect-sparkle",
    meta: { color: "#a78bfa", sample: true }
  },
  {
    id: "effect.pulse",
    kind: "effect",
    name: "ชีพจร",
    description: "เอฟเฟกต์ตัวอย่าง — เต้นเป็นจังหวะ",
    shopPrice: null,
    cssClass: "effect-pulse",
    meta: { color: "#34d399", sample: true }
  },
  {
    id: "effect.ring",
    kind: "effect",
    name: "วงแหวน",
    description: "เอฟเฟกต์ตัวอย่าง — วงแสงหมุน",
    shopPrice: null,
    cssClass: "effect-ring",
    meta: { color: "#60a5fa", sample: true }
  },
  {
    id: "effect.flame",
    kind: "effect",
    name: "เปลวไฟ",
    description: "เอฟเฟกต์ตัวอย่าง — โทนไฟอุ่น",
    shopPrice: null,
    cssClass: "effect-flame",
    meta: { color: "#f97316", sample: true }
  }
];

function method(req) {
  return String(req.method || "GET").toUpperCase();
}

function publicCosmetic(c) {
  if (!c) return null;
  const meta = c.meta && typeof c.meta === "object" ? Object.assign({}, c.meta) : {};
  const imageUrl = cosmeticImageOf(c);
  if (imageUrl) meta.imageUrl = imageUrl;
  return {
    id: c.id,
    kind: c.kind,
    name: c.name,
    description: c.description || null,
    shopPrice: c.shopPrice == null ? null : c.shopPrice,
    cssClass: c.cssClass || null,
    imageUrl,
    meta: Object.keys(meta).length ? meta : null
  };
}

function equippedBundle(user) {
  return {
    title: publicCosmetic(user.equippedTitle),
    frame: publicCosmetic(user.equippedFrame),
    effect: publicCosmetic(user.equippedEffect)
  };
}

const COSMETICS_TTL_MS = 15 * 60 * 1000;
let cosmeticsEnsuredAt = 0;
let cosmeticsEnsurePromise = null;
let levelTitlesSyncHash = "";
let levelTitlesSyncPromise = null;

async function ensureCosmeticsCatalog(prisma, opts) {
  const force = !!(opts && opts.force);
  if (!prisma) return;
  const now = Date.now();
  if (!force && cosmeticsEnsuredAt && now - cosmeticsEnsuredAt < COSMETICS_TTL_MS) return;
  if (!force && cosmeticsEnsurePromise) return cosmeticsEnsurePromise;

  cosmeticsEnsurePromise = (async () => {
    try {
      await Promise.all(
        STARTER_COSMETICS.map((item) =>
          prisma.cosmetic.upsert({
            where: { id: item.id },
            update: {
              kind: item.kind,
              name: item.name,
              description: item.description,
              // Keep admin shopPrice; only seed creates with catalog default
              cssClass: item.cssClass,
              meta: item.meta
            },
            create: item
          })
        )
      );
      cosmeticsEnsuredAt = Date.now();
    } finally {
      cosmeticsEnsurePromise = null;
    }
  })();
  return cosmeticsEnsurePromise;
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
async function syncLevelTitleCosmetics(prisma, levels, opts) {
  const force = !!(opts && opts.force);
  const list = Array.isArray(levels) ? levels : [];
  const hash = JSON.stringify(
    list.map((row) => [Number(row && row.level) || 0, String((row && row.title) || ""), String((row && row.color) || "")])
  );
  if (!force && hash && hash === levelTitlesSyncHash) return;
  if (!force && levelTitlesSyncPromise) return levelTitlesSyncPromise;

  levelTitlesSyncPromise = (async () => {
    try {
      const jobs = [];
      for (const row of list) {
        const level = Number(row && row.level) || 0;
        if (level < 1) continue;
        const id = levelTitleCosmeticId(level);
        const name =
          String((row && row.title) || "Level " + level).trim().slice(0, 64) || "Level " + level;
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
        jobs.push(
          prisma.cosmetic.upsert({
            where: { id },
            update: {
              kind: item.kind,
              name: item.name,
              description: item.description,
              cssClass: item.cssClass,
              meta: item.meta
            },
            create: item
          })
        );
      }
      if (jobs.length) await Promise.all(jobs);
      levelTitlesSyncHash = hash;
    } finally {
      levelTitlesSyncPromise = null;
    }
  })();
  return levelTitlesSyncPromise;
}

/** Grant every unlocked level title up to current level — keeps forever. */
async function grantLevelTitlesUpTo(prisma, userId, level) {
  const max = Math.max(0, Number(level) || 0);
  if (max < 1) return;
  const owned = await prisma.userCosmetic.findMany({
    where: { userId, cosmeticId: { startsWith: "title.level." } },
    select: { cosmeticId: true }
  });
  const have = new Set(owned.map((row) => row.cosmeticId));
  const missing = [];
  for (let lv = 1; lv <= max; lv++) {
    const id = levelTitleCosmeticId(lv);
    if (!have.has(id)) missing.push(id);
  }
  if (!missing.length) return;
  await Promise.all(missing.map((id) => grantCosmetic(prisma, userId, id, "level")));
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
  const level1 = levelTitleCosmeticId(1);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      equippedTitleId: true,
      equippedFrameId: true,
      equippedEffectId: true,
      cosmetics: {
        where: { cosmeticId: { in: [level1, "frame.basic", "effect.none", "title.rookie"] } },
        select: { cosmeticId: true }
      }
    }
  });
  if (!user) return;

  const have = new Set((user.cosmetics || []).map((row) => row.cosmeticId));
  const needsLevel1 = !have.has(level1);
  const needsFrame = !have.has("frame.basic");
  const needsEffect = !have.has("effect.none");
  const hasRookie = have.has("title.rookie");
  const needsEquipFix =
    !user.equippedTitleId ||
    user.equippedTitleId === "title.rookie" ||
    !user.equippedFrameId ||
    !user.equippedEffectId;

  // Fast path: ของเริ่มต้นครบและสวมถูกต้องแล้ว
  if (!needsLevel1 && !needsFrame && !needsEffect && !hasRookie && !needsEquipFix) return;

  await ensureLevelOneTitleCosmetic(prisma);
  const grants = [];
  if (needsLevel1) grants.push(grantCosmetic(prisma, userId, level1, "level"));
  if (needsFrame) grants.push(grantCosmetic(prisma, userId, "frame.basic", "starter"));
  if (needsEffect) grants.push(grantCosmetic(prisma, userId, "effect.none", "starter"));
  if (grants.length) await Promise.all(grants);

  if (hasRookie) {
    try {
      await prisma.userCosmetic.deleteMany({
        where: { userId, cosmeticId: "title.rookie" }
      });
    } catch {
      /* ignore */
    }
  }

  const data = {};
  if (!user.equippedTitleId || user.equippedTitleId === "title.rookie") {
    data.equippedTitleId = level1;
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
  await Promise.all([
    grantLevelTitlesUpTo(prisma, userId, level),
    ensureStarterCosmetics(prisma, userId)
  ]);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      equippedTitle: true,
      equippedFrame: true,
      equippedEffect: true,
      cosmetics: {
        include: { cosmetic: true },
        orderBy: { acquiredAt: "desc" }
      }
    }
  });
  // Hide legacy starter title so inventory never shows duplicate มือใหม่.
  const ownedPublic = ((user && user.cosmetics) || [])
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

const KIND_TH = { title: "ยศ", frame: "กรอบ", effect: "เอฟเฟกต์" };

async function resolveGiftTarget(prisma, body) {
  const userId = String((body && body.userId) || "").trim();
  const username = String((body && body.username) || "").trim();
  if (userId) {
    return prisma.user.findUnique({ where: { id: userId } });
  }
  if (username) {
    return prisma.user.findFirst({
      where: {
        username: { equals: username, mode: "insensitive" },
        status: { not: "deleted" }
      }
    });
  }
  return null;
}

async function adminGiftCosmetic(prisma, { targetUserId, cosmeticId, autoEquip, source }) {
  await ensureCosmeticsCatalog(prisma);
  const cosmetic = await prisma.cosmetic.findUnique({ where: { id: cosmeticId } });
  if (!cosmetic) {
    const err = new Error("cosmetic_not_found");
    err.code = "cosmetic_not_found";
    throw err;
  }
  const already = await prisma.userCosmetic.findUnique({
    where: { userId_cosmeticId: { userId: targetUserId, cosmeticId } }
  });
  await grantCosmetic(prisma, targetUserId, cosmeticId, source || "admin_gift");
  let equipped = false;
  if (autoEquip) {
    const data =
      cosmetic.kind === "title"
        ? { equippedTitleId: cosmeticId }
        : cosmetic.kind === "frame"
          ? { equippedFrameId: cosmeticId }
          : { equippedEffectId: cosmeticId };
    await prisma.user.update({ where: { id: targetUserId }, data });
    equipped = true;
  }
  return { cosmetic: publicCosmetic(cosmetic), alreadyOwned: !!already, equipped };
}

async function handleAdminCosmeticsApi(req, res, pathname) {
  if (!pathname.startsWith("/api/v1/admin/cosmetics")) return false;
  const { requireAdmin, userHasPermission } = require("../auth/middleware");
  const { writeAdminLog } = require("../admin/audit");
  const { getGameApi } = require("./bridge");
  const prisma = await getPrisma();

  if (pathname === "/api/v1/admin/cosmetics" && method(req) === "GET") {
    const auth = await requireAdmin(req, res);
    if (!auth) return true;
    if (!userHasPermission(auth.user, "cosmetics.gift") && !userHasPermission(auth.user, "users.ban")) {
      sendJson(res, 403, { error: "permission_denied", permission: "cosmetics.gift" });
      return true;
    }
    await ensureCosmeticsCatalog(prisma);
    try {
      const { loadLevelConfig } = require("./levels");
      const config = await loadLevelConfig(prisma);
      await syncLevelTitleCosmetics(prisma, config.levels);
    } catch {
      /* ignore */
    }
    const items = await prisma.cosmetic.findMany({
      orderBy: [{ kind: "asc" }, { name: "asc" }]
    });
    // Hide legacy title.rookie so Gift ไม่โชว์มือใหม่ซ้ำกับยศเลเวล 1
    sendJson(res, 200, {
      items: items.filter((c) => c.id !== "title.rookie").map(publicCosmetic)
    });
    return true;
  }

  if (pathname === "/api/v1/admin/cosmetics/owned" && method(req) === "GET") {
    const auth = await requireAdmin(req, res);
    if (!auth) return true;
    if (!userHasPermission(auth.user, "cosmetics.gift") && !userHasPermission(auth.user, "users.ban")) {
      sendJson(res, 403, { error: "permission_denied", permission: "cosmetics.gift" });
      return true;
    }
    const url = new URL(req.url || "/", "http://localhost");
    const userId = String(url.searchParams.get("userId") || "").trim();
    if (!userId) {
      sendJson(res, 400, { error: "invalid_input" });
      return true;
    }
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        status: true,
        equippedTitleId: true,
        equippedFrameId: true,
        equippedEffectId: true
      }
    });
    if (!target || target.status === "deleted") {
      sendJson(res, 404, { error: "user_not_found" });
      return true;
    }
    const owned = await prisma.userCosmetic.findMany({
      where: { userId },
      include: { cosmetic: true },
      orderBy: { acquiredAt: "desc" }
    });
    sendJson(res, 200, {
      user: {
        id: target.id,
        username: target.username,
        displayName: target.displayName
      },
      equipped: {
        titleId: target.equippedTitleId || null,
        frameId: target.equippedFrameId || null,
        effectId: target.equippedEffectId || null
      },
      owned: owned
        .filter((row) => row.cosmetic && row.cosmetic.id !== "title.rookie")
        .map((row) => ({
          ...publicCosmetic(row.cosmetic),
          source: row.source,
          acquiredAt: row.acquiredAt
        }))
    });
    return true;
  }

  if (pathname === "/api/v1/admin/cosmetics/gift" && method(req) === "POST") {
    const auth = await requireAdmin(req, res);
    if (!auth) return true;
    if (!userHasPermission(auth.user, "cosmetics.gift") && !userHasPermission(auth.user, "users.ban")) {
      sendJson(res, 403, { error: "permission_denied", permission: "cosmetics.gift" });
      return true;
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "invalid_json" });
      return true;
    }
    const cosmeticId = String((body && body.cosmeticId) || "").trim();
    if (!cosmeticId) {
      sendJson(res, 400, { error: "invalid_input" });
      return true;
    }
    const target = await resolveGiftTarget(prisma, body || {});
    if (!target || target.status === "deleted") {
      sendJson(res, 404, { error: "user_not_found" });
      return true;
    }
    if (target.accountType !== "registered") {
      sendJson(res, 400, { error: "registered_required" });
      return true;
    }
    const autoEquip = !!(body && body.autoEquip);
    const note = String((body && body.note) || "").trim().slice(0, 200);
    let result;
    try {
      result = await adminGiftCosmetic(prisma, {
        targetUserId: target.id,
        cosmeticId,
        autoEquip,
        source: "admin_gift"
      });
    } catch (err) {
      if (err && err.code === "cosmetic_not_found") {
        sendJson(res, 404, { error: "cosmetic_not_found" });
        return true;
      }
      throw err;
    }

    const kindLabel = KIND_TH[result.cosmetic.kind] || result.cosmetic.kind;
    const title = "ได้รับของจากแอดมิน";
    const bodyText = result.alreadyOwned
      ? `แอดมินยืนยันของ ${kindLabel}「${result.cosmetic.name}」ให้คุณแล้ว` +
        (result.equipped ? " และสวมให้แล้ว" : "")
      : `แอดมินมอบ ${kindLabel}「${result.cosmetic.name}」ให้คุณ` +
        (result.equipped ? " และสวมให้แล้ว" : " — ไปสวมได้ที่เมนู ตกแต่ง");
    await prisma.notification.create({
      data: {
        userId: target.id,
        type: "system_grant",
        title,
        body: bodyText,
        payload: {
          kind: "admin_gift",
          fullBody:
            bodyText +
            (note ? "\n\nข้อความจากแอดมิน: " + note : "") +
            "\n\nเปิดเมนู ตกแต่ง เพื่อดูของในคลัง",
          cosmeticId: result.cosmetic.id,
          cosmeticKind: result.cosmetic.kind,
          cosmeticName: result.cosmetic.name,
          autoEquip: result.equipped,
          note: note || null,
          href: "/app#decorate"
        }
      }
    });
    const gameApi = getGameApi();
    if (gameApi && typeof gameApi.notifyUser === "function") {
      try {
        gameApi.notifyUser(target.id, { type: "system_grant" });
      } catch {
        /* ignore */
      }
    }
    await writeAdminLog(prisma, {
      adminId: auth.user.id,
      action: "cosmetics.gift",
      targetId: target.id,
      metadata: {
        cosmeticId: result.cosmetic.id,
        kind: result.cosmetic.kind,
        name: result.cosmetic.name,
        alreadyOwned: result.alreadyOwned,
        autoEquip: result.equipped,
        note: note || null
      },
      ipAddress: clientIp(req)
    });
    sendJson(res, 200, {
      ok: true,
      user: {
        id: target.id,
        username: target.username,
        displayName: target.displayName
      },
      ...result
    });
    return true;
  }

  function canManageShop(user, userHasPermission) {
    return (
      userHasPermission(user, "cosmetics.gift") ||
      userHasPermission(user, "users.ban") ||
      userHasPermission(user, "settings.view") ||
      userHasPermission(user, "settings.manage")
    );
  }

  // List shop-listed items + frame/effect catalog for admin shop manager
  if (pathname === "/api/v1/admin/cosmetics/shop" && method(req) === "GET") {
    const auth = await requireAdmin(req, res);
    if (!auth) return true;
    if (!canManageShop(auth.user, userHasPermission)) {
      sendJson(res, 403, { error: "permission_denied", permission: "cosmetics.gift" });
      return true;
    }
    await ensureCosmeticsCatalog(prisma);
    const items = await prisma.cosmetic.findMany({
      where: { kind: { in: ["frame", "effect"] } },
      orderBy: [{ kind: "asc" }, { name: "asc" }]
    });
    const listed = items.filter((c) => c.shopPrice != null).map(publicCosmetic);
    const catalog = items
      .filter((c) => c.id !== "frame.basic" && c.id !== "effect.none")
      .map(publicCosmetic);
    sendJson(res, 200, { listed, catalog });
    return true;
  }

  // Upload image/GIF for frame/effect (returns /uploads/cosmetics/…)
  if (pathname === "/api/v1/admin/cosmetics/upload" && method(req) === "POST") {
    const auth = await requireAdmin(req, res);
    if (!auth) return true;
    if (!canManageShop(auth.user, userHasPermission)) {
      sendJson(res, 403, { error: "permission_denied", permission: "cosmetics.gift" });
      return true;
    }
    let body;
    try {
      body = await readJsonBody(req, 2 * 1024 * 1024);
    } catch (err) {
      sendJson(res, 400, { error: (err && err.code) || "invalid_json" });
      return true;
    }
    const hint = String((body && (body.id || body.name)) || "cos").slice(0, 40);
    const imageRes = resolveCosmeticImageUrl(body && body.imageUrl, hint);
    if (!imageRes.ok || !imageRes.url) {
      sendJson(res, 400, { error: imageRes.error || "invalid_image" });
      return true;
    }
    sendJson(res, 200, { ok: true, url: imageRes.url });
    return true;
  }

  // Create frame/effect (optional shop listing via shopPrice)
  if (pathname === "/api/v1/admin/cosmetics" && method(req) === "POST") {
    const auth = await requireAdmin(req, res);
    if (!auth) return true;
    if (!canManageShop(auth.user, userHasPermission)) {
      sendJson(res, 403, { error: "permission_denied", permission: "cosmetics.gift" });
      return true;
    }
    let body;
    try {
      body = await readJsonBody(req, 2 * 1024 * 1024);
    } catch (err) {
      sendJson(res, 400, { error: (err && err.code) || "invalid_json" });
      return true;
    }
    const kind = String((body && body.kind) || "").trim();
    if (kind !== "frame" && kind !== "effect") {
      sendJson(res, 400, { error: "invalid_kind" });
      return true;
    }
    const name = String((body && body.name) || "").trim().slice(0, 64);
    if (!name) {
      sendJson(res, 400, { error: "invalid_name" });
      return true;
    }
    const description = String((body && body.description) || "").trim().slice(0, 255) || null;
    let cssClass = String((body && body.cssClass) || "").trim().slice(0, 64);
    const colorRaw = String((body && body.color) || "").trim();
    const color = /^#[0-9a-fA-F]{6}$/.test(colorRaw) ? colorRaw.toLowerCase() : null;
    let shopPrice = null;
    if (body && body.shopPrice != null && body.shopPrice !== "") {
      const n = Number(body.shopPrice);
      if (!Number.isFinite(n) || n < 0 || n > 1000000 || Math.floor(n) !== n) {
        sendJson(res, 400, { error: "invalid_shop_price" });
        return true;
      }
      shopPrice = n;
    }
    let id = String((body && body.id) || "").trim().slice(0, 64);
    if (!id) {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ".")
        .replace(/^\.+|\.+$/g, "")
        .slice(0, 40) || "custom";
      id = `${kind}.${slug}.${Date.now().toString(36).slice(-6)}`;
    }
    if (!/^[a-z][a-z0-9._-]{1,63}$/i.test(id)) {
      sendJson(res, 400, { error: "invalid_id" });
      return true;
    }
    if (!id.startsWith(kind + ".")) {
      id = `${kind}.${id}`;
      if (id.length > 64) {
        sendJson(res, 400, { error: "invalid_id" });
        return true;
      }
    }
    if (!cssClass) {
      cssClass = id.replace(/\./g, "-");
    }
    const existing = await prisma.cosmetic.findUnique({ where: { id } });
    if (existing) {
      sendJson(res, 409, { error: "cosmetic_exists" });
      return true;
    }
    const imageRes = resolveCosmeticImageUrl(body && body.imageUrl, id);
    if (!imageRes.ok) {
      sendJson(res, 400, { error: imageRes.error || "invalid_image" });
      return true;
    }
    const meta = Object.assign(
      {},
      color ? { color } : {},
      imageRes.url ? { imageUrl: imageRes.url } : {},
      { adminCreated: true }
    );
    const created = await prisma.cosmetic.create({
      data: {
        id,
        kind,
        name,
        description,
        shopPrice,
        cssClass,
        meta
      }
    });
    cosmeticsEnsuredAt = 0;
    await writeAdminLog(prisma, {
      adminId: auth.user.id,
      action: "cosmetics.create",
      targetId: null,
      metadata: {
        cosmeticId: created.id,
        kind: created.kind,
        name: created.name,
        shopPrice: created.shopPrice
      },
      ipAddress: clientIp(req)
    });
    sendJson(res, 200, { ok: true, item: publicCosmetic(created) });
    return true;
  }

  // PATCH shop price / listing fields for an existing cosmetic
  if (pathname === "/api/v1/admin/cosmetics/shop" && method(req) === "PATCH") {
    const auth = await requireAdmin(req, res);
    if (!auth) return true;
    if (!canManageShop(auth.user, userHasPermission)) {
      sendJson(res, 403, { error: "permission_denied", permission: "cosmetics.gift" });
      return true;
    }
    let body;
    try {
      body = await readJsonBody(req, 2 * 1024 * 1024);
    } catch (err) {
      sendJson(res, 400, { error: (err && err.code) || "invalid_json" });
      return true;
    }
    const cosmeticId = String((body && body.cosmeticId) || (body && body.id) || "").trim();
    if (!cosmeticId) {
      sendJson(res, 400, { error: "invalid_input" });
      return true;
    }
    const cosmetic = await prisma.cosmetic.findUnique({ where: { id: cosmeticId } });
    if (!cosmetic) {
      sendJson(res, 404, { error: "cosmetic_not_found" });
      return true;
    }
    if (cosmetic.kind !== "frame" && cosmetic.kind !== "effect") {
      sendJson(res, 400, { error: "invalid_kind" });
      return true;
    }
    if (cosmetic.id === "frame.basic" || cosmetic.id === "effect.none") {
      sendJson(res, 400, { error: "protected_cosmetic" });
      return true;
    }
    const data = {};
    if (body && Object.prototype.hasOwnProperty.call(body, "shopPrice")) {
      if (body.shopPrice === null || body.shopPrice === "") {
        data.shopPrice = null;
      } else {
        const n = Number(body.shopPrice);
        if (!Number.isFinite(n) || n < 0 || n > 1000000 || Math.floor(n) !== n) {
          sendJson(res, 400, { error: "invalid_shop_price" });
          return true;
        }
        data.shopPrice = n;
      }
    }
    if (body && body.name != null) {
      const name = String(body.name).trim().slice(0, 64);
      if (!name) {
        sendJson(res, 400, { error: "invalid_name" });
        return true;
      }
      data.name = name;
    }
    if (body && Object.prototype.hasOwnProperty.call(body, "description")) {
      data.description = String(body.description || "").trim().slice(0, 255) || null;
    }
    let metaPatch = null;
    if (body && body.color != null) {
      const colorRaw = String(body.color || "").trim();
      metaPatch = Object.assign({}, cosmetic.meta || {});
      if (colorRaw === "") {
        delete metaPatch.color;
      } else if (/^#[0-9a-fA-F]{6}$/.test(colorRaw)) {
        metaPatch.color = colorRaw.toLowerCase();
      } else {
        sendJson(res, 400, { error: "invalid_color" });
        return true;
      }
    }
    if (body && Object.prototype.hasOwnProperty.call(body, "imageUrl")) {
      const imageRes = resolveCosmeticImageUrl(body.imageUrl, cosmetic.id);
      if (!imageRes.ok) {
        sendJson(res, 400, { error: imageRes.error || "invalid_image" });
        return true;
      }
      metaPatch = Object.assign({}, metaPatch || cosmetic.meta || {});
      if (!imageRes.url) delete metaPatch.imageUrl;
      else metaPatch.imageUrl = imageRes.url;
    }
    if (metaPatch) data.meta = metaPatch;
    if (!Object.keys(data).length) {
      sendJson(res, 400, { error: "no_changes" });
      return true;
    }
    const updated = await prisma.cosmetic.update({ where: { id: cosmeticId }, data });
    cosmeticsEnsuredAt = 0;
    await writeAdminLog(prisma, {
      adminId: auth.user.id,
      action: "cosmetics.shop",
      targetId: null,
      metadata: {
        cosmeticId: updated.id,
        kind: updated.kind,
        name: updated.name,
        shopPrice: updated.shopPrice,
        changes: Object.keys(data)
      },
      ipAddress: clientIp(req)
    });
    sendJson(res, 200, { ok: true, item: publicCosmetic(updated) });
    return true;
  }

  if (pathname === "/api/v1/admin/cosmetics/revoke" && method(req) === "POST") {
    const auth = await requireAdmin(req, res);
    if (!auth) return true;
    if (!userHasPermission(auth.user, "cosmetics.gift") && !userHasPermission(auth.user, "users.ban")) {
      sendJson(res, 403, { error: "permission_denied", permission: "cosmetics.gift" });
      return true;
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "invalid_json" });
      return true;
    }
    const cosmeticId = String((body && body.cosmeticId) || "").trim();
    if (!cosmeticId) {
      sendJson(res, 400, { error: "invalid_input" });
      return true;
    }
    // กันดึงของเริ่มต้นที่จำเป็น
    const protectedIds = new Set(["frame.basic", "effect.none", "title.level.1"]);
    if (protectedIds.has(cosmeticId) || cosmeticId === "title.rookie") {
      sendJson(res, 400, { error: "protected_cosmetic" });
      return true;
    }
    const target = await resolveGiftTarget(prisma, body || {});
    if (!target || target.status === "deleted") {
      sendJson(res, 404, { error: "user_not_found" });
      return true;
    }
    const owned = await prisma.userCosmetic.findUnique({
      where: { userId_cosmeticId: { userId: target.id, cosmeticId } },
      include: { cosmetic: true }
    });
    if (!owned || !owned.cosmetic) {
      sendJson(res, 404, { error: "not_owned" });
      return true;
    }
    const cosmetic = owned.cosmetic;
    await prisma.userCosmetic.delete({
      where: { userId_cosmeticId: { userId: target.id, cosmeticId } }
    });

    const fallTitle = levelTitleCosmeticId(1);
    const data = {};
    if (target.equippedTitleId === cosmeticId) data.equippedTitleId = fallTitle;
    if (target.equippedFrameId === cosmeticId) data.equippedFrameId = "frame.basic";
    if (target.equippedEffectId === cosmeticId) data.equippedEffectId = "effect.none";
    if (Object.keys(data).length) {
      await ensureLevelOneTitleCosmetic(prisma);
      await grantCosmetic(prisma, target.id, fallTitle, "level");
      await grantCosmetic(prisma, target.id, "frame.basic", "starter");
      await grantCosmetic(prisma, target.id, "effect.none", "starter");
      await prisma.user.update({ where: { id: target.id }, data });
    }

    const kindLabel = KIND_TH[cosmetic.kind] || cosmetic.kind;
    const note = String((body && body.note) || "").trim().slice(0, 200);
    const title = "แอดมินดึงของกลับ";
    const bodyText = `แอดมินดึง ${kindLabel}「${cosmetic.name}」ออกจากคลังของคุณแล้ว`;
    await prisma.notification.create({
      data: {
        userId: target.id,
        type: "system_grant",
        title,
        body: bodyText,
        payload: {
          kind: "admin_revoke",
          fullBody: bodyText + (note ? "\n\nข้อความจากแอดมิน: " + note : ""),
          cosmeticId: cosmetic.id,
          cosmeticKind: cosmetic.kind,
          cosmeticName: cosmetic.name,
          note: note || null,
          href: "/app#decorate"
        }
      }
    });
    const gameApi = getGameApi();
    if (gameApi && typeof gameApi.notifyUser === "function") {
      try {
        gameApi.notifyUser(target.id, { type: "system_grant" });
      } catch {
        /* ignore */
      }
    }
    await writeAdminLog(prisma, {
      adminId: auth.user.id,
      action: "cosmetics.revoke",
      targetId: target.id,
      metadata: {
        cosmeticId: cosmetic.id,
        kind: cosmetic.kind,
        name: cosmetic.name,
        note: note || null,
        unequipped: Object.keys(data).length > 0
      },
      ipAddress: clientIp(req)
    });
    sendJson(res, 200, {
      ok: true,
      user: {
        id: target.id,
        username: target.username,
        displayName: target.displayName
      },
      cosmetic: publicCosmetic(cosmetic),
      unequipped: Object.keys(data).length > 0
    });
    return true;
  }

  sendJson(res, 405, { error: "method_not_allowed" });
  return true;
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
  adminGiftCosmetic,
  handleCosmeticsApi,
  handleAdminCosmeticsApi
};
