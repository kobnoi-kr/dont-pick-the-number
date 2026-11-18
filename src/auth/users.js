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

function normalizeExtraIdsLite(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    const id = String(item || "").trim();
    if (!id || id.startsWith("title.level.") || id === "title.rookie" || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 4) break;
  }
  return out;
}

function publicUser(user) {
  if (!user) return null;
  const roles = (user.userRoles || []).map((ur) => ur.role && ur.role.name).filter(Boolean);
  const title = publicCosmeticLite(user.equippedTitle);
  const extraTitles = (Array.isArray(user.equippedExtraTitles) ? user.equippedExtraTitles : [])
    .map(publicCosmeticLite)
    .filter(Boolean);
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    friendCode: user.friendCode || null,
    gender: user.gender || null,
    age: user.age == null ? null : user.age,
    level: user.level == null ? 1 : user.level,
    exp: user.exp == null ? 0 : user.exp,
    shopPts: user.shopPts == null ? 0 : user.shopPts,
    accountType: user.accountType,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    roles,
    permissions: permissionsOf(user),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    equipped: {
      title,
      extraTitles,
      titles: [title, ...extraTitles].filter(Boolean),
      frame: publicCosmeticLite(user.equippedFrame),
      effect: publicCosmeticLite(user.equippedEffect),
      maxExtraTitles: 4
    }
  };
}

async function hydrateEquippedExtras(prisma, user) {
  if (!user) return user;
  const ids = normalizeExtraIdsLite(user.equippedExtraTitleIds);
  if (!ids.length) {
    user.equippedExtraTitles = [];
    return user;
  }
  const rows = await prisma.cosmetic.findMany({ where: { id: { in: ids } } });
  const map = new Map(rows.map((row) => [row.id, row]));
  user.equippedExtraTitles = ids.map((id) => map.get(id)).filter(Boolean);
  return user;
}

async function getUserWithRoles(prisma, userId) {
  const user = await prisma.user.findUnique({
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
  return hydrateEquippedExtras(prisma, user);
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
  hydrateEquippedExtras,
  getUserWithRoles,
  touchLastLogin
};
