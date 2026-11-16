"use strict";

/** @type {Map<string, Set<object>>} */
const presence = new Map();

function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function trackPresence(ws, userId, onBecameOnline) {
  if (!isUuid(userId)) return;
  const prev = ws.userId;
  if (prev && prev !== userId) untrackPresence(ws, onBecameOnline);
  ws.userId = userId;
  let set = presence.get(userId);
  if (!set) {
    set = new Set();
    presence.set(userId, set);
  }
  const wasOffline = set.size === 0;
  set.add(ws);
  if (wasOffline && typeof onBecameOnline === "function") onBecameOnline(userId, true);
}

function untrackPresence(ws, onBecameOffline) {
  const userId = ws.userId;
  if (!userId) return;
  const set = presence.get(userId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) {
      presence.delete(userId);
      if (typeof onBecameOffline === "function") onBecameOffline(userId, false);
    }
  }
  ws.userId = "";
}

function isUserOnline(userId) {
  const set = presence.get(userId);
  return !!(set && set.size);
}

function sendToUser(userId, obj, sendFn) {
  const set = presence.get(userId);
  if (!set) return 0;
  let n = 0;
  for (const sock of set) {
    sendFn(sock, obj);
    n += 1;
  }
  return n;
}

function filterOnline(ids) {
  return (ids || []).filter(isUserOnline);
}

module.exports = {
  trackPresence,
  untrackPresence,
  isUserOnline,
  sendToUser,
  filterOnline
};
