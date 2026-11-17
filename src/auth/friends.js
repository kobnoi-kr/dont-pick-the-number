"use strict";

const crypto = require("crypto");
const { sendJson, readJsonBody } = require("./http");
const { requireAuth } = require("./middleware");
const { publicUser } = require("./users");
const { rateLimit } = require("./rate-limit");
const { filterOnline } = require("../presence");

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function method(req) {
  return String(req.method || "GET").toUpperCase();
}

function publicFriendUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl || null,
    friendCode: user.friendCode || null
  };
}

function normalizeFriendCode(raw) {
  const s = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
  if (!s) return "";
  if (/^NV-[A-Z0-9]{6}$/.test(s)) return s;
  if (/^[A-Z0-9]{6}$/.test(s)) return "NV-" + s;
  return s;
}

function randomFriendCode() {
  let body = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) body += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return "NV-" + body;
}

async function ensureFriendCode(prisma, user) {
  if (!user || user.accountType !== "registered" || user.status !== "active") return user;
  if (user.friendCode) return user;
  for (let i = 0; i < 8; i++) {
    const code = randomFriendCode();
    try {
      return await prisma.user.update({
        where: { id: user.id },
        data: { friendCode: code },
        include: { userRoles: { include: { role: true } } }
      });
    } catch (err) {
      if (err && err.code === "P2002") continue;
      throw err;
    }
  }
  throw Object.assign(new Error("friend_code_failed"), { code: "friend_code_failed" });
}

function requireRegistered(auth, res) {
  if (!auth.user || auth.user.accountType !== "registered" || auth.user.status !== "active") {
    sendJson(res, 403, { error: "registered_required" });
    return false;
  }
  return true;
}

async function findExistingPair(prisma, a, b) {
  return prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a }
      ]
    }
  });
}

async function findBlockEitherWay(prisma, a, b) {
  if (!a || !b || a === b) return null;
  return prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a }
      ]
    }
  });
}

async function isBlockedByMe(prisma, meId, otherId) {
  if (!meId || !otherId || meId === otherId) return false;
  const row = await prisma.userBlock.findUnique({
    where: { blockerId_blockedId: { blockerId: meId, blockedId: otherId } },
    select: { id: true }
  });
  return !!row;
}

/** @type {Map<string, { at: number, ids: string[] }>} */
const friendIdsCache = new Map();
const FRIEND_IDS_TTL_MS = 15000;

function clearFriendIdsCache(userId) {
  if (userId) friendIdsCache.delete(String(userId));
}

async function friendshipRelation(prisma, meId, otherId) {
  if (!meId || !otherId) return { status: "none" };
  if (meId === otherId) return { status: "self" };
  const blockedByMe = await isBlockedByMe(prisma, meId, otherId);
  if (blockedByMe) return { status: "blocked", blockedByMe: true };
  const blockedEither = await findBlockEitherWay(prisma, meId, otherId);
  if (blockedEither) return { status: "blocked", blockedByMe: false };
  const row = await findExistingPair(prisma, meId, otherId);
  if (!row) return { status: "none" };
  if (row.status === "accepted") {
    return { status: "friends", friendshipId: row.id };
  }
  if (row.status === "pending") {
    if (row.requesterId === meId) {
      return { status: "outgoing", friendshipId: row.id };
    }
    return { status: "incoming", friendshipId: row.id };
  }
  return { status: "none" };
}

async function handleFriendsList(req, res) {
  if (method(req) !== "GET") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  const auth = await requireAuth(req, res);
  if (!auth) return true;
  if (!requireRegistered(auth, res)) return true;

  const me = await ensureFriendCode(auth.prisma, auth.user);
  const rows = await auth.prisma.friendship.findMany({
    where: {
      OR: [{ requesterId: me.id }, { addresseeId: me.id }],
      status: { in: ["pending", "accepted"] }
    },
    include: {
      requester: true,
      addressee: true
    },
    orderBy: { updatedAt: "desc" }
  });

  const friends = [];
  const incoming = [];
  const outgoing = [];

  for (const row of rows) {
    const other = row.requesterId === me.id ? row.addressee : row.requester;
    if (!other || other.status !== "active") continue;
    const item = {
      friendshipId: row.id,
      status: row.status,
      user: publicFriendUser(other),
      createdAt: row.createdAt
    };
    if (row.status === "accepted") friends.push(item);
    else if (row.requesterId === me.id) outgoing.push(item);
    else incoming.push(item);
  }

  const blockRows = await auth.prisma.userBlock.findMany({
    where: { blockerId: me.id },
    include: { blocked: true },
    orderBy: { createdAt: "desc" }
  });
  const blocked = [];
  for (const row of blockRows) {
    if (!row.blocked || row.blocked.status !== "active") continue;
    blocked.push({
      blockId: row.id,
      user: publicFriendUser(row.blocked),
      createdAt: row.createdAt
    });
  }

  sendJson(res, 200, {
    me: publicUser(me),
    friends,
    incoming,
    outgoing,
    blocked
  });
  return true;
}

async function handleFriendsSearch(req, res) {
  if (method(req) !== "GET") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  const auth = await requireAuth(req, res);
  if (!auth) return true;
  if (!requireRegistered(auth, res)) return true;

  const url = new URL(req.url || "/", "http://localhost");
  const q = String(url.searchParams.get("q") || "").trim().replace(/\s+/g, " ").slice(0, 64);
  if (q.length < 2) {
    sendJson(res, 200, { users: [] });
    return true;
  }

  const me = auth.user;
  const related = await auth.prisma.friendship.findMany({
    where: {
      OR: [{ requesterId: me.id }, { addresseeId: me.id }],
      status: { in: ["pending", "accepted"] }
    },
    select: { requesterId: true, addresseeId: true }
  });
  const exclude = new Set([me.id]);
  for (const r of related) {
    exclude.add(r.requesterId);
    exclude.add(r.addresseeId);
  }
  const myBlocks = await auth.prisma.userBlock.findMany({
    where: {
      OR: [{ blockerId: me.id }, { blockedId: me.id }]
    },
    select: { blockerId: true, blockedId: true }
  });
  for (const b of myBlocks) {
    exclude.add(b.blockerId === me.id ? b.blockedId : b.blockerId);
  }

  const users = await auth.prisma.user.findMany({
    where: {
      accountType: "registered",
      status: "active",
      id: { notIn: Array.from(exclude) },
      displayName: { contains: q, mode: "insensitive" }
    },
    take: 10,
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true, avatarUrl: true, friendCode: true }
  });

  sendJson(res, 200, { users: users.map(publicFriendUser) });
  return true;
}

async function handleFriendRequest(req, res) {
  if (method(req) !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  const auth = await requireAuth(req, res);
  if (!auth) return true;
  if (!requireRegistered(auth, res)) return true;

  const rl = rateLimit("friend_req:" + auth.user.id, 30, 15 * 60 * 1000);
  if (!rl.ok) {
    sendJson(res, 429, { error: "rate_limited", retryAfterSec: rl.retryAfterSec });
    return true;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return true;
  }

  await ensureFriendCode(auth.prisma, auth.user);

  let target = null;
  const friendCode = normalizeFriendCode(body.friendCode);
  if (friendCode) {
    target = await auth.prisma.user.findFirst({
      where: { friendCode, accountType: "registered", status: "active" }
    });
  } else if (body.userId) {
    target = await auth.prisma.user.findFirst({
      where: {
        id: String(body.userId),
        accountType: "registered",
        status: "active"
      }
    });
  }

  if (!target) {
    sendJson(res, 404, { error: "user_not_found" });
    return true;
  }
  if (target.id === auth.user.id) {
    sendJson(res, 400, { error: "cannot_friend_self" });
    return true;
  }

  const blocked = await findBlockEitherWay(auth.prisma, auth.user.id, target.id);
  if (blocked) {
    sendJson(res, 403, { error: "user_blocked" });
    return true;
  }

  const existing = await findExistingPair(auth.prisma, auth.user.id, target.id);
  if (existing) {
    if (existing.status === "accepted") {
      sendJson(res, 409, { error: "already_friends" });
      return true;
    }
    if (existing.status === "pending") {
      if (existing.addresseeId === auth.user.id) {
        const updated = await auth.prisma.friendship.update({
          where: { id: existing.id },
          data: { status: "accepted" },
          include: { requester: true, addressee: true }
        });
        sendJson(res, 200, {
          friendshipId: updated.id,
          status: "accepted",
          user: publicFriendUser(updated.requesterId === auth.user.id ? updated.addressee : updated.requester)
        });
        return true;
      }
      sendJson(res, 409, { error: "request_pending" });
      return true;
    }
    // declined → allow re-request
    await auth.prisma.friendship.delete({ where: { id: existing.id } });
  }

  const created = await auth.prisma.friendship.create({
    data: {
      requesterId: auth.user.id,
      addresseeId: target.id,
      status: "pending"
    },
    include: { addressee: true }
  });
  sendJson(res, 200, {
    friendshipId: created.id,
    status: "pending",
    user: publicFriendUser(created.addressee)
  });
  return true;
}

async function handleFriendAccept(req, res, friendshipId) {
  if (method(req) !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  const auth = await requireAuth(req, res);
  if (!auth) return true;
  if (!requireRegistered(auth, res)) return true;

  const row = await auth.prisma.friendship.findUnique({
    where: { id: friendshipId },
    include: { requester: true, addressee: true }
  });
  if (!row || row.status !== "pending" || row.addresseeId !== auth.user.id) {
    sendJson(res, 404, { error: "request_not_found" });
    return true;
  }
  const blocked = await findBlockEitherWay(auth.prisma, auth.user.id, row.requesterId);
  if (blocked) {
    sendJson(res, 403, { error: "user_blocked" });
    return true;
  }
  const updated = await auth.prisma.friendship.update({
    where: { id: row.id },
    data: { status: "accepted" },
    include: { requester: true }
  });
  clearFriendIdsCache(auth.user.id);
  clearFriendIdsCache(updated.requesterId);
  sendJson(res, 200, {
    friendshipId: updated.id,
    status: "accepted",
    user: publicFriendUser(updated.requester)
  });
  return true;
}

async function handleFriendDecline(req, res, friendshipId) {
  if (method(req) !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  const auth = await requireAuth(req, res);
  if (!auth) return true;
  if (!requireRegistered(auth, res)) return true;

  const row = await auth.prisma.friendship.findUnique({ where: { id: friendshipId } });
  if (!row || row.status !== "pending" || row.addresseeId !== auth.user.id) {
    sendJson(res, 404, { error: "request_not_found" });
    return true;
  }
  await auth.prisma.friendship.update({
    where: { id: row.id },
    data: { status: "declined" }
  });
  sendJson(res, 200, { ok: true });
  return true;
}

async function handleFriendDelete(req, res, friendshipId) {
  if (method(req) !== "DELETE") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  const auth = await requireAuth(req, res);
  if (!auth) return true;
  if (!requireRegistered(auth, res)) return true;

  const row = await auth.prisma.friendship.findUnique({ where: { id: friendshipId } });
  if (
    !row ||
    (row.requesterId !== auth.user.id && row.addresseeId !== auth.user.id)
  ) {
    sendJson(res, 404, { error: "friendship_not_found" });
    return true;
  }
  const otherId = row.requesterId === auth.user.id ? row.addresseeId : row.requesterId;
  await auth.prisma.friendship.delete({ where: { id: row.id } });
  clearFriendIdsCache(auth.user.id);
  clearFriendIdsCache(otherId);
  sendJson(res, 200, { ok: true });
  return true;
}

async function handleFriendBlock(req, res, userId) {
  if (method(req) !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  const auth = await requireAuth(req, res);
  if (!auth) return true;
  if (!requireRegistered(auth, res)) return true;

  const targetId = String(userId || "");
  if (!targetId || targetId === auth.user.id) {
    sendJson(res, 400, { error: "cannot_block_self" });
    return true;
  }
  const target = await auth.prisma.user.findFirst({
    where: { id: targetId, accountType: "registered", status: "active" }
  });
  if (!target) {
    sendJson(res, 404, { error: "user_not_found" });
    return true;
  }

  const existing = await findExistingPair(auth.prisma, auth.user.id, target.id);
  if (existing) {
    await auth.prisma.friendship.delete({ where: { id: existing.id } });
  }

  await auth.prisma.userBlock.upsert({
    where: {
      blockerId_blockedId: { blockerId: auth.user.id, blockedId: target.id }
    },
    create: { blockerId: auth.user.id, blockedId: target.id },
    update: {}
  });
  clearFriendIdsCache(auth.user.id);
  clearFriendIdsCache(target.id);
  sendJson(res, 200, { ok: true, user: publicFriendUser(target) });
  return true;
}

async function handleFriendUnblock(req, res, userId) {
  if (method(req) !== "DELETE") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  const auth = await requireAuth(req, res);
  if (!auth) return true;
  if (!requireRegistered(auth, res)) return true;

  const targetId = String(userId || "");
  const deleted = await auth.prisma.userBlock.deleteMany({
    where: { blockerId: auth.user.id, blockedId: targetId }
  });
  if (!deleted.count) {
    sendJson(res, 404, { error: "block_not_found" });
    return true;
  }
  sendJson(res, 200, { ok: true });
  return true;
}

async function areFriends(prisma, userA, userB) {
  if (!userA || !userB || userA === userB) return false;
  const row = await prisma.friendship.findFirst({
    where: {
      status: "accepted",
      OR: [
        { requesterId: userA, addresseeId: userB },
        { requesterId: userB, addresseeId: userA }
      ]
    },
    select: { id: true }
  });
  return !!row;
}

async function listAcceptedFriendIds(prisma, userId) {
  const key = String(userId || "");
  const hit = friendIdsCache.get(key);
  if (hit && Date.now() - hit.at < FRIEND_IDS_TTL_MS) return hit.ids.slice();
  const rows = await prisma.friendship.findMany({
    where: {
      status: "accepted",
      OR: [{ requesterId: userId }, { addresseeId: userId }]
    },
    select: { requesterId: true, addresseeId: true }
  });
  const ids = [];
  for (const row of rows) {
    ids.push(row.requesterId === userId ? row.addresseeId : row.requesterId);
  }
  friendIdsCache.set(key, { at: Date.now(), ids });
  // Soft cap: drop oldest-ish entries if map grows large
  if (friendIdsCache.size > 2000) {
    const first = friendIdsCache.keys().next().value;
    if (first != null) friendIdsCache.delete(first);
  }
  return ids.slice();
}

async function handleFriendsOnline(req, res) {
  if (method(req) !== "GET") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  const auth = await requireAuth(req, res);
  if (!auth) return true;
  if (!requireRegistered(auth, res)) return true;
  const ids = await listAcceptedFriendIds(auth.prisma, auth.user.id);
  sendJson(res, 200, { online: filterOnline(ids) });
  return true;
}

async function handleFriendsApi(req, res, pathname) {
  if (pathname === "/api/v1/friends") return handleFriendsList(req, res);
  if (pathname === "/api/v1/friends/search") return handleFriendsSearch(req, res);
  if (pathname === "/api/v1/friends/request") return handleFriendRequest(req, res);
  if (pathname === "/api/v1/friends/online") return handleFriendsOnline(req, res);

  const block = pathname.match(/^\/api\/v1\/friends\/([0-9a-f-]{36})\/block$/i);
  if (block) {
    if (method(req) === "POST") return handleFriendBlock(req, res, block[1]);
    if (method(req) === "DELETE") return handleFriendUnblock(req, res, block[1]);
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }

  const accept = pathname.match(/^\/api\/v1\/friends\/([0-9a-f-]{36})\/accept$/i);
  if (accept) return handleFriendAccept(req, res, accept[1]);
  const decline = pathname.match(/^\/api\/v1\/friends\/([0-9a-f-]{36})\/decline$/i);
  if (decline) return handleFriendDecline(req, res, decline[1]);
  const del = pathname.match(/^\/api\/v1\/friends\/([0-9a-f-]{36})$/i);
  if (del) return handleFriendDelete(req, res, del[1]);

  return false;
}

module.exports = {
  ensureFriendCode,
  areFriends,
  listAcceptedFriendIds,
  publicFriendUser,
  normalizeFriendCode,
  friendshipRelation,
  findBlockEitherWay,
  handleFriendsApi
};
