"use strict";

const { guestUsername } = require("./crypto");

const PLAYER_ROLE = "player";

async function ensurePlayerRole(prisma, tx) {
  const db = tx || prisma;
  let role = await db.role.findUnique({ where: { name: PLAYER_ROLE } });
  if (!role) {
    role = await db.role.create({
      data: { name: PLAYER_ROLE, description: "Default player role" }
    });
  }
  return role;
}

async function createGuestUser(prisma, meta = {}) {
  const username = guestUsername();
  return prisma.$transaction(async (tx) => {
    const role = await ensurePlayerRole(prisma, tx);
    const user = await tx.user.create({
      data: {
        username,
        displayName: username,
        accountType: "guest",
        status: "active",
        lastLoginAt: new Date(),
        userRoles: { create: { roleId: role.id } },
        settings: { create: {} },
        accountEvents: {
          create: {
            eventType: "guest_created",
            metadata: meta
          }
        }
      },
      include: {
        userRoles: { include: { role: true } }
      }
    });
    return user;
  });
}

function permissionsOf(user) {
  const set = new Set();
  for (const ur of user.userRoles || []) {
    const role = ur.role;
    if (!role) continue;
    for (const rp of role.rolePermissions || []) {
      if (rp.permission && rp.permission.name) set.add(rp.permission.name);
    }
  }
  return [...set];
}

function publicCosmeticLite(c) {
  if (!c) return null;
  return {
    id: c.id,
    kind: c.kind,
    name: c.name,
    cssClass: c.cssClass || null,
    meta: c.meta || null
  };
}

function publicUser(user) {
  if (!user) return null;
  const roles = (user.userRoles || []).map((ur) => ur.role && ur.role.name).filter(Boolean);
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    friendCode: user.friendCode || null,
    gender: user.gender || null,
    age: user.age == null ? null : user.age,
    accountType: user.accountType,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    roles,
    permissions: permissionsOf(user),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    equipped: {
      title: publicCosmeticLite(user.equippedTitle),
      frame: publicCosmeticLite(user.equippedFrame),
      effect: publicCosmeticLite(user.equippedEffect)
    }
  };
}

async function getUserWithRoles(prisma, userId) {
  return prisma.user.findUnique({
    where: { id: userId },
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
  });
}

async function touchLastLogin(prisma, userId) {
  return prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() }
  });
}

module.exports = {
  PLAYER_ROLE,
  ensurePlayerRole,
  createGuestUser,
  publicUser,
  getUserWithRoles,
  touchLastLogin
};
