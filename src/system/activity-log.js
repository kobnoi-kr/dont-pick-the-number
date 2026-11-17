"use strict";

const { authEnabled, getPrisma } = require("../db");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuidLike(id) {
  return UUID_RE.test(String(id || ""));
}

function asBool(v, fallback = true) {
  if (v === true || v === false) return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes") return true;
    if (s === "false" || s === "0" || s === "no" || s === "") return false;
  }
  if (v == null) return fallback;
  return !!v;
}

let enabledCache = { at: 0, on: true };

async function activityLogEnabled(prisma) {
  const now = Date.now();
  if (enabledCache.at && now - enabledCache.at < 5000) return enabledCache.on;
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: "activity_log_enabled" } });
    enabledCache = { at: now, on: asBool(row && row.value, true) };
  } catch {
    enabledCache = { at: now, on: true };
  }
  return enabledCache.on;
}

function invalidateActivityLogCache() {
  enabledCache.at = 0;
}

/**
 * Fire-and-forget activity write. Never throws to callers.
 * @param {{ userId?: string|null, action: string, metadata?: object, ipAddress?: string|null }} entry
 */
function logActivity(entry) {
  if (!entry || !entry.action) return;
  if (!authEnabled()) return;
  const action = String(entry.action).slice(0, 64);
  const userId = uuidLike(entry.userId) ? entry.userId : null;
  const ipAddress = entry.ipAddress ? String(entry.ipAddress).slice(0, 64) : null;
  const metadata = entry.metadata && typeof entry.metadata === "object" ? entry.metadata : null;

  Promise.resolve()
    .then(async () => {
      const prisma = await getPrisma();
      if (!(await activityLogEnabled(prisma))) return;
      await prisma.userActivityLog.create({
        data: { userId, action, metadata, ipAddress }
      });
    })
    .catch((err) => {
      console.error("[activity-log]", err && err.message ? err.message : err);
    });
}

async function cleanupActivityLogs(prisma, retentionDays) {
  const days = Math.min(365, Math.max(1, Number(retentionDays) || 30));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await prisma.userActivityLog.deleteMany({
    where: { createdAt: { lt: cutoff } }
  });
  return result.count;
}

module.exports = {
  logActivity,
  cleanupActivityLogs,
  invalidateActivityLogCache,
  uuidLike
};
