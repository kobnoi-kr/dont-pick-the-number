"use strict";

const { authEnabled, getPrisma } = require("../db");
const { isAdminUser } = require("../auth/middleware");

const CACHE_MS = 4000;

/** @type {{ at: number, maintenanceEnabled: boolean, maintenanceMessage: string, maxRoomsDisplay: number }} */
let cache = {
  at: 0,
  maintenanceEnabled: false,
  maintenanceMessage: "",
  maxRoomsDisplay: 50
};

function asBool(v) {
  if (v === true || v === false) return v;
  if (v && typeof v === "object" && "value" in v) return asBool(v.value);
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes") return true;
    if (s === "false" || s === "0" || s === "no" || s === "") return false;
  }
  if (typeof v === "number") return v !== 0;
  return !!v;
}

function asMessage(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object" && typeof v.message === "string") return v.message.trim();
  return String(v).trim();
}

function asMaxRooms(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 50;
  return Math.min(200, Math.max(1, Math.floor(n)));
}

async function loadPublicSettings(force = false) {
  const now = Date.now();
  if (!force && now - cache.at < CACHE_MS) return cache;
  if (!authEnabled()) {
    cache = {
      at: now,
      maintenanceEnabled: false,
      maintenanceMessage: "",
      maxRoomsDisplay: 50
    };
    return cache;
  }
  try {
    const prisma = await getPrisma();
    const rows = await prisma.systemSetting.findMany({
      where: {
        key: { in: ["maintenance_enabled", "maintenance_message", "max_rooms_display"] }
      }
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const message = asMessage(map.maintenance_message);
    let enabled = Object.prototype.hasOwnProperty.call(map, "maintenance_enabled")
      ? asBool(map.maintenance_enabled)
      : !!message;
    // Empty message cannot be "on"
    if (!message) enabled = false;
    cache = {
      at: now,
      maintenanceEnabled: enabled,
      maintenanceMessage: message,
      maxRoomsDisplay: asMaxRooms(map.max_rooms_display)
    };
  } catch {
    cache.at = now;
  }
  return cache;
}

function invalidatePublicSettingsCache() {
  cache.at = 0;
}

async function getMaintenanceState() {
  const s = await loadPublicSettings();
  return {
    enabled: !!s.maintenanceEnabled,
    message: s.maintenanceMessage || "ระบบปิดปรับปรุงชั่วคราว กรุณากลับมาใหม่ภายหลัง"
  };
}

async function getMaxRoomsDisplay() {
  const s = await loadPublicSettings();
  return s.maxRoomsDisplay;
}

async function userBypassesMaintenance(userId) {
  if (!userId || !authEnabled()) return false;
  try {
    const prisma = await getPrisma();
    const user = await prisma.user.findUnique({
      where: { id: String(userId) },
      include: {
        userRoles: { include: { role: true } }
      }
    });
    return !!(user && user.status === "active" && isAdminUser(user));
  } catch {
    return false;
  }
}

module.exports = {
  loadPublicSettings,
  invalidatePublicSettingsCache,
  getMaintenanceState,
  getMaxRoomsDisplay,
  userBypassesMaintenance
};
