"use strict";

const { authEnabled, getPrisma } = require("../db");
const { sendJson, readJsonBody, clientIp } = require("../auth/http");
const {
  requireAdmin,
  requirePermission,
  userHasRole,
  permissionsOf
} = require("../auth/middleware");
const { publicUser } = require("../auth/users");
const { revokeAllUserSessions } = require("../auth/sessions");
const { getGameApi } = require("../dashboard/bridge");
const { writeAdminLog } = require("./audit");
const { publishAnnouncement, isDueNow } = require("./publish-announcement");
const { invalidatePublicSettingsCache } = require("../system/public-settings");

function method(req) {
  return String(req.method || "GET").toUpperCase();
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n) {
  const x = startOfDay();
  x.setDate(x.getDate() - n);
  return x;
}

async function getSetting(prisma, key, fallback) {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return row ? row.value : fallback;
}

async function setSetting(prisma, key, value) {
  return prisma.systemSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  });
}

function serializeUser(u) {
  if (!u) return null;
  const base = publicUser(u);
  const email =
    (u.authAccounts || [])
      .map((a) => a.providerEmail)
      .filter(Boolean)[0] || null;
  return Object.assign({}, base, {
    email,
    providers: (u.authAccounts || []).map((a) => a.provider),
    sessionCount: u._count && u._count.sessions != null ? u._count.sessions : undefined
  });
}

async function handleAdminApi(req, res, pathname) {
  if (!pathname.startsWith("/api/v1/admin")) return false;
  if (!authEnabled()) {
    sendJson(res, 503, { error: "auth_disabled" });
    return true;
  }

  const prisma = await getPrisma();
  const game = getGameApi();
  const ip = clientIp(req);

  // —— Overview ——
  if (pathname === "/api/v1/admin/overview") {
    const auth = await requirePermission(req, res, "dashboard.view");
    if (!auth) return true;
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const today = startOfDay();
    const [usersTotal, usersActive, sessionsActive, gamesToday, recentLogs] = await Promise.all([
      prisma.user.count({ where: { status: { not: "deleted" } } }),
      prisma.user.count({ where: { status: "active" } }),
      prisma.session.count({
        where: { revokedAt: null, expiresAt: { gt: new Date() } }
      }),
      prisma.game.count({ where: { createdAt: { gte: today } } }),
      prisma.adminLog.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: { admin: { select: { id: true, displayName: true, username: true } } }
      })
    ]);
    const stats = game && game.adminStats ? game.adminStats() : { rooms: 0, players: 0, spectators: 0 };
    const liveRooms = game && game.listAllRooms ? game.listAllRooms().slice(0, 8) : [];
    sendJson(res, 200, {
      kpis: {
        usersTotal,
        usersActive,
        sessionsActive,
        gamesToday,
        liveRooms: stats.rooms,
        livePlayers: stats.players
      },
      liveRooms,
      recentLogs
    });
    return true;
  }

  // —— Analytics ——
  if (pathname === "/api/v1/admin/analytics") {
    const auth = await requirePermission(req, res, "analytics.view");
    if (!auth) return true;
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const url = new URL(req.url || "/", "http://localhost");
    const range = Math.min(90, Math.max(7, Number(url.searchParams.get("range") || 14) || 14));
    const since = daysAgo(range - 1);
    const games = await prisma.game.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, gameMode: true, playerCount: true }
    });
    const users = await prisma.user.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true }
    });
    const byDay = {};
    for (let i = 0; i < range; i++) {
      const d = daysAgo(range - 1 - i);
      const key = d.toISOString().slice(0, 10);
      byDay[key] = { date: key, games: 0, users: 0 };
    }
    for (const g of games) {
      const key = new Date(g.createdAt).toISOString().slice(0, 10);
      if (byDay[key]) byDay[key].games += 1;
    }
    for (const u of users) {
      const key = new Date(u.createdAt).toISOString().slice(0, 10);
      if (byDay[key]) byDay[key].users += 1;
    }
    const modeMix = {};
    for (const g of games) {
      modeMix[g.gameMode] = (modeMix[g.gameMode] || 0) + 1;
    }
    sendJson(res, 200, {
      range,
      series: Object.values(byDay),
      modeMix,
      totals: { games: games.length, newUsers: users.length }
    });
    return true;
  }

  // —— Users list ——
  if (pathname === "/api/v1/admin/users") {
    const auth = await requirePermission(req, res, "users.view");
    if (!auth) return true;
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const url = new URL(req.url || "/", "http://localhost");
    const q = (url.searchParams.get("q") || "").trim();
    const status = url.searchParams.get("status") || "";
    const role = url.searchParams.get("role") || "";
    const take = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50) || 50));
    const where = { status: { not: "deleted" } };
    if (status && ["active", "suspended", "banned"].includes(status)) where.status = status;
    if (q) {
      where.OR = [
        { username: { contains: q, mode: "insensitive" } },
        { displayName: { contains: q, mode: "insensitive" } },
        { friendCode: { contains: q, mode: "insensitive" } }
      ];
    }
    if (role) {
      where.userRoles = { some: { role: { name: role } } };
    }
    const users = await prisma.user.findMany({
      where,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        userRoles: {
          include: {
            role: { include: { rolePermissions: { include: { permission: true } } } }
          }
        },
        authAccounts: { select: { provider: true, providerEmail: true } },
        _count: { select: { sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } } }
      }
    });
    sendJson(res, 200, { users: users.map(serializeUser) });
    return true;
  }

  // —— User detail / patch / sessions / roles ——
  const userMatch = pathname.match(/^\/api\/v1\/admin\/users\/([^/]+)(?:\/(sessions|roles))?$/);
  if (userMatch) {
    const userId = decodeURIComponent(userMatch[1]);
    const sub = userMatch[2] || "";

    if (sub === "sessions" && method(req) === "DELETE") {
      const auth = await requirePermission(req, res, "users.ban");
      if (!auth) return true;
      await revokeAllUserSessions(prisma, userId);
      await writeAdminLog(prisma, {
        adminId: auth.user.id,
        action: "user.revoke_sessions",
        targetId: userId,
        ipAddress: ip
      });
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (sub === "roles" && method(req) === "PUT") {
      const auth = await requirePermission(req, res, "admins.manage");
      if (!auth) return true;
      const body = await readJsonBody(req).catch(() => null);
      if (!body || !Array.isArray(body.roles)) {
        sendJson(res, 400, { error: "invalid_body" });
        return true;
      }
      const wanted = [...new Set(body.roles.map(String))].filter((r) =>
        ["player", "moderator", "admin", "super_admin"].includes(r)
      );
      if (!wanted.includes("player")) wanted.push("player");
      if (wanted.includes("super_admin") && !userHasRole(auth.user, "super_admin")) {
        sendJson(res, 403, { error: "super_admin_required" });
        return true;
      }
      const target = await prisma.user.findUnique({
        where: { id: userId },
        include: { userRoles: { include: { role: true } } }
      });
      if (!target) {
        sendJson(res, 404, { error: "not_found" });
        return true;
      }
      const wasSuper = (target.userRoles || []).some((ur) => ur.role && ur.role.name === "super_admin");
      if (wasSuper && !wanted.includes("super_admin")) {
        const supers = await prisma.userRole.count({
          where: { role: { name: "super_admin" } }
        });
        if (supers <= 1) {
          sendJson(res, 400, { error: "last_super_admin" });
          return true;
        }
      }
      const roles = await prisma.role.findMany({ where: { name: { in: wanted } } });
      await prisma.$transaction(async (tx) => {
        await tx.userRole.deleteMany({ where: { userId } });
        for (const role of roles) {
          await tx.userRole.create({ data: { userId, roleId: role.id } });
        }
      });
      await writeAdminLog(prisma, {
        adminId: auth.user.id,
        action: "user.set_roles",
        targetId: userId,
        metadata: { roles: wanted },
        ipAddress: ip
      });
      const updated = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: {
              role: { include: { rolePermissions: { include: { permission: true } } } }
            }
          },
          authAccounts: { select: { provider: true, providerEmail: true } }
        }
      });
      sendJson(res, 200, { user: serializeUser(updated) });
      return true;
    }

    if (!sub && method(req) === "GET") {
      const auth = await requirePermission(req, res, "users.view");
      if (!auth) return true;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: {
            include: {
              role: { include: { rolePermissions: { include: { permission: true } } } }
            }
          },
          authAccounts: { select: { provider: true, providerEmail: true } },
          playerStatistics: true,
          _count: { select: { sessions: { where: { revokedAt: null } } } }
        }
      });
      if (!user || user.status === "deleted") {
        sendJson(res, 404, { error: "not_found" });
        return true;
      }
      sendJson(res, 200, {
        user: serializeUser(user),
        stats: user.playerStatistics || null
      });
      return true;
    }

    if (!sub && method(req) === "PATCH") {
      const body = await readJsonBody(req).catch(() => null);
      if (!body) {
        sendJson(res, 400, { error: "invalid_body" });
        return true;
      }
      const nextStatus = body.status;
      if (!["active", "suspended", "banned", "deleted"].includes(nextStatus)) {
        sendJson(res, 400, { error: "invalid_status" });
        return true;
      }
      let perm = "users.ban";
      if (nextStatus === "active") perm = "users.unban";
      if (nextStatus === "deleted") perm = "users.delete";
      const auth = await requirePermission(req, res, perm);
      if (!auth) return true;
      if (userId === auth.user.id) {
        sendJson(res, 400, { error: "cannot_modify_self" });
        return true;
      }
      const target = await prisma.user.findUnique({
        where: { id: userId },
        include: { userRoles: { include: { role: true } } }
      });
      if (!target) {
        sendJson(res, 404, { error: "not_found" });
        return true;
      }
      if (
        userHasRole(target, "super_admin") &&
        !userHasRole(auth.user, "super_admin")
      ) {
        sendJson(res, 403, { error: "cannot_modify_super_admin" });
        return true;
      }
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { status: nextStatus },
        include: {
          userRoles: {
            include: {
              role: { include: { rolePermissions: { include: { permission: true } } } }
            }
          },
          authAccounts: { select: { provider: true, providerEmail: true } }
        }
      });
      if (nextStatus === "banned" || nextStatus === "suspended" || nextStatus === "deleted") {
        await revokeAllUserSessions(prisma, userId);
      }
      await writeAdminLog(prisma, {
        adminId: auth.user.id,
        action: "user.set_status",
        targetId: userId,
        metadata: { status: nextStatus },
        ipAddress: ip
      });
      sendJson(res, 200, { user: serializeUser(updated) });
      return true;
    }

    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }

  // —— Games catalog ——
  if (pathname === "/api/v1/admin/games/catalog") {
    if (method(req) === "GET") {
      const auth = await requirePermission(req, res, "games.view");
      if (!auth) return true;
      const catalog = await getSetting(prisma, "game_catalog", {
        secret: { enabled: true, name: "หาเลข" },
        wheel: { enabled: true, name: "วงล้อ" }
      });
      sendJson(res, 200, { catalog });
      return true;
    }
    if (method(req) === "PATCH") {
      const auth = await requirePermission(req, res, "games.manage");
      if (!auth) return true;
      const body = await readJsonBody(req).catch(() => null);
      if (!body || !body.catalog || typeof body.catalog !== "object") {
        sendJson(res, 400, { error: "invalid_body" });
        return true;
      }
      const next = {};
      for (const id of ["secret", "wheel"]) {
        const row = body.catalog[id] || {};
        next[id] = {
          enabled: row.enabled !== false,
          name: String(row.name || (id === "wheel" ? "วงล้อ" : "หาเลข")).slice(0, 64)
        };
      }
      await setSetting(prisma, "game_catalog", next);
      await writeAdminLog(prisma, {
        adminId: auth.user.id,
        action: "games.catalog_update",
        metadata: next,
        ipAddress: ip
      });
      sendJson(res, 200, { catalog: next });
      return true;
    }
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }

  // —— Games history ——
  if (pathname === "/api/v1/admin/games/history") {
    const auth = await requirePermission(req, res, "games.view");
    if (!auth) return true;
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const url = new URL(req.url || "/", "http://localhost");
    const take = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 40) || 40));
    const mode = url.searchParams.get("mode") || "";
    const where = {};
    if (mode) where.gameMode = mode;
    const games = await prisma.game.findMany({
      where,
      take,
      orderBy: { endedAt: "desc" },
      include: {
        players: { orderBy: { rank: "asc" }, take: 8 }
      }
    });
    sendJson(res, 200, { games });
    return true;
  }

  // —— Rooms list ——
  if (pathname === "/api/v1/admin/rooms") {
    const auth = await requirePermission(req, res, "rooms.view");
    if (!auth) return true;
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const rooms = game && game.listAllRooms ? game.listAllRooms() : [];
    sendJson(res, 200, { rooms });
    return true;
  }

  const roomClose = pathname.match(/^\/api\/v1\/admin\/rooms\/([^/]+)\/close$/);
  if (roomClose) {
    const auth = await requirePermission(req, res, "rooms.close");
    if (!auth) return true;
    if (method(req) !== "POST") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const code = decodeURIComponent(roomClose[1]);
    const ok = game && game.adminCloseRoom ? game.adminCloseRoom(code) : false;
    if (!ok) {
      sendJson(res, 404, { error: "room_not_found" });
      return true;
    }
    await writeAdminLog(prisma, {
      adminId: auth.user.id,
      action: "room.close",
      targetId: code,
      ipAddress: ip
    });
    sendJson(res, 200, { ok: true });
    return true;
  }

  const roomKick = pathname.match(/^\/api\/v1\/admin\/rooms\/([^/]+)\/kick$/);
  if (roomKick) {
    const auth = await requirePermission(req, res, "rooms.kick");
    if (!auth) return true;
    if (method(req) !== "POST") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const code = decodeURIComponent(roomKick[1]);
    const body = await readJsonBody(req).catch(() => null);
    const playerId = body && body.playerId;
    if (!playerId) {
      sendJson(res, 400, { error: "player_id_required" });
      return true;
    }
    const ok = game && game.adminKick ? game.adminKick(code, playerId) : false;
    if (!ok) {
      sendJson(res, 404, { error: "not_found" });
      return true;
    }
    await writeAdminLog(prisma, {
      adminId: auth.user.id,
      action: "room.kick",
      targetId: code,
      metadata: { playerId },
      ipAddress: ip
    });
    sendJson(res, 200, { ok: true });
    return true;
  }

  // —— Announcements ——
  if (pathname === "/api/v1/admin/announcements") {
    if (method(req) === "GET") {
      const auth = await requirePermission(req, res, "announcements.manage");
      if (!auth) return true;
      const items = await prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
      sendJson(res, 200, { announcements: items });
      return true;
    }
    if (method(req) === "POST") {
      const auth = await requirePermission(req, res, "announcements.manage");
      if (!auth) return true;
      const body = await readJsonBody(req).catch(() => null);
      if (!body || !body.title || !body.body) {
        sendJson(res, 400, { error: "invalid_body" });
        return true;
      }
      const kind = ["info", "warning", "danger", "alert"].includes(body.kind)
        ? body.kind
        : "info";
      const personal = kind === "danger" || kind === "alert";
      let targetIds = [];
      if (personal) {
        const raw = Array.isArray(body.targetIds)
          ? body.targetIds
          : String(body.targets || "")
              .split(/[\s,;]+/)
              .map((s) => s.trim())
              .filter(Boolean);
        targetIds = [...new Set(raw.map(String))].slice(0, 50);
        if (!targetIds.length) {
          sendJson(res, 400, { error: "targets_required" });
          return true;
        }
      }
      const mode = body.mode === "schedule" ? "schedule" : body.mode === "draft" ? "draft" : "now";
      let startsAt = body.startsAt ? new Date(body.startsAt) : null;
      let endsAt = body.endsAt ? new Date(body.endsAt) : null;
      if (startsAt && Number.isNaN(startsAt.getTime())) startsAt = null;
      if (endsAt && Number.isNaN(endsAt.getTime())) endsAt = null;

      let active = !!body.active;
      if (mode === "now") {
        active = true;
        startsAt = new Date();
      } else if (mode === "schedule") {
        if (!startsAt || startsAt <= new Date()) {
          sendJson(res, 400, { error: "starts_at_required" });
          return true;
        }
        active = true;
      } else {
        active = false;
      }

      let item = await prisma.announcement.create({
        data: {
          title: String(body.title).slice(0, 160),
          body: String(body.body).slice(0, 8000),
          kind,
          targetIds: personal ? targetIds : [],
          active,
          startsAt,
          endsAt,
          createdBy: auth.user.id
        }
      });
      if (active && isDueNow(item)) {
        const published = await publishAnnouncement(prisma, item.id);
        if (published) item = published;
      }
      await writeAdminLog(prisma, {
        adminId: auth.user.id,
        action: "announcement.create",
        targetId: item.id,
        metadata: { mode, kind, active },
        ipAddress: ip
      });
      sendJson(res, 201, { announcement: item });
      return true;
    }
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }

  const annMatch = pathname.match(/^\/api\/v1\/admin\/announcements\/([^/]+)$/);
  if (annMatch) {
    const id = decodeURIComponent(annMatch[1]);
    const auth = await requirePermission(req, res, "announcements.manage");
    if (!auth) return true;
    if (method(req) === "PATCH") {
      const body = await readJsonBody(req).catch(() => null);
      if (!body) {
        sendJson(res, 400, { error: "invalid_body" });
        return true;
      }
      const data = {};
      if (body.title != null) data.title = String(body.title).slice(0, 160);
      if (body.body != null) data.body = String(body.body).slice(0, 8000);
      if (body.active != null) data.active = !!body.active;
      if (body.startsAt !== undefined) {
        const d = body.startsAt ? new Date(body.startsAt) : null;
        data.startsAt = d && !Number.isNaN(d.getTime()) ? d : null;
      }
      if (body.endsAt !== undefined) {
        const d = body.endsAt ? new Date(body.endsAt) : null;
        data.endsAt = d && !Number.isNaN(d.getTime()) ? d : null;
      }
      if (body.kind != null && ["info", "warning", "danger", "alert"].includes(body.kind)) {
        data.kind = body.kind;
      }
      if (body.targetIds != null || body.targets != null) {
        const raw = Array.isArray(body.targetIds)
          ? body.targetIds
          : String(body.targets || "")
              .split(/[\s,;]+/)
              .map((s) => s.trim())
              .filter(Boolean);
        data.targetIds = [...new Set(raw.map(String))].slice(0, 50);
      }
      let item = await prisma.announcement.update({ where: { id }, data });
      if (item.active && !item.publishedAt && isDueNow(item)) {
        const published = await publishAnnouncement(prisma, item.id);
        if (published) item = published;
      }
      await writeAdminLog(prisma, {
        adminId: auth.user.id,
        action: "announcement.update",
        targetId: id,
        metadata: data,
        ipAddress: ip
      });
      sendJson(res, 200, { announcement: item });
      return true;
    }
    if (method(req) === "DELETE") {
      await prisma.announcement.delete({ where: { id } });
      await writeAdminLog(prisma, {
        adminId: auth.user.id,
        action: "announcement.delete",
        targetId: id,
        ipAddress: ip
      });
      sendJson(res, 200, { ok: true });
      return true;
    }
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }

  // Public active announcements (for user overview) — still under admin path? Better add public path in dashboard.
  // Handled in dashboard routes instead.

  // —— Roles & permissions ——
  if (pathname === "/api/v1/admin/roles") {
    const auth = await requirePermission(req, res, "admins.view");
    if (!auth) return true;
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const roles = await prisma.role.findMany({
      include: {
        rolePermissions: { include: { permission: true } },
        _count: { select: { userRoles: true } }
      },
      orderBy: { name: "asc" }
    });
    const permissions = await prisma.permission.findMany({ orderBy: { name: "asc" } });
    sendJson(res, 200, {
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        userCount: r._count.userRoles,
        permissions: r.rolePermissions.map((rp) => rp.permission.name)
      })),
      permissions: permissions.map((p) => ({ id: p.id, name: p.name, description: p.description }))
    });
    return true;
  }

  const rolePermMatch = pathname.match(/^\/api\/v1\/admin\/roles\/([^/]+)\/permissions$/);
  if (rolePermMatch) {
    const auth = await requirePermission(req, res, "admins.manage");
    if (!auth) return true;
    if (method(req) !== "PUT") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const roleName = decodeURIComponent(rolePermMatch[1]);
    if (roleName === "super_admin") {
      sendJson(res, 400, { error: "cannot_edit_super_admin_perms" });
      return true;
    }
    const body = await readJsonBody(req).catch(() => null);
    if (!body || !Array.isArray(body.permissions)) {
      sendJson(res, 400, { error: "invalid_body" });
      return true;
    }
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      sendJson(res, 404, { error: "not_found" });
      return true;
    }
    const perms = await prisma.permission.findMany({
      where: { name: { in: body.permissions.map(String) } }
    });
    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      for (const p of perms) {
        await tx.rolePermission.create({
          data: { roleId: role.id, permissionId: p.id }
        });
      }
    });
    await writeAdminLog(prisma, {
      adminId: auth.user.id,
      action: "role.set_permissions",
      targetId: roleName,
      metadata: { permissions: perms.map((p) => p.name) },
      ipAddress: ip
    });
    sendJson(res, 200, { ok: true, permissions: perms.map((p) => p.name) });
    return true;
  }

  // —— System ——
  if (pathname === "/api/v1/admin/system") {
    const auth = await requirePermission(req, res, "settings.view");
    if (!auth) return true;
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const mem = process.memoryUsage();
    const stats = game && game.adminStats ? game.adminStats() : {};
    sendJson(res, 200, {
      uptimeSec: Math.floor(process.uptime()),
      node: process.version,
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal
      },
      rooms: stats
    });
    return true;
  }

  if (pathname === "/api/v1/admin/system/clear-sessions" && method(req) === "POST") {
    const auth = await requireAdmin(req, res);
    if (!auth) return true;
    if (!userHasRole(auth.user, "super_admin")) {
      sendJson(res, 403, { error: "super_admin_required" });
      return true;
    }
    const result = await prisma.session.updateMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }]
      },
      data: { revokedAt: new Date() }
    });
    // Actually delete expired
    const deleted = await prisma.session.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }]
      }
    });
    await writeAdminLog(prisma, {
      adminId: auth.user.id,
      action: "system.clear_sessions",
      metadata: { deleted: deleted.count, touched: result.count },
      ipAddress: ip
    });
    sendJson(res, 200, { deleted: deleted.count });
    return true;
  }

  // —— Settings ——
  if (pathname === "/api/v1/admin/settings") {
    if (method(req) === "GET") {
      const auth = await requirePermission(req, res, "settings.view");
      if (!auth) return true;
      const rows = await prisma.systemSetting.findMany();
      const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      sendJson(res, 200, { settings });
      return true;
    }
    if (method(req) === "PATCH") {
      const auth = await requirePermission(req, res, "settings.manage");
      if (!auth) return true;
      const body = await readJsonBody(req).catch(() => null);
      if (!body || !body.settings || typeof body.settings !== "object") {
        sendJson(res, 400, { error: "invalid_body" });
        return true;
      }
      const before = await getSetting(prisma, "maintenance_enabled", false);
      const beforeOn = before === true || before === "true" || before === 1;
      const allowed = [
        "maintenance_enabled",
        "maintenance_message",
        "max_rooms_display",
        "game_catalog"
      ];
      for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(body.settings, key)) {
          let value = body.settings[key];
          if (key === "maintenance_enabled") value = !!value;
          if (key === "maintenance_message") value = String(value || "").slice(0, 2000);
          if (key === "max_rooms_display") {
            value = Math.min(200, Math.max(1, Number(value) || 50));
          }
          await setSetting(prisma, key, value);
        }
      }
      invalidatePublicSettingsCache();
      // Force refresh so open/close server takes effect immediately
      let afterOn = beforeOn;
      try {
        const { loadPublicSettings } = require("../system/public-settings");
        const fresh = await loadPublicSettings(true);
        afterOn = !!fresh.maintenanceEnabled;
      } catch {
        /* ignore */
      }
      // Turning maintenance ON → kick everyone out of rooms immediately
      if (!beforeOn && afterOn) {
        const gameApi = getGameApi();
        const msg =
          body.settings.maintenance_message != null
            ? String(body.settings.maintenance_message || "").trim()
            : "";
        if (gameApi && typeof gameApi.forceMaintenance === "function") {
          try {
            gameApi.forceMaintenance(msg);
          } catch {
            /* ignore */
          }
        }
      }
      await writeAdminLog(prisma, {
        adminId: auth.user.id,
        action: "settings.update",
        metadata: body.settings,
        ipAddress: ip
      });
      const rows = await prisma.systemSetting.findMany();
      sendJson(res, 200, {
        settings: Object.fromEntries(rows.map((r) => [r.key, r.value]))
      });
      return true;
    }
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }

  // —— Logs ——
  if (pathname === "/api/v1/admin/logs") {
    const auth = await requirePermission(req, res, "logs.view");
    if (!auth) return true;
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const url = new URL(req.url || "/", "http://localhost");
    const action = (url.searchParams.get("action") || "").trim();
    const take = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 50) || 50));
    const where = {};
    if (action) where.action = { contains: action };
    const logs = await prisma.adminLog.findMany({
      where,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        admin: { select: { id: true, displayName: true, username: true } }
      }
    });
    sendJson(res, 200, { logs });
    return true;
  }

  // —— Me (admin context) ——
  if (pathname === "/api/v1/admin/me") {
    const auth = await requireAdmin(req, res);
    if (!auth) return true;
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    sendJson(res, 200, {
      user: publicUser(auth.user),
      permissions: permissionsOf(auth.user)
    });
    return true;
  }

  sendJson(res, 404, { error: "not_found" });
  return true;
}

module.exports = { handleAdminApi };
