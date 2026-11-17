"use strict";

const { authEnabled, getPrisma } = require("../db");
const { sendJson, readJsonBody, clientIp } = require("../auth/http");
const { requireAuth, requireAdmin, resolveAuth, isAdminUser } = require("../auth/middleware");
const {
  loadPublicSettings,
  getMaintenanceState,
  userBypassesMaintenance
} = require("../system/public-settings");

/** Opt-in only — user dashboard APIs are public to signed-in/guest sessions by default. */
const DASHBOARD_ADMIN_ONLY = process.env.DASHBOARD_ADMIN_ONLY === "1";
const { rateLimit } = require("../auth/rate-limit");
const { getGameApi } = require("./bridge");
const { listAcceptedFriendIds } = require("../auth/friends");

const GAME_CATALOG = [
  {
    id: "secret",
    slug: "secret",
    name: "หาเลข",
    nameEn: "Don't Get The Secret",
    category: "numbers",
    categoryLabel: "ตัวเลข",
    maxPlayers: 12,
    description: "ห้ามโดนเลขลับ — ทายช่วงและหลบเลขที่ถูกสุ่มไว้",
    howTo: "ตั้งช่วงตัวเลข แล้วผลัดกันเลือกเลข ใครโดนเลขลับจะแพ้รอบนั้น สะสมแต้มจนถึงเป้าชนะ",
    popular: true
  },
  {
    id: "wheel",
    slug: "wheel",
    name: "วงล้อ",
    nameEn: "Number Wheel",
    category: "wheel",
    categoryLabel: "วงล้อ",
    maxPlayers: 12,
    description: "หมุนวงล้อสุ่มเลข ใครโดนเลขของตัวเองจะออกจากเกม",
    howTo: "ผู้เล่นได้รับเลขของตัวเอง หมุนวงล้อทีละครั้ง ถ้าวงล้อชี้เลขของคุณจะตกรอบ คนสุดท้ายที่เหลือชนะ",
    popular: true
  }
];

function method(req) {
  return String(req.method || "GET").toUpperCase();
}

function tooMany(res, sec) {
  sendJson(res, 429, { error: "rate_limited", retryAfterSec: sec });
}

async function optionalUser(req) {
  if (!authEnabled()) return null;
  const auth = await resolveAuth(req);
  return auth && auth.user ? auth.user : null;
}

function emptyStats() {
  return {
    totalGames: 0,
    gamesWon: 0,
    gamesLost: 0,
    winRate: 0,
    totalPoints: 0,
    averageRank: null,
    playTimeSec: 0,
    bestWinStreak: 0,
    currentWinStreak: 0,
    favoriteMode: null
  };
}

async function statsForUser(userId) {
  if (!authEnabled() || !userId) return emptyStats();
  const prisma = await getPrisma();
  const row = await prisma.playerStatistics.findUnique({ where: { userId } });
  if (!row) return emptyStats();
  const winRate = row.totalGames ? Math.round((row.gamesWon / row.totalGames) * 100) : 0;
  const averageRank = row.totalGames ? Math.round((row.rankSum / row.totalGames) * 10) / 10 : null;
  return {
    totalGames: row.totalGames,
    gamesWon: row.gamesWon,
    gamesLost: row.gamesLost,
    winRate,
    totalPoints: row.totalPoints,
    averageRank,
    playTimeSec: row.playTimeSec,
    bestWinStreak: row.bestWinStreak,
    currentWinStreak: row.currentWinStreak,
    favoriteMode: row.favoriteMode
  };
}

async function handleDashboardApi(req, res, pathname) {
  const game = getGameApi();
  const isDashPath =
    pathname.startsWith("/api/v1/dashboard") ||
    pathname.startsWith("/api/v1/rooms") ||
    pathname.startsWith("/api/v1/live-games") ||
    pathname.startsWith("/api/v1/history") ||
    pathname.startsWith("/api/v1/stats") ||
    pathname.startsWith("/api/v1/leaderboard") ||
    pathname.startsWith("/api/v1/settings") ||
    pathname.startsWith("/api/v1/notifications") ||
    pathname.startsWith("/api/v1/announcements") ||
    pathname.match(/^\/api\/v1\/users\/[^/]+\/public$/);

  if (pathname === "/api/v1/system/status") {
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const settings = await loadPublicSettings();
    const maint = await getMaintenanceState();
    let bypass = false;
    if (maint.enabled) {
      const user = await optionalUser(req);
      if (user && isAdminUser(user)) bypass = true;
      else if (user && (await userBypassesMaintenance(user.id))) bypass = true;
    }
    sendJson(res, 200, {
      maintenance: {
        enabled: maint.enabled,
        message: maint.message,
        bypass
      },
      maxRoomsDisplay: settings.maxRoomsDisplay
    });
    return true;
  }

  if (DASHBOARD_ADMIN_ONLY && isDashPath) {
    const admin = await requireAdmin(req, res);
    if (!admin) return true;
  }

  if (pathname === "/api/v1/games/catalog") {
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    let flags = null;
    if (authEnabled()) {
      try {
        const prisma = await getPrisma();
        const row = await prisma.systemSetting.findUnique({ where: { key: "game_catalog" } });
        if (row && row.value) flags = row.value;
      } catch {
        flags = null;
      }
    }
    const games = GAME_CATALOG.filter((g) => {
      if (!flags || !flags[g.id]) return true;
      return flags[g.id].enabled !== false;
    }).map((g) => {
      const override = flags && flags[g.id];
      if (override && override.name) return Object.assign({}, g, { name: override.name });
      return g;
    });
    sendJson(res, 200, { games });
    return true;
  }

  if (pathname === "/api/v1/announcements/active") {
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    if (!authEnabled()) {
      sendJson(res, 200, { announcements: [] });
      return true;
    }
    const prisma = await getPrisma();
    const auth = await resolveAuth(req);
    const user = auth && auth.user ? auth.user : null;
    const now = new Date();
    const items = await prisma.announcement.findMany({
      where: {
        active: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }
        ]
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        title: true,
        body: true,
        kind: true,
        targetIds: true,
        createdAt: true
      }
    });
    const keys = new Set();
    if (user) {
      keys.add(String(user.id).toLowerCase());
      if (user.username) keys.add(String(user.username).toLowerCase());
      if (user.friendCode) keys.add(String(user.friendCode).toLowerCase());
      if (user.displayName) keys.add(String(user.displayName).toLowerCase());
    }
    const filtered = items.filter((a) => {
      const kind = a.kind || "info";
      const personal = kind === "danger" || kind === "alert";
      if (!personal) return true;
      if (!user) return false;
      const targets = Array.isArray(a.targetIds) ? a.targetIds : [];
      if (!targets.length) return false;
      return targets.some((t) => keys.has(String(t || "").trim().toLowerCase()));
    });
    sendJson(res, 200, {
      announcements: filtered.slice(0, 8).map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        kind: a.kind || "info",
        createdAt: a.createdAt
      }))
    });
    return true;
  }

  if (pathname === "/api/v1/dashboard" || pathname === "/api/v1/dashboard/summary") {
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const user = await optionalUser(req);
    const stats = user ? await statsForUser(user.id) : emptyStats();
    let roomsCreated = 0;
    let lastGame = null;
    if (user && authEnabled()) {
      const prisma = await getPrisma();
      const hosted = await prisma.game.findMany({
        where: { metadata: { path: ["hostUserId"], equals: user.id } },
        select: { id: true },
        take: 500
      }).catch(() => []);
      roomsCreated = hosted.length;
      const latest = await prisma.gamePlayer.findFirst({
        where: { userId: user.id },
        orderBy: { game: { endedAt: "desc" } },
        include: { game: true }
      }).catch(() => null);
      if (latest && latest.game) {
        lastGame = {
          roomName: latest.game.roomName,
          gameMode: latest.game.gameMode,
          endedAt: latest.game.endedAt,
          won: latest.won,
          points: latest.points
        };
      }
    }
    const playHours = Math.round(((stats.playTimeSec || 0) / 3600) * 10) / 10;
    sendJson(res, 200, {
      user: user
        ? {
            id: user.id,
            displayName: user.displayName,
            accountType: user.accountType,
            roles: (user.userRoles || []).map((ur) => ur.role && ur.role.name).filter(Boolean)
          }
        : null,
      stats: Object.assign({}, stats, { roomsCreated, playHours }),
      lastGame
    });
    return true;
  }

  if (pathname === "/api/v1/dashboard/activity") {
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const user = await optionalUser(req);
    if (!user || !authEnabled()) {
      sendJson(res, 200, { items: [] });
      return true;
    }
    const prisma = await getPrisma();
    const rows = await prisma.gamePlayer.findMany({
      where: { userId: user.id },
      orderBy: { game: { endedAt: "desc" } },
      take: 8,
      include: { game: true }
    });
    sendJson(res, 200, {
      items: rows.map((r) => ({
        title: r.game.roomName,
        subtitle:
          (r.game.gameMode === "wheel" ? "วงล้อ" : "หาเลข") +
          " · " +
          (r.won ? "ชนะ" : "เล่น") +
          " · #" +
          r.rank +
          " · " +
          r.points +
          " pts",
        gameMode: r.game.gameMode,
        when: r.game.endedAt ? new Date(r.game.endedAt).toLocaleString() : ""
      }))
    });
    return true;
  }

  if (pathname === "/api/v1/rooms/mine") {
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const user = await optionalUser(req);
    const live = (game ? game.listLobbyRooms() : []).filter((r) => r.joinable || r.phase !== "over");
    let created = [];
    if (user && authEnabled()) {
      const prisma = await getPrisma();
      const rows = await prisma.game.findMany({
        where: { metadata: { path: ["hostUserId"], equals: user.id } },
        orderBy: { endedAt: "desc" },
        take: 20
      }).catch(() => []);
      created = rows.map((g) => ({
        id: g.id,
        code: g.roomCode,
        title: g.roomName,
        gameMode: g.gameMode,
        visibility: g.visibility,
        playerCount: g.playerCount,
        endedAt: g.endedAt
      }));
    }
    sendJson(res, 200, { live, created });
    return true;
  }

  if (pathname === "/api/v1/rooms/public") {
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const rooms = game ? game.listLobbyRooms() : [];
    sendJson(res, 200, { rooms });
    return true;
  }

  if (pathname === "/api/v1/rooms/quick-play") {
    if (method(req) !== "POST") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    {
      const maint = await getMaintenanceState();
      if (maint.enabled) {
        const user = await optionalUser(req);
        const bypass = user && (isAdminUser(user) || (await userBypassesMaintenance(user.id)));
        if (!bypass) {
          sendJson(res, 503, { error: "maintenance", message: maint.message });
          return true;
        }
      }
    }
    const rl = rateLimit("qp:" + clientIp(req), 30, 60_000);
    if (!rl.ok) {
      tooMany(res, rl.retryAfterSec);
      return true;
    }
    const room = game ? game.findQuickPlayRoom() : null;
    if (!room) {
      sendJson(res, 404, { error: "no_room" });
      return true;
    }
    sendJson(res, 200, { code: room.code, title: room.title });
    return true;
  }

  if (pathname === "/api/v1/rooms") {
    if (method(req) !== "POST") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const rl = rateLimit("room:" + clientIp(req), 20, 60_000);
    if (!rl.ok) {
      tooMany(res, rl.retryAfterSec);
      return true;
    }
    if (!game) {
      sendJson(res, 503, { error: "game_unavailable" });
      return true;
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "invalid_json" });
      return true;
    }
    const user = await optionalUser(req);
    {
      const maint = await getMaintenanceState();
      if (maint.enabled) {
        const bypass = user && (isAdminUser(user) || (await userBypassesMaintenance(user.id)));
        if (!bypass) {
          sendJson(res, 503, { error: "maintenance", message: maint.message });
          return true;
        }
      }
    }
    const token = (user && user.id) || String(body.token || "");
    const name = String(body.displayName || body.name || (user && user.displayName) || "").trim().slice(0, 24);
    const created = game.createRoomHttp({
      visibility: body.visibility === "private" ? "private" : "public",
      title: body.title || "",
      token: token || undefined,
      name: name || "Player",
      avatarUrl: (user && user.avatarUrl) || body.avatarUrl || "",
      setup: body.setup || {}
    });
    if (!created) {
      sendJson(res, 500, { error: "create_failed" });
      return true;
    }
    sendJson(res, 201, created);
    return true;
  }

  if (pathname === "/api/v1/rooms/join") {
    if (method(req) !== "POST") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "invalid_json" });
      return true;
    }
    {
      const maint = await getMaintenanceState();
      if (maint.enabled) {
        const user = await optionalUser(req);
        const bypass = user && (isAdminUser(user) || (await userBypassesMaintenance(user.id)));
        if (!bypass) {
          sendJson(res, 503, { error: "maintenance", message: maint.message });
          return true;
        }
      }
    }
    const code = String(body.code || "").replace(/\D/g, "").slice(0, 6);
    if (!game) {
      sendJson(res, 503, { error: "game_unavailable" });
      return true;
    }
    const info = game.inspectRoom(code);
    if (!info) {
      sendJson(res, 404, { error: "not_found" });
      return true;
    }
    if (!info.joinable) {
      sendJson(res, 409, { error: info.phase === "lobby" ? "full" : "already_started" });
      return true;
    }
    sendJson(res, 200, { code: info.code, title: info.title });
    return true;
  }

  if (pathname === "/api/v1/live-games") {
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    sendJson(res, 200, { games: game ? game.listLiveGames() : [] });
    return true;
  }

  const liveWatch = pathname.match(/^\/api\/v1\/live-games\/([^/]+)\/watch$/);
  if (liveWatch) {
    sendJson(res, 200, { ok: true, hint: "open /play.html?watch=1&code=" + liveWatch[1] });
    return true;
  }

  if (pathname === "/api/v1/history") {
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    if (!authEnabled()) {
      sendJson(res, 200, { items: [] });
      return true;
    }
    const auth = await requireAuth(req, res);
    if (!auth) return true;
    const prisma = await getPrisma();
    const rows = await prisma.gamePlayer.findMany({
      where: { userId: auth.user.id },
      orderBy: { game: { endedAt: "desc" } },
      take: 50,
      include: { game: true }
    });
    sendJson(res, 200, {
      items: rows.map((r) => ({
        id: r.gameId,
        roomName: r.game.roomName,
        gameMode: r.game.gameMode,
        result: r.won ? "Win" : "Played",
        rank: r.rank,
        pointsEarned: r.points,
        startedAt: r.game.startedAt,
        endedAt: r.game.endedAt,
        duration: r.game.durationSec,
        playerCount: r.game.playerCount
      }))
    });
    return true;
  }

  const histOne = pathname.match(/^\/api\/v1\/history\/([0-9a-f-]{36})$/i);
  if (histOne) {
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    if (!authEnabled()) {
      sendJson(res, 404, { error: "not_found" });
      return true;
    }
    const auth = await requireAuth(req, res);
    if (!auth) return true;
    const prisma = await getPrisma();
    const gameRow = await prisma.game.findUnique({
      where: { id: histOne[1] },
      include: { players: { orderBy: { rank: "asc" } } }
    });
    if (!gameRow || !gameRow.players.some((p) => p.userId === auth.user.id)) {
      sendJson(res, 404, { error: "not_found" });
      return true;
    }
    sendJson(res, 200, { game: gameRow });
    return true;
  }

  if (pathname === "/api/v1/stats/me" || pathname === "/api/v1/stats/me/performance") {
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const user = await optionalUser(req);
    sendJson(res, 200, { stats: user ? await statsForUser(user.id) : emptyStats() });
    return true;
  }

  const lb = pathname.match(/^\/api\/v1\/leaderboard\/(global|weekly|monthly|friends)$/);
  if (lb) {
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    if (!authEnabled()) {
      sendJson(res, 200, { rows: [], me: null });
      return true;
    }
    const prisma = await getPrisma();
    const user = await optionalUser(req);
    const period = lb[1];
    let where = {};
    if (period === "weekly" || period === "monthly") {
      const since = new Date();
      since.setDate(since.getDate() - (period === "weekly" ? 7 : 30));
      // approximate: use updatedAt on stats for period boards
      where = { updatedAt: { gte: since } };
    }
    let friendIds = null;
    if (period === "friends" && user) {
      friendIds = await listAcceptedFriendIds(prisma, user.id);
      friendIds.push(user.id);
      where = { userId: { in: friendIds } };
    }
    const rowsRaw = await prisma.playerStatistics.findMany({
      where,
      orderBy: [{ totalPoints: "desc" }, { gamesWon: "desc" }],
      take: 50,
      include: { user: true }
    });
    const rows = rowsRaw.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      displayName: r.user.displayName,
      avatarUrl: r.user.avatarUrl,
      totalPoints: r.totalPoints,
      gamesWon: r.gamesWon,
      winRate: r.totalGames ? Math.round((r.gamesWon / r.totalGames) * 100) : 0
    }));
    let me = null;
    if (user) {
      const mine = rows.find((r) => r.userId === user.id);
      if (mine) me = mine;
      else {
        const st = await statsForUser(user.id);
        me = st.totalGames
          ? {
              rank: null,
              displayName: user.displayName,
              totalPoints: st.totalPoints,
              gamesWon: st.gamesWon
            }
          : null;
      }
    }
    sendJson(res, 200, { rows, me });
    return true;
  }

  if (pathname === "/api/v1/settings") {
    if (!authEnabled()) {
      if (method(req) === "GET") {
        sendJson(res, 200, { settings: { language: "th", theme: "dark", preferences: {} } });
        return true;
      }
      sendJson(res, 503, { error: "auth_disabled" });
      return true;
    }
    const auth = await requireAuth(req, res);
    if (!auth) return true;
    const prisma = await getPrisma();
    if (method(req) === "GET") {
      let settings = await prisma.userSettings.findUnique({ where: { userId: auth.user.id } });
      if (!settings) {
        settings = await prisma.userSettings.create({
          data: { userId: auth.user.id, language: "th", theme: "dark", preferences: {} }
        });
      }
      sendJson(res, 200, { settings });
      return true;
    }
    if (method(req) === "PATCH") {
      let body;
      try {
        body = await readJsonBody(req);
      } catch {
        sendJson(res, 400, { error: "invalid_json" });
        return true;
      }
      const current = await prisma.userSettings.findUnique({ where: { userId: auth.user.id } });
      const prevPref = (current && current.preferences) || {};
      const nextPref = Object.assign({}, prevPref, body.preferences || {});
      const settings = await prisma.userSettings.upsert({
        where: { userId: auth.user.id },
        create: {
          userId: auth.user.id,
          language: body.language || "th",
          theme: body.theme || "dark",
          preferences: nextPref
        },
        update: {
          language: body.language || undefined,
          theme: body.theme || undefined,
          preferences: nextPref
        }
      });
      sendJson(res, 200, { settings });
      return true;
    }
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }

  if (pathname === "/api/v1/notifications") {
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    if (!authEnabled()) {
      sendJson(res, 200, { items: [] });
      return true;
    }
    const auth = await requireAuth(req, res);
    if (!auth) return true;
    const prisma = await getPrisma();
    const items = await prisma.notification.findMany({
      where: { userId: auth.user.id },
      orderBy: { createdAt: "desc" },
      take: 40
    });
    sendJson(res, 200, { items });
    return true;
  }

  if (pathname === "/api/v1/notifications/read-all") {
    if (method(req) !== "POST") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    if (!authEnabled()) {
      sendJson(res, 200, { ok: true });
      return true;
    }
    const auth = await requireAuth(req, res);
    if (!auth) return true;
    const prisma = await getPrisma();
    await prisma.notification.updateMany({
      where: { userId: auth.user.id, readAt: null },
      data: { readAt: new Date() }
    });
    sendJson(res, 200, { ok: true });
    return true;
  }

  const notifOne = pathname.match(/^\/api\/v1\/notifications\/([0-9a-f-]{36})$/i);
  if (notifOne) {
    if (!authEnabled()) {
      sendJson(res, 200, { ok: true });
      return true;
    }
    const auth = await requireAuth(req, res);
    if (!auth) return true;
    const prisma = await getPrisma();
    if (method(req) === "PATCH") {
      await prisma.notification.updateMany({
        where: { id: notifOne[1], userId: auth.user.id },
        data: { readAt: new Date() }
      });
      sendJson(res, 200, { ok: true });
      return true;
    }
    if (method(req) === "DELETE") {
      await prisma.notification.deleteMany({ where: { id: notifOne[1], userId: auth.user.id } });
      sendJson(res, 200, { ok: true });
      return true;
    }
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }

  const pubUser = pathname.match(/^\/api\/v1\/users\/([0-9a-f-]{36})\/public$/i);
  if (pubUser && method(req) === "GET") {
    if (!authEnabled()) {
      sendJson(res, 404, { error: "not_found" });
      return true;
    }
    const prisma = await getPrisma();
    const u = await prisma.user.findUnique({
      where: { id: pubUser[1] },
      include: { settings: true }
    });
    if (!u || u.status === "deleted") {
      sendJson(res, 404, { error: "not_found" });
      return true;
    }
    const pref = (u.settings && u.settings.preferences) || {};
    const stats = pref.publicStats === false ? null : await statsForUser(u.id);
    sendJson(res, 200, {
      user: {
        id: u.id,
        displayName: u.displayName,
        username: u.username,
        avatarUrl: u.avatarUrl,
        accountType: u.accountType,
        createdAt: u.createdAt
      },
      stats
    });
    return true;
  }

  return false;
}

module.exports = { handleDashboardApi };
