"use strict";

const { getGameApi } = require("../dashboard/bridge");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPersonalKind(kind) {
  return kind === "danger" || kind === "alert";
}

function toastPayload(ann) {
  return {
    id: ann.id,
    title: ann.title,
    body: ann.body,
    kind: ann.kind || "info",
    createdAt: ann.createdAt
  };
}

async function resolveRecipientIds(prisma, ann) {
  const kind = ann.kind || "info";
  if (isPersonalKind(kind)) {
    const targets = Array.isArray(ann.targetIds) ? ann.targetIds.map(String) : [];
    if (!targets.length) return [];
    const uuids = [];
    const codes = [];
    const names = [];
    for (const t of targets) {
      const s = String(t || "").trim();
      if (!s) continue;
      if (UUID_RE.test(s)) {
        uuids.push(s);
        continue;
      }
      const upper = s.toUpperCase().replace(/[^A-Z0-9-]/g, "");
      if (/^NV-[A-Z0-9]{6}$/.test(upper)) codes.push(upper);
      else if (/^[A-Z0-9]{6}$/.test(upper)) codes.push("NV-" + upper);
      else names.push(s);
    }
    const or = [];
    if (uuids.length) or.push({ id: { in: uuids } });
    if (codes.length) or.push({ friendCode: { in: codes } });
    if (names.length) {
      or.push({ username: { in: names, mode: "insensitive" } });
      or.push({ displayName: { in: names, mode: "insensitive" } });
    }
    if (!or.length) return [];
    const rows = await prisma.user.findMany({
      where: { status: "active", OR: or },
      select: { id: true },
      take: 200
    });
    return [...new Set(rows.map((r) => r.id))];
  }

  const rows = await prisma.user.findMany({
    where: { status: "active" },
    select: { id: true },
    take: 5000
  });
  return rows.map((r) => r.id);
}

/**
 * Fan-out inbox rows + live WS toast. Idempotent via publishedAt.
 * @returns {Promise<object|null>} updated announcement or null if skipped
 */
async function publishAnnouncement(prisma, announcementId) {
  const ann = await prisma.announcement.findUnique({ where: { id: announcementId } });
  if (!ann || !ann.active || ann.publishedAt) return null;

  const now = new Date();
  if (ann.startsAt && ann.startsAt > now) return null;
  if (ann.endsAt && ann.endsAt < now) return null;

  const recipientIds = await resolveRecipientIds(prisma, ann);
  const type = "announcement";
  const title = String(ann.title).slice(0, 160);
  const body = String(ann.body || "").slice(0, 8000);
  const payload = { announcementId: ann.id, kind: ann.kind || "info" };

  const BATCH = 200;
  for (let i = 0; i < recipientIds.length; i += BATCH) {
    const chunk = recipientIds.slice(i, i + BATCH);
    await prisma.notification.createMany({
      data: chunk.map((userId) => ({
        userId,
        type,
        title,
        body,
        payload
      }))
    });
  }

  const updated = await prisma.announcement.update({
    where: { id: ann.id },
    data: { publishedAt: now }
  });

  const game = getGameApi();
  const toast = toastPayload(updated);
  if (game && typeof game.pushAnnouncement === "function") {
    game.pushAnnouncement(toast, isPersonalKind(ann.kind) ? recipientIds : null);
  }

  return updated;
}

/** Publish every due scheduled/active announcement that has not been fanned out yet. */
async function publishDueAnnouncements(prisma) {
  if (!prisma) return 0;
  const now = new Date();
  const due = await prisma.announcement.findMany({
    where: {
      active: true,
      publishedAt: null,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }
      ]
    },
    take: 20,
    orderBy: { createdAt: "asc" }
  });
  let n = 0;
  for (const a of due) {
    const out = await publishAnnouncement(prisma, a.id);
    if (out) n += 1;
  }
  return n;
}

function isDueNow(ann, now = new Date()) {
  if (!ann || !ann.active) return false;
  if (ann.startsAt && new Date(ann.startsAt) > now) return false;
  if (ann.endsAt && new Date(ann.endsAt) < now) return false;
  return true;
}

module.exports = {
  publishAnnouncement,
  publishDueAnnouncements,
  isDueNow,
  isPersonalKind,
  toastPayload
};
