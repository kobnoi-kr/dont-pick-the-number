"use strict";

/**
 * Auto-grant admin roles when OAuth email / provider id matches allowlist env.
 *
 * SUPER_ADMIN_EMAILS=you@gmail.com,other@x.com
 * ADMIN_EMAILS=mod@x.com
 * SUPER_ADMIN_GOOGLE_IDS=google-sub-id
 * SUPER_ADMIN_DISCORD_IDS=discord-user-id
 */

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function emailAllowlist(role) {
  if (role === "super_admin") return parseList(process.env.SUPER_ADMIN_EMAILS);
  return parseList(process.env.ADMIN_EMAILS);
}

function providerAllowlist(provider, role) {
  const key =
    role === "super_admin"
      ? provider === "google"
        ? "SUPER_ADMIN_GOOGLE_IDS"
        : "SUPER_ADMIN_DISCORD_IDS"
      : provider === "google"
        ? "ADMIN_GOOGLE_IDS"
        : "ADMIN_DISCORD_IDS";
  return parseList(process.env[key]);
}

async function ensureRole(prisma, userId, roleName) {
  let role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) {
    role = await prisma.role.create({
      data: { name: roleName, description: roleName }
    });
  }
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    create: { userId, roleId: role.id },
    update: {}
  });
  return roleName;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ userId: string, email?: string|null, provider?: string, providerUserId?: string|null }} info
 */
async function maybeGrantAdminFromOAuth(prisma, info) {
  const email = String(info.email || "").trim().toLowerCase();
  const provider = String(info.provider || "").toLowerCase();
  const providerUserId = String(info.providerUserId || "").trim().toLowerCase();
  const granted = [];

  if (email && emailAllowlist("super_admin").includes(email)) {
    granted.push(await ensureRole(prisma, info.userId, "super_admin"));
  } else if (email && emailAllowlist("admin").includes(email)) {
    granted.push(await ensureRole(prisma, info.userId, "admin"));
  }

  if (provider && providerUserId) {
    if (providerAllowlist(provider, "super_admin").includes(providerUserId)) {
      granted.push(await ensureRole(prisma, info.userId, "super_admin"));
    } else if (providerAllowlist(provider, "admin").includes(providerUserId)) {
      granted.push(await ensureRole(prisma, info.userId, "admin"));
    }
  }

  return [...new Set(granted)];
}

module.exports = { maybeGrantAdminFromOAuth, ensureRole };
