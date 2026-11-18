"use strict";

const { getGameApi } = require("./bridge");

/** Default: receive everything. Missing keys = on. */
const DEFAULT_NOTIF_PREFS = {
  shop_pts: true,
  game_finished: true,
  level_up: true,
  friend: true,
  room_invitation: true,
  ranking_reward: true,
  announcement: true,
  admin: true
};

const PREF_KEYS = Object.keys(DEFAULT_NOTIF_PREFS);

function normalizeNotifPrefs(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const key of PREF_KEYS) {
    out[key] = src[key] !== false && src[key] !== "false" && src[key] !== 0;
  }
  return out;
}

function prefKeyForType(type) {
  const t = String(type || "");
  if (t === "shop_pts") return "shop_pts";
  if (t === "game_finished") return "game_finished";
  if (t === "level_up") return "level_up";
  if (t === "room_invitation") return "room_invitation";
  if (t === "ranking_reward") return "ranking_reward";
  if (t === "announcement") return "announcement";
  if (t === "admin_reply" || t === "system_grant") return "admin";
  if (t === "friend_request" || t === "friend") return "friend";
  return null;
}

async function loadUserNotifPrefs(prisma, userId) {
  if (!prisma || !userId) return normalizeNotifPrefs(null);
  try {
    const row = await prisma.userSettings.findUnique({
      where: { userId },
      select: { preferences: true }
    });
    const pref = (row && row.preferences) || {};
    return normalizeNotifPrefs(pref.notifications);
  } catch {
    return normalizeNotifPrefs(null);
  }
}

async function userWantsNotification(prisma, userId, type) {
  const key = prefKeyForType(type);
  if (!key) return true;
  const prefs = await loadUserNotifPrefs(prisma, userId);
  return prefs[key] !== false;
}

/**
 * Create inbox row + optional live WS push, respecting user prefs.
 * @returns {Promise<object|null>} created notification or null if skipped/failed
 */
async function createUserNotification(prisma, { userId, type, title, body, payload, push }) {
  if (!prisma || !userId || !type || !title) return null;
  const allowed = await userWantsNotification(prisma, userId, type);
  if (!allowed) return null;
  let row = null;
  try {
    row = await prisma.notification.create({
      data: {
        userId,
        type: String(type).slice(0, 64),
        title: String(title).slice(0, 160),
        body: body != null ? String(body) : null,
        payload: payload || undefined
      }
    });
  } catch {
    return null;
  }
  if (push !== false) {
    try {
      const game = getGameApi();
      if (game && typeof game.notifyUser === "function") {
        const extra = push && typeof push === "object" ? push : {};
        game.notifyUser(
          userId,
          Object.assign(
            {
              type,
              title: row.title,
              body: row.body || "",
              notificationId: row.id
            },
            extra
          )
        );
      }
    } catch {
      /* ignore push errors */
    }
  }
  return row;
}

module.exports = {
  DEFAULT_NOTIF_PREFS,
  PREF_KEYS,
  normalizeNotifPrefs,
  prefKeyForType,
  loadUserNotifPrefs,
  userWantsNotification,
  createUserNotification
};
