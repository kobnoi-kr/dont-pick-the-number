"use strict";

const { getPrisma, authEnabled } = require("../db");
const { readSessionToken, clearSessionCookie } = require("./cookies");
const { findValidSession, touchSession } = require("./sessions");
const { sendJson } = require("./http");

async function resolveAuth(req) {
  if (!authEnabled()) return { enabled: false, user: null, session: null };
  const prisma = await getPrisma();
  const token = readSessionToken(req);
  if (!token) return { enabled: true, prisma, user: null, session: null, token: "" };

  const session = await findValidSession(prisma, token);
  if (!session) return { enabled: true, prisma, user: null, session: null, token };

  // Touch last_seen at most once per minute to reduce write load
  const age = Date.now() - new Date(session.lastSeenAt).getTime();
  if (age > 60 * 1000) {
    await touchSession(prisma, session.id).catch(() => {});
  }

  return {
    enabled: true,
    prisma,
    user: session.user,
    session,
    token
  };
}

async function requireAuth(req, res) {
  const auth = await resolveAuth(req);
  if (!auth.enabled) {
    sendJson(res, 503, { error: "auth_disabled" });
    return null;
  }
  if (!auth.user || !auth.session) {
    if (auth.token) clearSessionCookie(res);
    sendJson(res, 401, { error: "unauthorized" });
    return null;
  }
  return auth;
}

function userHasRole(user, roleName) {
  return (user.userRoles || []).some((ur) => ur.role && ur.role.name === roleName);
}

function userHasAnyRole(user, roleNames) {
  const set = new Set(roleNames);
  return (user.userRoles || []).some((ur) => ur.role && set.has(ur.role.name));
}

function isAdminUser(user) {
  return userHasAnyRole(user, ["admin", "super_admin", "moderator"]);
}

async function requireAdmin(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) return null;
  if (!isAdminUser(auth.user)) {
    sendJson(res, 403, { error: "admin_required" });
    return null;
  }
  return auth;
}

module.exports = {
  resolveAuth,
  requireAuth,
  requireAdmin,
  userHasRole,
  userHasAnyRole,
  isAdminUser
};
