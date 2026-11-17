"use strict";

const { randomToken, hashToken } = require("./crypto");
const { sessionTtlSec } = require("./config");
const { publicUser } = require("./users");

async function createSession(prisma, user, opts = {}) {
  const roles = (user.userRoles || []).map((ur) => ur.role);
  const ttlSec = opts.ttlSec || sessionTtlSec(user.accountType, roles);
  const token = randomToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlSec * 1000);

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
      lastSeenAt: new Date(),
      userAgent: opts.userAgent || null,
      ipAddress: opts.ipAddress || null
    }
  });

  return { session, token, ttlSec };
}

async function findValidSession(prisma, rawToken) {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          userRoles: {
            include: {
              role: {
                include: { rolePermissions: { include: { permission: true } } }
              }
            }
          },
          equippedTitle: true,
          equippedFrame: true,
          equippedEffect: true
        }
      }
    }
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (!session.user || session.user.status !== "active") return null;
  return session;
}

async function touchSession(prisma, sessionId) {
  return prisma.session.update({
    where: { id: sessionId },
    data: { lastSeenAt: new Date() }
  });
}

async function revokeSession(prisma, sessionId) {
  return prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() }
  });
}

async function revokeSessionByToken(prisma, rawToken) {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const session = await prisma.session.findUnique({ where: { tokenHash } });
  if (!session || session.revokedAt) return null;
  return revokeSession(prisma, session.id);
}

async function revokeAllUserSessions(prisma, userId) {
  return prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

function sessionResponse(session, user) {
  return {
    user: publicUser(user || session.user),
    session: {
      id: session.id,
      expiresAt: session.expiresAt,
      lastSeenAt: session.lastSeenAt,
      createdAt: session.createdAt
    }
  };
}

module.exports = {
  createSession,
  findValidSession,
  touchSession,
  revokeSession,
  revokeSessionByToken,
  revokeAllUserSessions,
  sessionResponse
};
