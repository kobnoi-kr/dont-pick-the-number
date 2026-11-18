"use strict";

/** Canonical permission catalog for Admin & Permissions matrix. */
const PERMISSION_CATALOG = [
  { name: "dashboard.view", group: "dashboard", label: "ดู Overview", description: "เข้าหน้า Overview ของแอดมิน" },
  { name: "analytics.view", group: "dashboard", label: "ดู Analytics", description: "ดูสถิติและกราฟ" },
  { name: "logs.view", group: "dashboard", label: "ดู Logs", description: "ดู User / Admin activity logs" },

  { name: "users.view", group: "users", label: "ดูผู้ใช้", description: "ดูรายชื่อและรายละเอียดผู้ใช้" },
  { name: "users.ban", group: "users", label: "แบน / Suspend", description: "แบนหรือระงับบัญชี และเปลี่ยนชื่อผู้ใช้" },
  { name: "users.unban", group: "users", label: "ปลดแบน", description: "เปิดใช้งานบัญชีที่ถูกแบน/ระงับ" },
  { name: "users.delete", group: "users", label: "ลบบัญชี", description: "Soft delete บัญชีผู้ใช้" },
  { name: "users.reset_exp", group: "users", label: "ลบ EXP / Level", description: "รีเซ็ต EXP และเลเวลของผู้เล่น" },

  { name: "games.view", group: "games", label: "ดูเกม", description: "ดูแคตตาล็อกและประวัติเกม" },
  { name: "games.manage", group: "games", label: "จัดการเกม", description: "เปิด/ปิดโหมดเกมในแคตตาล็อก" },

  { name: "rooms.view", group: "rooms", label: "ดูห้อง", description: "ดูห้องสดและ Live Monitor" },
  { name: "rooms.kick", group: "rooms", label: "เตะผู้เล่น", description: "เตะผู้เล่นออกจากห้อง" },
  { name: "rooms.close", group: "rooms", label: "ปิดห้อง", description: "บังคับปิดห้อง" },

  { name: "announcements.manage", group: "content", label: "ประกาศ", description: "สร้าง/แก้/ส่งประกาศ" },
  { name: "levels.view", group: "content", label: "ดู Level & ยศ", description: "ดูตารางเลเวล EXP และสียศ" },
  { name: "levels.manage", group: "content", label: "ตั้งค่า Level & ยศ", description: "แก้ EXP / ชื่อยศ / สียศ" },
  { name: "cosmetics.gift", group: "content", label: "Gift ของตกแต่ง", description: "มอบยศ / กรอบ / เอฟเฟกต์ให้ผู้เล่นแบบ manual" },

  { name: "settings.view", group: "system", label: "ดู Settings", description: "ดูการตั้งค่าระบบ / System" },
  { name: "settings.manage", group: "system", label: "จัดการ Settings", description: "แก้ maintenance และค่าคอนฟิก" },
  { name: "admins.view", group: "system", label: "ดูสิทธิ์แอดมิน", description: "ดูหน้า Admin & Permissions" },
  { name: "admins.manage", group: "system", label: "จัดการสิทธิ์แอดมิน", description: "แก้ role permission matrix" }
];

const GROUP_LABELS = {
  dashboard: "Dashboard",
  users: "ผู้ใช้",
  games: "เกม",
  rooms: "ห้อง",
  content: "คอนเทนต์",
  system: "ระบบ"
};

const ROLE_DEFAULT_PERMS = {
  player: [],
  moderator: [
    "dashboard.view",
    "users.view",
    "users.ban",
    "users.unban",
    "users.reset_exp",
    "games.view",
    "rooms.view",
    "rooms.kick",
    "rooms.close",
    "levels.view",
    "cosmetics.gift",
    "logs.view"
  ],
  admin: [
    "dashboard.view",
    "analytics.view",
    "users.view",
    "users.ban",
    "users.unban",
    "users.delete",
    "users.reset_exp",
    "games.view",
    "games.manage",
    "rooms.view",
    "rooms.kick",
    "rooms.close",
    "announcements.manage",
    "levels.view",
    "levels.manage",
    "cosmetics.gift",
    "settings.view",
    "settings.manage",
    "logs.view"
  ],
  super_admin: PERMISSION_CATALOG.map((p) => p.name)
};

const PERMS_TTL_MS = 15 * 60 * 1000;
let permsEnsuredAt = 0;
let permsEnsurePromise = null;

async function ensurePermissionsCatalog(prisma, opts) {
  const force = !!(opts && opts.force);
  const names = PERMISSION_CATALOG.map((p) => p.name);
  if (!prisma) return { names, refreshed: false };
  const now = Date.now();
  if (!force && permsEnsuredAt && now - permsEnsuredAt < PERMS_TTL_MS) {
    return { names, refreshed: false };
  }
  if (!force && permsEnsurePromise) return permsEnsurePromise;

  permsEnsurePromise = (async () => {
    try {
      // Parallel upserts — เดิมทำทีละตัวทำให้ Admin ช้ามาก
      await Promise.all(
        PERMISSION_CATALOG.map((p) =>
          prisma.permission.upsert({
            where: { name: p.name },
            update: { description: p.description },
            create: { name: p.name, description: p.description }
          })
        )
      );

      const [roles, perms] = await Promise.all([
        prisma.role.findMany(),
        prisma.permission.findMany()
      ]);
      const roleByName = Object.fromEntries(roles.map((r) => [r.name, r]));
      const permByName = Object.fromEntries(perms.map((p) => [p.name, p]));

      const rolePermJobs = [];
      for (const [roleName, permNames] of Object.entries(ROLE_DEFAULT_PERMS)) {
        const role = roleByName[roleName];
        if (!role) continue;
        for (const permName of permNames) {
          const permission = permByName[permName];
          if (!permission) continue;
          rolePermJobs.push(
            prisma.rolePermission.upsert({
              where: {
                roleId_permissionId: {
                  roleId: role.id,
                  permissionId: permission.id
                }
              },
              update: {},
              create: { roleId: role.id, permissionId: permission.id }
            })
          );
        }
      }
      if (rolePermJobs.length) await Promise.all(rolePermJobs);

      permsEnsuredAt = Date.now();
      return { names, refreshed: true };
    } finally {
      permsEnsurePromise = null;
    }
  })();

  return permsEnsurePromise;
}

function enrichPermission(row) {
  const meta = PERMISSION_CATALOG.find((p) => p.name === row.name) || null;
  return {
    id: row.id,
    name: row.name,
    description: (meta && meta.description) || row.description || row.name,
    label: (meta && meta.label) || row.name,
    group: (meta && meta.group) || "system",
    groupLabel: GROUP_LABELS[(meta && meta.group) || "system"] || "อื่นๆ"
  };
}

module.exports = {
  PERMISSION_CATALOG,
  GROUP_LABELS,
  ROLE_DEFAULT_PERMS,
  ensurePermissionsCatalog,
  enrichPermission
};
