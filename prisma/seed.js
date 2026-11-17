"use strict";

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const ROLES = [
  { name: "player", description: "Default player" },
  { name: "moderator", description: "Player moderator" },
  { name: "admin", description: "System admin" },
  { name: "super_admin", description: "Highest privilege admin" }
];

const PERMISSIONS = [
  "dashboard.view",
  "analytics.view",
  "users.view",
  "users.ban",
  "users.unban",
  "users.delete",
  "games.view",
  "games.manage",
  "rooms.view",
  "rooms.kick",
  "rooms.close",
  "announcements.manage",
  "settings.view",
  "settings.manage",
  "admins.view",
  "admins.manage",
  "logs.view"
];

const ROLE_PERMS = {
  player: [],
  moderator: [
    "dashboard.view",
    "users.view",
    "users.ban",
    "users.unban",
    "games.view",
    "rooms.view",
    "rooms.kick",
    "rooms.close",
    "logs.view"
  ],
  admin: [
    "dashboard.view",
    "analytics.view",
    "users.view",
    "users.ban",
    "users.unban",
    "users.delete",
    "games.view",
    "games.manage",
    "rooms.view",
    "rooms.kick",
    "rooms.close",
    "announcements.manage",
    "settings.view",
    "settings.manage",
    "logs.view"
  ],
  super_admin: PERMISSIONS.slice()
};

async function main() {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role
    });
  }

  for (const name of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name },
      update: {},
      create: { name, description: name }
    });
  }

  const roles = await prisma.role.findMany();
  const perms = await prisma.permission.findMany();
  const roleByName = Object.fromEntries(roles.map((r) => [r.name, r]));
  const permByName = Object.fromEntries(perms.map((p) => [p.name, p]));

  for (const [roleName, permNames] of Object.entries(ROLE_PERMS)) {
    const role = roleByName[roleName];
    if (!role) continue;
    for (const permName of permNames) {
      const permission = permByName[permName];
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id
          }
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id }
      });
    }
  }

  const defaults = {
    maintenance_enabled: false,
    maintenance_message: "",
    max_rooms_display: 50,
    game_catalog: {
      secret: { enabled: true, name: "Secret Number" },
      wheel: { enabled: true, name: "Number Wheel" }
    },
    guest_cleanup_enabled: true,
    guest_idle_days: 7,
    guest_session_days: 7,
    session_cleanup_enabled: true,
    cleanup_interval_minutes: 60,
    guest_create_per_ip_hour: 40,
    activity_log_enabled: true,
    activity_log_retention_days: 30,
    db_size_limit_mb: 1024
  };
  for (const [key, value] of Object.entries(defaults)) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: {},
      create: { key, value }
    });
  }

  try {
    const { ensureCosmeticsCatalog } = require("../src/dashboard/cosmetics");
    await ensureCosmeticsCatalog(prisma);
  } catch (err) {
    console.warn("Cosmetics seed skipped:", err && err.message ? err.message : err);
  }

  try {
    const { ensureLevelConfig } = require("../src/dashboard/levels");
    await ensureLevelConfig(prisma);
  } catch (err) {
    console.warn("Level config seed skipped:", err && err.message ? err.message : err);
  }

  console.log("Seeded roles, permissions, and system settings");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
