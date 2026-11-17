"use strict";

const { sendJson, readJsonBody } = require("../auth/http");
const { requireAuth } = require("../auth/middleware");
const { areFriends, listAcceptedFriendIds, publicFriendUser } = require("../auth/friends");
const { getGameApi } = require("../dashboard/bridge");
const { rateLimit } = require("../auth/rate-limit");

function method(req) {
  return String(req.method || "GET").toUpperCase();
}

function requireRegistered(auth, res) {
  if (!auth.user || auth.user.accountType !== "registered") {
    sendJson(res, 403, { error: "registered_only" });
    return false;
  }
  return true;
}

function publicDm(row) {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt,
    readAt: row.readAt || null,
    senderId: row.senderId,
    recipientId: row.recipientId,
    sender: row.sender ? publicFriendUser(row.sender) : null
  };
}

async function unreadCount(prisma, userId) {
  return prisma.directMessage.count({
    where: { recipientId: userId, readAt: null }
  });
}

async function handleUnread(req, res) {
  if (method(req) !== "GET") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  const auth = await requireAuth(req, res);
  if (!auth) return true;
  if (!requireRegistered(auth, res)) return true;
  const count = await unreadCount(auth.prisma, auth.user.id);
  sendJson(res, 200, { unread: count });
  return true;
}

async function handleConversations(req, res) {
  if (method(req) !== "GET") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  const auth = await requireAuth(req, res);
  if (!auth) return true;
  if (!requireRegistered(auth, res)) return true;
  const me = auth.user.id;
  const friendIds = await listAcceptedFriendIds(auth.prisma, me);
  if (!friendIds.length) {
    sendJson(res, 200, { conversations: [], unread: 0 });
    return true;
  }

  const recent = await auth.prisma.directMessage.findMany({
    where: {
      OR: [
        { senderId: me, recipientId: { in: friendIds } },
        { recipientId: me, senderId: { in: friendIds } }
      ]
    },
    orderBy: { createdAt: "desc" },
    take: 400,
    include: {
      sender: { select: { id: true, displayName: true, avatarUrl: true, friendCode: true } },
      recipient: { select: { id: true, displayName: true, avatarUrl: true, friendCode: true } }
    }
  });

  const byPeer = new Map();
  for (const row of recent) {
    const peerId = row.senderId === me ? row.recipientId : row.senderId;
    if (byPeer.has(peerId)) continue;
    const peer = row.senderId === me ? row.recipient : row.sender;
    byPeer.set(peerId, {
      user: publicFriendUser(peer),
      lastMessage: {
        id: row.id,
        body: row.body,
        createdAt: row.createdAt,
        mine: row.senderId === me,
        readAt: row.readAt || null
      }
    });
  }

  const unreadRows = await auth.prisma.directMessage.groupBy({
    by: ["senderId"],
    where: { recipientId: me, readAt: null, senderId: { in: friendIds } },
    _count: { _all: true }
  });
  const unreadMap = Object.fromEntries(unreadRows.map((r) => [r.senderId, r._count._all]));

  const conversations = friendIds.map((fid) => {
    const base = byPeer.get(fid) || { user: null, lastMessage: null };
    return {
      userId: fid,
      user: base.user,
      lastMessage: base.lastMessage,
      unread: unreadMap[fid] || 0
    };
  });

  // Fill missing user profiles for friends with no messages yet
  const missing = conversations.filter((c) => !c.user).map((c) => c.userId);
  if (missing.length) {
    const users = await auth.prisma.user.findMany({
      where: { id: { in: missing } },
      select: { id: true, displayName: true, avatarUrl: true, friendCode: true }
    });
    const umap = Object.fromEntries(users.map((u) => [u.id, publicFriendUser(u)]));
    for (const c of conversations) {
      if (!c.user) c.user = umap[c.userId] || { id: c.userId, displayName: "เพื่อน", avatarUrl: null };
    }
  }

  conversations.sort((a, b) => {
    const at = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const bt = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return bt - at;
  });

  const unread = await unreadCount(auth.prisma, me);
  sendJson(res, 200, { conversations, unread });
  return true;
}

async function handleThread(req, res, peerId) {
  const auth = await requireAuth(req, res);
  if (!auth) return true;
  if (!requireRegistered(auth, res)) return true;
  const me = auth.user.id;
  if (!(await areFriends(auth.prisma, me, peerId))) {
    sendJson(res, 403, { error: "friends_only" });
    return true;
  }

  if (method(req) === "GET") {
    const take = Math.min(100, Math.max(1, Number(new URL(req.url || "/", "http://x").searchParams.get("limit") || 50) || 50));
    const rows = await auth.prisma.directMessage.findMany({
      where: {
        OR: [
          { senderId: me, recipientId: peerId },
          { senderId: peerId, recipientId: me }
        ]
      },
      orderBy: { createdAt: "asc" },
      take,
      include: {
        sender: { select: { id: true, displayName: true, avatarUrl: true, friendCode: true } }
      }
    });
    // Mark peer→me as read
    await auth.prisma.directMessage.updateMany({
      where: { senderId: peerId, recipientId: me, readAt: null },
      data: { readAt: new Date() }
    });
    const peer = await auth.prisma.user.findUnique({
      where: { id: peerId },
      select: { id: true, displayName: true, avatarUrl: true, friendCode: true }
    });
    sendJson(res, 200, {
      peer: publicFriendUser(peer),
      messages: rows.map(publicDm),
      unread: await unreadCount(auth.prisma, me)
    });
    return true;
  }

  if (method(req) === "POST") {
    const limited = rateLimit("dm:" + me, 40, 60 * 1000);
    if (!limited.ok) {
      sendJson(res, 429, { error: "too_many", retryAfterSec: limited.retryAfterSec || 60 });
      return true;
    }
    const body = await readJsonBody(req).catch(() => null);
    const text = String((body && body.body) || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 280);
    if (text.length < 1) {
      sendJson(res, 400, { error: "empty" });
      return true;
    }
    const row = await auth.prisma.directMessage.create({
      data: { senderId: me, recipientId: peerId, body: text },
      include: {
        sender: { select: { id: true, displayName: true, avatarUrl: true, friendCode: true } }
      }
    });
    const payload = publicDm(row);
    const game = getGameApi();
    if (game && typeof game.notifyUser === "function") {
      try {
        game.notifyUser(peerId, { t: "chat:dm", message: payload });
      } catch {
        /* ignore */
      }
    }
    sendJson(res, 201, { message: payload });
    return true;
  }

  sendJson(res, 405, { error: "method_not_allowed" });
  return true;
}

async function handleChatApi(req, res, pathname) {
  if (pathname === "/api/v1/chat/unread") return handleUnread(req, res);
  if (pathname === "/api/v1/chat/conversations") return handleConversations(req, res);
  const thread = pathname.match(/^\/api\/v1\/chat\/with\/([0-9a-f-]{36})$/i);
  if (thread) return handleThread(req, res, thread[1]);
  return false;
}

async function cleanupDirectMessages(prisma, retentionDays = 3) {
  const days = Math.min(30, Math.max(1, Number(retentionDays) || 3));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await prisma.directMessage.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return result.count || 0;
}

module.exports = { handleChatApi, cleanupDirectMessages, unreadCount };
