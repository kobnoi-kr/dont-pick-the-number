"use strict";

const { getPrisma } = require("../db");
const { randomToken, hashToken } = require("./crypto");

const GUEST_MS = 7 * 24 * 60 * 60 * 1000;
const REGISTERED_MS = 30 * 24 * 60 * 60 * 1000;
const ADMIN_MS = 8 * 60 * 60 * 1000;

function durationFor(accountType, roles) {
  const names = new Set((roles || []).map((r) => r.name || r));
  if (names.has("admin") || names.has("super_admin") || names.has("moderator")) return ADMIN_MS;
  if (accountType === "registered") return REGISTERED_MS;
  return GUEST_MS;
}

async function ensurePlayerRole(tx, userId) {
  let role = await tx.role.findUnique({ where: { name: "player" } });
  if (!role) {
    role = await tx.role.create({
      data: { name: "player", description: "ผู้เล่นทั่วไป" }
    });
  }
  await tx.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    create: { userId, roleId: role.id },
    update: {}
  });
  return role;
}

async function createSession(user, meta = {}) {
  const db = await getPrisma();
  const roles = (user.userRoles || []).map((ur) => ur.role).filter(Boolean);
  const ttl = durationFor(user.accountType, roles);
  const token = randomToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttl);
  const session = await db.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
      userAgent: meta.userAgent || null,
      ipAddress: meta.ipAddress || null
    }
  });
  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });
  return { token, session, maxAgeSec: Math.floor(ttl / 1000) };
}

async function revokeSessionByToken(token) {
  if (!token) return;
  const db = await getPrisma();
  const tokenHash = hashToken(token);
  await db.session.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

async function revokeAllSessions(userId) {
  const db = await getPrisma();
  await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

async function loadSessionUser(token) {
  if (!token) return null;
  const db = await getPrisma();
  const tokenHash = hashToken(token);
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          userRoles: { include: { role: true } },
          settings: true
        }
      }
    }
  });
  if (!session || session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (!session.user || session.user.status !== "active") return null;

  await db.session.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() }
  });

  return { session, user: session.user };
}

function publicUser(user) {
  if (!user) return null;
  const roles = (user.userRoles || []).map((ur) => ur.role?.name).filter(Boolean);
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl || null,
    accountType: user.accountType,
    status: user.status,
    emailVerified: !!user.emailVerifiedAt,
    roles,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt
  };
}

module.exports = {
  GUEST_MS,
  REGISTERED_MS,
  ADMIN_MS,
  durationFor,
  ensurePlayerRole,
  createSession,
  revokeSessionByToken,
  revokeAllSessions,
  loadSessionUser,
  publicUser
};
