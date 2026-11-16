require("dotenv").config();
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");
const { handleAuthApi } = require("./src/auth/routes");
const { authEnabled, getPrisma } = require("./src/db");
const { areFriends, listAcceptedFriendIds } = require("./src/auth/friends");
const {
  trackPresence: trackPresenceCore,
  untrackPresence: untrackPresenceCore,
  isUserOnline,
  sendToUser: sendToUserCore,
  filterOnline
} = require("./src/presence");
const { handleDashboardApi } = require("./src/dashboard/routes");
const { attachGameApi } = require("./src/dashboard/bridge");
const { persistFinishedGame } = require("./src/dashboard/persist");

const PORT = Number(process.env.PORT) || 8787;
/** Bind host: 0.0.0.0 = ทุก interface (LAN/สาธารณะ), 127.0.0.1 = เฉพาะเครื่องนี้ */
const HOST = process.env.HOST || "0.0.0.0";
/** Admin dashboard — default localhost-only so public users cannot reach it */
const ADMIN_PORT = Number(process.env.ADMIN_PORT || 9100);
const ADMIN_HOST = process.env.ADMIN_HOST || "127.0.0.1";
const MAX_PLAYERS = 12;
const MAX_ROOMS = 200;
const SEAT_MS = 45000;
const ROOM_MS = 60000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const PUBLIC_PAGE = fs.existsSync(path.join(PUBLIC, "play.html")) ? "play.html" : "index.html";
const ADMIN_PAGE = fs.existsSync(path.join(PUBLIC, "index.html")) ? "index.html" : PUBLIC_PAGE;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

/** โดเมนที่อนุญาตให้เข้า (จาก APP_BASE_URL + ALLOWED_HOSTS) — บล็อกการเข้าผ่าน IP */
function collectAllowedHosts() {
  const hosts = new Set();
  const add = (value) => {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return;
    try {
      const url = raw.includes("://") ? new URL(raw) : new URL("http://" + raw);
      if (url.hostname) hosts.add(url.hostname.toLowerCase());
    } catch {
      const host = raw.split("/")[0].replace(/:\d+$/, "");
      if (host) hosts.add(host);
    }
  };
  add(process.env.APP_BASE_URL);
  for (const part of String(process.env.ALLOWED_HOSTS || "").split(",")) add(part);
  add(process.env.RENDER_EXTERNAL_HOSTNAME);
  return hosts;
}
const ALLOWED_HOSTS = collectAllowedHosts();
const ENFORCE_HOST =
  process.env.ENFORCE_HOST === "1" ||
  (process.env.ENFORCE_HOST !== "0" &&
    ALLOWED_HOSTS.size > 0 &&
    ![...ALLOWED_HOSTS].every((h) => h === "localhost" || h === "127.0.0.1" || h === "::1"));

function isIpHostname(hostname) {
  const h = String(hostname || "").replace(/^\[|\]$/g, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  if (h.includes(":")) return true;
  return false;
}
function isLoopbackHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}
function requestHostname(req) {
  const raw = String(req.headers.host || "").split(",")[0].trim();
  if (!raw) return "";
  try {
    return new URL("http://" + raw).hostname.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}
function hostAllowed(req) {
  if (!ENFORCE_HOST) return true;
  const hostname = requestHostname(req);
  if (!hostname) return false;
  if (isIpHostname(hostname)) return false;
  if (isLoopbackHost(hostname)) return true;
  return ALLOWED_HOSTS.has(hostname);
}
function rejectWrongHost(req, res) {
  const base = String(process.env.APP_BASE_URL || "").replace(/\/$/, "");
  if (base && (req.method === "GET" || req.method === "HEAD")) {
    let pathQuery = req.url || "/";
    try {
      const u = new URL(req.url || "/", "http://localhost");
      pathQuery = u.pathname + u.search;
    } catch {
      /* keep raw */
    }
    res.writeHead(301, { Location: base + pathQuery });
    res.end();
    return;
  }
  res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(base ? "กรุณาเข้าผ่าน " + base : "Forbidden host");
}

const rooms = new Map();
const byWs = new Map();
const watchers = new Set();
/** @type {Map<string, { id: string, code: string, fromUserId: string, toUserId: string, fromName: string, fromAvatar: string, roomTitle: string, expires: number }>} */
const roomInvites = new Map();
/** one pending invite per invitee */
const inviteByUser = new Map();
const INVITE_MS = 60000;

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}
async function notifyFriendPresence(userId, online) {
  if (!authEnabled()) return;
  try {
    const prisma = await getPrisma();
    const friendIds = await listAcceptedFriendIds(prisma, userId);
    const msg = { t: "friendPresence", userId, online: !!online };
    for (const fid of friendIds) sendToUser(fid, msg);
  } catch (err) {
    /* ignore presence fanout errors */
  }
}
function trackPresence(ws, userId) {
  trackPresenceCore(ws, userId, (id, on) => {
    notifyFriendPresence(id, on).catch(() => {});
  });
}
function untrackPresence(ws) {
  untrackPresenceCore(ws, (id, on) => {
    notifyFriendPresence(id, on).catch(() => {});
  });
}
function sendToUser(userId, obj) {
  return sendToUserCore(userId, obj, send);
}
function purgeInvite(inviteId) {
  const inv = roomInvites.get(inviteId);
  if (!inv) return;
  roomInvites.delete(inviteId);
  if (inviteByUser.get(inv.toUserId) === inviteId) inviteByUser.delete(inv.toUserId);
}
function clearInviteForUser(userId) {
  const id = inviteByUser.get(userId);
  if (id) purgeInvite(id);
}
function cleanName(value) {
  return String(value || "").replace(/[\u0000-\u001f]/g, "").trim().replace(/\s+/g, " ").slice(0, 24);
}
function cleanRoomTitle(value) {
  return String(value || "").replace(/[\u0000-\u001f]/g, "").trim().replace(/\s+/g, " ").slice(0, 32);
}
function cleanAvatar(value) {
  if (value == null || value === "") return "";
  const raw = String(value).trim();
  if (!raw || raw.length > 24000) return "";
  if (/^https:\/\/[^\s]{1,2000}$/i.test(raw)) return raw.slice(0, 2000);
  if (
    /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(raw) &&
    raw.length <= 24000
  ) {
    return raw.replace(/\s+/g, "");
  }
  return "";
}
function validToken(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
function allow(ws) {
  const now = Date.now();
  if (!ws.rl || now - ws.rl.t > 1000) ws.rl = { t: now, n: 0 };
  ws.rl.n += 1;
  return ws.rl.n <= 40;
}
function makeCode() {
  for (let i = 0; i < 30; i++) {
    const code = String(100000 + Math.floor(Math.random() * 900000));
    if (!rooms.has(code)) return code;
  }
  return "";
}
function findSeat(token) {
  if (!token) return null;
  for (const room of rooms.values()) {
    const player = room.players.find((item) => item.id === token);
    if (player) return { room, player };
  }
  return null;
}
function byName(room, name) {
  return room.players.find((item) => item.name === name) || null;
}
function scoreOf(room, player) {
  if (!player) return 0;
  return room.cat === "wheel" ? player.scoreWheel : player.scoreSecret;
}
function scoreByName(room, name) {
  return scoreOf(room, byName(room, name));
}
function addPoint(room, name) {
  const player = byName(room, name);
  if (!player) return;
  if (room.cat === "wheel") player.scoreWheel += 1;
  else player.scoreSecret += 1;
}
function clearPoints(room) {
  room.players.forEach((player) => {
    if (room.cat === "wheel") player.scoreWheel = 0;
    else player.scoreSecret = 0;
  });
}
function currentName(room) {
  if (!room.alive.length) return "";
  const index = ((room.turn % room.alive.length) + room.alive.length) % room.alive.length;
  return room.alive[index];
}
function orderReady(room) {
  const names = room.players.map((player) => player.name);
  if (names.length < 2) return false;
  if (room.order.length !== names.length) return false;
  const seen = Object.create(null);
  for (const name of room.order) {
    if (!names.includes(name) || seen[name]) return false;
    seen[name] = 1;
  }
  return true;
}
function isBot(player) {
  return !!(player && player.bot);
}
function canTakeTurn(player) {
  return !!(player && (player.bot || player.auto || player.connected));
}
function hasHumanOnline(room) {
  return room.players.some((player) => !isBot(player) && player.connected);
}
function liveCount(room) {
  return room.players.filter((player) => isBot(player) || player.connected).length;
}
function yourTurn(room, player) {
  if (!player || !canTakeTurn(player)) return false;
  if (room.phase === "play") return currentName(room) === player.name;
  if (room.phase === "pick") {
    const each = Math.max(room.pickEach, 1);
    const total = room.wheelOrder.length * each;
    if (room.pickCursor >= total) return false;
    return room.wheelOrder[Math.floor(room.pickCursor / each)] === player.name;
  }
  return false;
}
function turnPlayer(room) {
  if (room.phase === "play") return byName(room, currentName(room));
  if (room.phase === "pick") {
    const each = Math.max(room.pickEach, 1);
    const total = room.wheelOrder.length * each;
    if (room.pickCursor >= total) return null;
    return byName(room, room.wheelOrder[Math.floor(room.pickCursor / each)]);
  }
  return null;
}
function makeBot(room) {
  let n = 1;
  while (room.players.some((player) => player.name === "บอท " + n)) n += 1;
  return {
    id: "bot-" + crypto.randomUUID(),
    name: "บอท " + n,
    avatarUrl: "",
    bot: true,
    auto: true,
    ws: null,
    connected: true,
    scoreSecret: 0,
    scoreWheel: 0,
    lastSeen: Date.now()
  };
}
function checkRange(min, max) {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) return "กรอกจำนวนเต็มเท่านั้น";
  if (min >= max) return "เลขต่ำสุดต้องน้อยกว่าเลขสูงสุด";
  if (max - min + 1 > 1000000) return "ช่วงตัวเลขต้องไม่เกิน 1,000,000 จำนวน";
  return "";
}
function checkCount(min, max, count) {
  if (!Number.isSafeInteger(count) || count < 1) return "จำนวนเลขลับต้องเป็นจำนวนเต็มตั้งแต่ 1";
  if (count > max - min + 1) return "จำนวนเลขลับต้องไม่เกินจำนวนตัวเลขในช่วง";
  return "";
}
function checkWin(target) {
  if (!Number.isSafeInteger(target) || target < 1) return "แต้มที่ชนะต้องเป็นจำนวนเต็มตั้งแต่ 1";
  if (target > 999) return "แต้มที่ชนะต้องไม่เกิน 999";
  return "";
}
function drawSecrets(min, max, count) {
  const span = max - min + 1;
  if (count >= span) {
    const all = [];
    for (let n = min; n <= max; n++) all.push(n);
    return all;
  }
  const pick = count > span / 2 ? span - count : count;
  const bag = new Set();
  while (bag.size < pick) bag.add(Math.floor(Math.random() * span) + min);
  if (count <= span / 2) return [...bag].sort((a, b) => a - b);
  const secrets = [];
  for (let n = min; n <= max; n++) if (!bag.has(n)) secrets.push(n);
  return secrets;
}
function joinThai(names) {
  if (names.length <= 1) return names[0] || "";
  if (names.length === 2) return names.join(" กับ ");
  return names.slice(0, -1).join(", ") + " และ " + names[names.length - 1];
}
function cancelSpin(room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
  room.activeSpin = null;
}
function clearTurnTimer(room) {
  if (room.turnTimer) clearTimeout(room.turnTimer);
  room.turnTimer = null;
  room.turnUntil = 0;
}
function blankRoom(code, visibility, host) {
  return {
    code,
    visibility,
    title: "",
    hostId: host.id,
    created: Date.now(),
    players: [host],
    phase: "lobby",
    cat: "secret",
    rangeMode: "99",
    min: 1,
    max: 99,
    winTarget: 3,
    secretCount: 1,
    pickEach: 1,
    turnSec: 0,
    pointAll: true,
    order: [],
    rot: 0,
    alive: [],
    roundOrder: [],
    turn: 0,
    gameMin: 1,
    gameMax: 99,
    lo: 1,
    hi: 99,
    secrets: [],
    secretAll: [],
    secretTotal: 1,
    picked: [],
    wheelMin: 1,
    wheelMax: 99,
    wheelOrder: [],
    picks: {},
    pickCursor: 0,
    wheelAlive: [],
    wheelLog: [],
    wheelGone: [],
    wheelRot: 0,
    over: null,
    activeSpin: null,
    timer: null,
    turnTimer: null,
    turnUntil: 0,
    emptyTimer: null,
    spectators: [],
    startedAt: null,
    _persisted: false
  };
}
function applyRoomSetup(room, setup) {
  if (!setup || typeof setup !== "object") return;
  if (setup.cat === "wheel" || setup.cat === "secret") room.cat = setup.cat;
  if (setup.rangeMode === "99" || setup.rangeMode === "999" || setup.rangeMode === "9999") {
    room.rangeMode = setup.rangeMode;
    room.min = 1;
    room.max = Number(setup.rangeMode);
  }
  if (Number.isInteger(setup.winTarget) && setup.winTarget > 0) room.winTarget = Math.min(99, setup.winTarget);
  if (Number.isInteger(setup.turnSec) && setup.turnSec >= 0) room.turnSec = Math.min(120, setup.turnSec);
  if (Number.isInteger(setup.secretCount) && setup.secretCount > 0) room.secretCount = Math.min(20, setup.secretCount);
  if (Number.isInteger(setup.pickEach) && setup.pickEach > 0) room.pickEach = Math.min(10, setup.pickEach);
  if (Number.isInteger(setup.min) && Number.isInteger(setup.max) && setup.max > setup.min) {
    room.rangeMode = "custom";
    room.min = setup.min;
    room.max = setup.max;
  }
  if (typeof setup.title === "string") {
    const title = cleanRoomTitle(setup.title);
    if (title) room.title = title;
  }
}
function publicSpin(spin) {
  if (!spin) return null;
  return {
    id: spin.id,
    kind: spin.kind,
    dur: spin.dur,
    left: Math.max(0, spin.until - Date.now()),
    rot: spin.rot || 0,
    from: spin.from || 0,
    target: spin.target || 0,
    n: Number.isInteger(spin.n) ? spin.n : null,
    hit: !!spin.hit,
    owner: spin.owner || ""
  };
}
function roomLabel(room) {
  const title = cleanRoomTitle(room.title);
  if (title) return title;
  const host = room.players.find((item) => item.id === room.hostId);
  return host ? ("ห้องของ " + host.name) : ("ห้อง " + room.code);
}
function snap(room, player, opts) {
  const spectator = !!(opts && opts.spectator);
  const base = {
    t: "state",
    code: room.code,
    visibility: room.visibility,
    title: room.title || "",
    roomLabel: roomLabel(room),
    hostId: room.hostId,
    youId: player ? player.id : "",
    spectator,
    phase: room.phase,
    cat: room.cat,
    rangeMode: room.rangeMode,
    min: room.min,
    max: room.max,
    winTarget: room.winTarget,
    secretCount: room.secretCount,
    pickEach: room.pickEach,
    pointAll: room.pointAll,
    maxPlayers: MAX_PLAYERS,
    spectatorCount: Array.isArray(room.spectators) ? room.spectators.length : 0,
    players: room.players.map((item) => ({
      id: item.id,
      name: item.name,
      avatarUrl: item.avatarUrl || "",
      score: scoreOf(room, item),
      connected: item.connected,
      host: item.id === room.hostId,
      bot: !!item.bot,
      auto: !!(item.auto || item.bot)
    })),
    youAuto: !!(player && (player.auto || player.bot)),
    order: room.order,
    alive: room.alive,
    roundOrder: room.roundOrder,
    turn: room.turn,
    gameMin: room.gameMin,
    gameMax: room.gameMax,
    lo: room.lo,
    hi: room.hi,
    secretsLeft: room.secrets.length,
    secretTotal: room.secretTotal,
    picked: room.picked.map((item) => ({ n: item.n, who: item.who, hit: !!item.hit })),
    revealed: room.phase === "over" && room.cat !== "wheel" ? room.secretAll.slice() : [],
    wheelMin: room.wheelMin,
    wheelMax: room.wheelMax,
    wheelOrder: room.wheelOrder,
    picks: spectator && room.phase !== "over" ? {} : room.picks,
    pickCursor: room.pickCursor,
    wheelAlive: room.wheelAlive,
    wheelLog: room.wheelLog.map((item) => ({ n: item.n, who: item.who })),
    wheelGone: Array.isArray(room.wheelGone) ? room.wheelGone.slice() : [],
    wheelRot: room.wheelRot,
    orderRot: room.rot,
    over: room.over,
    activeSpin: publicSpin(room.activeSpin),
    turnSec: room.turnSec || 0,
    turnLeft: room.turnUntil ? Math.max(0, room.turnUntil - Date.now()) : 0,
    yourTurn: spectator ? false : yourTurn(room, player)
  };
  return base;
}
function lobbyMsg() {
  const list = [];
  for (const room of rooms.values()) {
    if (!room.players.some((item) => item.connected)) continue;
    const host = room.players.find((item) => item.id === room.hostId);
    const count = room.players.filter((item) => item.connected).length;
    const priv = room.visibility === "private";
    list.push({
      code: priv ? "" : room.code,
      visibility: priv ? "private" : "public",
      title: roomLabel(room),
      host: host ? host.name : "",
      count,
      max: MAX_PLAYERS,
      cat: room.cat,
      phase: room.phase,
      joinable: room.phase === "lobby" && room.players.length < MAX_PLAYERS,
      created: room.created || 0
    });
  }
  list.sort((a, b) => {
    const ap = a.visibility === "private" ? 1 : 0;
    const bp = b.visibility === "private" ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return (b.created || 0) - (a.created || 0);
  });
  return { t: "lobby", rooms: list.slice(0, 50) };
}
function broadcastLobby() {
  const msg = lobbyMsg();
  for (const ws of watchers) send(ws, msg);
}
function broadcast(room) {
  for (const player of room.players) send(player.ws, snap(room, player));
  if (Array.isArray(room.spectators)) {
    for (const sp of room.spectators) send(sp.ws, snap(room, null, { spectator: true }));
  }
  broadcastLobby();
  if (room.phase === "over") {
    persistFinishedGame(room, scoreOf).catch(() => {});
  }
}
function fail(ws, message) {
  send(ws, { t: "err", message });
}
function scheduleDelete(room) {
  if (room.emptyTimer) return;
  if (room.holdUntil && Date.now() < room.holdUntil) {
    room.emptyTimer = setTimeout(() => {
      room.emptyTimer = null;
      scheduleDelete(room);
    }, Math.max(1000, room.holdUntil - Date.now()));
    return;
  }
  room.emptyTimer = setTimeout(() => {
    room.emptyTimer = null;
    if (room.players.some((player) => player.connected)) return;
    if (Array.isArray(room.spectators) && room.spectators.length) return;
    cancelSpin(room);
    rooms.delete(room.code);
    broadcastLobby();
  }, ROOM_MS);
}
function attach(ws, room, player) {
  watchers.delete(ws);
  if (player.ws && player.ws !== ws) {
    const old = player.ws;
    player.ws = null;
    byWs.delete(old);
    try { old.close(); } catch (err) {}
  }
  player.ws = ws;
  player.connected = true;
  player.lastSeen = Date.now();
  byWs.set(ws, { room, player });
  if (room.emptyTimer) {
    clearTimeout(room.emptyTimer);
    room.emptyTimer = null;
  }
  broadcast(room);
}
function skipToConnected(room) {
  if (room.phase !== "play" || room.alive.length < 2) return false;
  if (!room.alive.some((name) => canTakeTurn(byName(room, name)))) return false;
  const start = room.turn;
  let hops = 0;
  while (hops < room.alive.length) {
    if (canTakeTurn(byName(room, currentName(room)))) break;
    room.turn = (room.turn + 1) % room.alive.length;
    hops += 1;
  }
  return room.turn !== start;
}
function finishRound(room) {
  const left = room.roundOrder.filter((name) => room.alive.includes(name));
  const gained = !left.length ? [] : room.pointAll ? left : [left[left.length - 1]];
  gained.forEach((name) => addPoint(room, name));
  const champs = gained.filter((name) => scoreByName(room, name) >= room.winTarget);
  const won = champs.length > 0;
  const champText = joinThai(champs);
  let title = "";
  let note = "";
  if (!room.roundOrder.length) {
    title = "คุณเลือกโดนเลขลับ!";
  } else if (won) {
    title = champText + " ชนะแล้ว!";
    note = "ถึง " + room.winTarget + " แต้ม";
  } else if (room.alive.length === 1) {
    title = room.alive[0] + " เป็นคนสุดท้าย";
    note = "ได้ 1 แต้ม";
  } else if (!room.alive.length && room.roundOrder.length > 1) {
    title = "ทุกคนโดนเลขลับ";
  } else if (!room.alive.length) {
    title = (room.roundOrder[0] || "คุณ") + " เลือกโดนเลขลับ!";
  } else if (room.pointAll) {
    title = "เลขลับหมดแล้ว";
    note = "ทุกคนได้คนละ 1 แต้ม ยกเว้นคนที่โดนเลขลับ";
  } else {
    title = gained[0] + " เป็นคนสุดท้าย";
    note = "ได้ 1 แต้ม";
  }
  const outOrder = [];
  room.picked.forEach((item) => {
    if (item && item.hit && item.who && !outOrder.includes(item.who)) outOrder.push(item.who);
  });
  clearTurnTimer(room);
  room.phase = "over";
  room.activeSpin = null;
  room.over = {
    title,
    note,
    outOrder,
    secretLabel: "เลขลับคือ",
    secretText: room.secretAll.join(", "),
    many: room.secretAll.length > 3,
    hist: null,
    again: won ? "เริ่มแมตช์ใหม่" : "เล่นอีกครั้ง",
    reset: won,
    mode: ""
  };
}
function openPlayNums(room) {
  const used = new Set(room.picked.map((item) => item.n));
  const nums = [];
  for (let n = room.lo; n <= room.hi; n++) if (!used.has(n)) nums.push(n);
  return nums;
}
function openPickNums(room) {
  const used = taken(room);
  const nums = [];
  for (let n = room.wheelMin; n <= room.wheelMax; n++) if (!used.has(n)) nums.push(n);
  return nums;
}
function applyPlayChoice(room, who, n) {
  const hit = room.secrets.includes(n);
  room.picked.push({ n, who, hit });
  if (hit) {
    room.secrets = room.secrets.filter((secret) => secret !== n);
    const index = room.alive.indexOf(who);
    if (index >= 0) room.alive.splice(index, 1);
    room.turn = room.alive.length ? index % room.alive.length : 0;
    if (room.alive.length <= 1 || !room.secrets.length) {
      clearTurnTimer(room);
      finishRound(room);
      return;
    }
  } else if (room.alive.length) {
    room.turn = (room.turn + 1) % room.alive.length;
  }
  const below = room.secrets.some((secret) => secret < n);
  const above = room.secrets.some((secret) => secret > n);
  if (!below) room.lo = n + 1;
  if (!above) room.hi = n - 1;
  skipToConnected(room);
  armTurnTimer(room);
}
function applyPickChoice(room, name, n) {
  if (!room.picks[name]) room.picks[name] = [];
  room.picks[name].push(n);
  room.pickCursor += 1;
  const each = Math.max(room.pickEach, 1);
  const total = room.wheelOrder.length * each;
  if (room.pickCursor >= total) clearTurnTimer(room);
  else armTurnTimer(room);
}
function armTurnTimer(room) {
  clearTurnTimer(room);
  if (room.phase === "play") {
    if (!currentName(room) || room.alive.length < 1) return;
  } else if (room.phase === "pick") {
    const each = Math.max(room.pickEach, 1);
    const total = room.wheelOrder.length * each;
    if (room.pickCursor >= total) return;
  } else return;
  const player = turnPlayer(room);
  if (!player || !canTakeTurn(player)) return;
  const autoNow = !!(player.auto || player.bot);
  const sec = autoNow ? 0.4 : (Number.isInteger(room.turnSec) && room.turnSec > 0 ? room.turnSec : 0);
  if (sec < 0.1) return;
  const until = Date.now() + Math.round(sec * 1000);
  room.turnUntil = until;
  room.turnTimer = setTimeout(() => {
    if (room.turnUntil !== until) return;
    onTurnTimeout(room, !autoNow);
  }, Math.round(sec * 1000));
}
function onTurnTimeout(room, markAuto) {
  clearTurnTimer(room);
  const player = turnPlayer(room);
  if (markAuto && player && !isBot(player)) player.auto = true;
  if (room.phase === "play") {
    const who = currentName(room);
    if (!who) return;
    const nums = openPlayNums(room);
    if (!nums.length) return;
    applyPlayChoice(room, who, nums[Math.floor(Math.random() * nums.length)]);
    broadcast(room);
    return;
  }
  if (room.phase === "pick") {
    const each = Math.max(room.pickEach, 1);
    const total = room.wheelOrder.length * each;
    if (room.pickCursor >= total) return;
    const name = room.wheelOrder[Math.floor(room.pickCursor / each)];
    if (!name) return;
    const nums = openPickNums(room);
    if (!nums.length) return;
    applyPickChoice(room, name, nums[Math.floor(Math.random() * nums.length)]);
    broadcast(room);
  }
}
function begin(room) {
  const count = room.secretCount;
  room.gameMin = room.min;
  room.gameMax = room.max;
  room.secretTotal = count;
  room.secretAll = drawSecrets(room.min, room.max, count);
  room.secrets = room.secretAll.slice();
  room.alive = room.order.slice();
  room.roundOrder = room.order.slice();
  room.lo = room.min;
  room.hi = room.max;
  room.picked = [];
  room.turn = 0;
  room.phase = "play";
  room.over = null;
  room.startedAt = room.startedAt || Date.now();
  room._persisted = false;
  skipToConnected(room);
  armTurnTimer(room);
}
function startPick(room) {
  cancelSpin(room);
  clearTurnTimer(room);
  room.wheelMin = room.min;
  room.wheelMax = room.max;
  room.wheelOrder = room.order.slice();
  room.picks = {};
  room.pickCursor = 0;
  room.wheelAlive = [];
  room.wheelLog = [];
  room.wheelGone = [];
  room.wheelRot = 0;
  room.phase = "pick";
  room.over = null;
  room.startedAt = room.startedAt || Date.now();
  room._persisted = false;
  armTurnTimer(room);
}
function finishWheel(room) {
  clearTurnTimer(room);
  const winner = room.wheelAlive[0] || "";
  if (winner) addPoint(room, winner);
  const won = !!(winner && scoreByName(room, winner) >= room.winTarget);
  const nums = winner && Array.isArray(room.picks[winner]) ? room.picks[winner] : [];
  const text = nums.join(", ");
  const outOrder = [];
  room.wheelLog.forEach((item) => {
    if (item && item.who && !outOrder.includes(item.who)) outOrder.push(item.who);
  });
  room.phase = "over";
  room.activeSpin = null;
  room.over = {
    title: won ? winner + " ชนะแล้ว!" : winner ? winner + " เป็นคนสุดท้าย" : "ไม่มีผู้ชนะ",
    note: won ? "ถึง " + room.winTarget + " แต้ม" : winner ? "ได้ 1 แต้ม" : "",
    outOrder,
    secretLabel: winner ? "เลขที่เลือก" : "",
    secretText: text,
    many: nums.length > 1 || text.length > 4,
    hist: room.wheelLog.map((item) => ({ n: item.n, who: item.who })),
    again: won ? "เริ่มแมตช์ใหม่" : "รอบถัดไป",
    reset: won,
    mode: "wheel"
  };
}
function ownerOf(room, n) {
  for (const name of room.wheelOrder) {
    const list = room.picks[name];
    if (Array.isArray(list) && list.includes(n)) return name;
  }
  return "";
}
function wheelPool(room) {
  const gone = new Set(Array.isArray(room.wheelGone) ? room.wheelGone : []);
  const pool = [];
  for (let n = room.wheelMin; n <= room.wheelMax; n++) if (!gone.has(n)) pool.push(n);
  return pool;
}
function planNumSpin(room) {
  const pool = wheelPool(room);
  if (!pool.length) return null;
  const index = Math.floor(Math.random() * pool.length);
  const n = pool[index];
  const owner = ownerOf(room, n);
  const hit = !!(owner && room.wheelAlive.includes(owner));
  const span = pool.length;
  const slice = 360 / span;
  const margin = slice * 0.18;
  const roomj = Math.max(slice / 2 - margin, 0);
  const jitter = (Math.random() * 2 - 1) * roomj;
  const base = ((room.wheelRot % 360) + 360) % 360;
  const desiredMod = (((-index * slice + jitter) % 360) + 360) % 360;
  let delta = desiredMod - base;
  if (delta <= 0) delta += 360;
  const extra = hit ? 4 + Math.floor(Math.random() * 2) : 2;
  return { n, from: base, target: base + extra * 360 + delta, dur: hit ? 7200 : 3400, hit, owner };
}
function applyLand(room, plan) {
  room.wheelRot = plan.target;
  room.activeSpin = null;
  if (!Array.isArray(room.wheelGone)) room.wheelGone = [];
  if (!room.wheelGone.includes(plan.n)) room.wheelGone.push(plan.n);
  if (plan.hit) {
    const index = room.wheelAlive.indexOf(plan.owner);
    if (index >= 0) room.wheelAlive.splice(index, 1);
    room.wheelLog.push({ n: plan.n, who: plan.owner });
  } else {
    room.wheelLog.push({ n: plan.n, who: "" });
  }
}
function beginNumSpin(room) {
  if (room.phase !== "wheel") return;
  if (room.wheelAlive.length < 2 || !wheelPool(room).length) {
    finishWheel(room);
    broadcast(room);
    return;
  }
  const plan = planNumSpin(room);
  if (!plan) {
    finishWheel(room);
    broadcast(room);
    return;
  }
  const id = crypto.randomUUID();
  room.activeSpin = {
    id,
    kind: "num",
    dur: plan.dur,
    until: Date.now() + plan.dur,
    from: plan.from,
    target: plan.target,
    n: plan.n,
    hit: plan.hit,
    owner: plan.owner
  };
  broadcast(room);
  room.timer = setTimeout(() => {
    if (!room.activeSpin || room.activeSpin.id !== id) return;
    applyLand(room, plan);
    const delay = !plan.hit ? 450 : room.wheelAlive.length <= 1 ? 1100 : 1400;
    broadcast(room);
    room.timer = setTimeout(() => {
      if (room.phase !== "wheel") return;
      if (room.wheelAlive.length <= 1) {
        finishWheel(room);
        broadcast(room);
      } else beginNumSpin(room);
    }, delay);
  }, plan.dur);
}
function planOrderSpin(room) {
  const next = room.players.map((player) => player.name);
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = next[i];
    next[i] = next[j];
    next[j] = swap;
  }
  const names = room.players.map((player) => player.name);
  const index = Math.max(0, names.indexOf(next[0]));
  const slice = 360 / names.length;
  const margin = Math.min(slice * 0.12, 8);
  const jitter = margin + Math.random() * Math.max(slice - margin * 2, 0);
  const fromTop = index * slice + jitter;
  const current = ((room.rot % 360) + 360) % 360;
  let target = (360 - fromTop) % 360;
  let delta = target - current;
  if (delta < 0) delta += 360;
  const extra = 5 + Math.floor(Math.random() * 3);
  return { next, rot: room.rot + extra * 360 + delta, dur: 4300 };
}
function beginOrderSpin(room) {
  const plan = planOrderSpin(room);
  const id = crypto.randomUUID();
  room.activeSpin = {
    id,
    kind: "order",
    dur: plan.dur,
    until: Date.now() + plan.dur,
    from: room.rot,
    rot: plan.rot,
    next: plan.next
  };
  broadcast(room);
  room.timer = setTimeout(() => {
    if (!room.activeSpin || room.activeSpin.id !== id) return;
    room.order = plan.next.slice();
    room.rot = plan.rot;
    room.activeSpin = null;
    broadcast(room);
  }, plan.dur);
}
function dropFromRound(room, name) {
  room.order = room.order.filter((item) => item !== name);
  if (room.phase === "play") {
    room.alive = room.alive.filter((item) => item !== name);
    room.roundOrder = room.roundOrder.filter((item) => item !== name);
    if (room.turn >= room.alive.length) room.turn = 0;
    if (room.alive.length <= 1 || !room.secrets.length) finishRound(room);
    else skipToConnected(room);
  } else if (room.phase === "pick") {
    room.wheelOrder = room.wheelOrder.filter((item) => item !== name);
    delete room.picks[name];
    room.pickCursor = room.wheelOrder.reduce((sum, item) => sum + ((room.picks[item] || []).length), 0);
    if (room.wheelOrder.length < 2) {
      cancelSpin(room);
      room.phase = "lobby";
    }
  } else if (room.phase === "wheel") {
    cancelSpin(room);
    room.wheelAlive = room.wheelAlive.filter((item) => item !== name);
    room.wheelOrder = room.wheelOrder.filter((item) => item !== name);
    if (room.wheelAlive.length <= 1) finishWheel(room);
  }
}
function transferHost(room) {
  if (room.players.some((player) => player.id === room.hostId && !isBot(player))) return;
  const next = room.players.find((player) => !isBot(player) && player.connected) || room.players.find((player) => !isBot(player)) || null;
  room.hostId = next ? next.id : "";
}
function releaseSocket(ws, notify) {
  watchers.delete(ws);
  untrackPresence(ws);
  const ctx = byWs.get(ws);
  if (!ctx || ctx.player.ws !== ws) {
    byWs.delete(ws);
    return;
  }
  byWs.delete(ws);
  const { room, player } = ctx;
  player.connected = false;
  player.lastSeen = Date.now();
  player.ws = null;
  if (room.hostId === player.id) {
    const next = room.players.find((item) => !isBot(item) && item.connected);
    if (next) room.hostId = next.id;
  }
  if (notify) {
    watchers.add(ws);
    send(ws, { t: "left" });
    send(ws, lobbyMsg());
  }
  if (room.phase === "lobby") broadcast(room);
  else {
    if (room.phase === "play" && skipToConnected(room)) armTurnTimer(room);
    else if ((room.phase === "play" || room.phase === "pick") && player.auto) armTurnTimer(room);
    broadcast(room);
  }
  if (!hasHumanOnline(room)) scheduleDelete(room);
}
function tellLobby(sock) {
  if (!sock || sock.readyState !== 1) return;
  watchers.add(sock);
  send(sock, { t: "left" });
  send(sock, lobbyMsg());
}
function takeOut(room, player, ws, notify) {
  const name = player.name;
  if (player.ws) {
    const sock = player.ws;
    byWs.delete(sock);
    player.ws = null;
    if (notify && sock !== ws) tellLobby(sock);
  }
  byWs.delete(ws);
  if (notify) tellLobby(ws);
  room.players = room.players.filter((item) => item.id !== player.id);
  transferHost(room);
  if (room.phase === "lobby") {
    cancelSpin(room);
    room.order = [];
    room.rot = 0;
  } else dropFromRound(room, name);
  if (!room.players.length) scheduleDelete(room);
  else broadcast(room);
  broadcastLobby();
}
function seat(ws) {
  return byWs.get(ws) || null;
}
function hostOnly(ctx) {
  return !!(ctx && ctx.player.id === ctx.room.hostId);
}
function setInt(patch, key, min, max) {
  const value = patch[key];
  if (!Number.isInteger(value)) return null;
  return Math.min(max, Math.max(min, value));
}
function onSetup(ws, msg) {
  const ctx = seat(ws);
  if (!ctx) return;
  if (!hostOnly(ctx)) return fail(ws, "เฉพาะโฮสต์ที่ตั้งค่าห้องได้");
  if (ctx.room.phase !== "lobby" || ctx.room.activeSpin) return;
  const patch = msg.patch && typeof msg.patch === "object" ? msg.patch : {};
  const room = ctx.room;
  if (patch.cat === "wheel" || patch.cat === "secret") room.cat = patch.cat;
  if (patch.rangeMode === "99" || patch.rangeMode === "999" || patch.rangeMode === "9999" || patch.rangeMode === "custom") {
    room.rangeMode = patch.rangeMode;
    if (patch.rangeMode === "99") { room.min = 1; room.max = 99; }
    if (patch.rangeMode === "999") { room.min = 1; room.max = 999; }
    if (patch.rangeMode === "9999") { room.min = 1; room.max = 9999; }
  }
  if (room.rangeMode === "custom") {
    const min = setInt(patch, "min", -1000000000, 1000000000);
    const max = setInt(patch, "max", -1000000000, 1000000000);
    if (min != null) room.min = min;
    if (max != null) room.max = max;
  }
  const winTarget = setInt(patch, "winTarget", 1, 999);
  const secretCount = setInt(patch, "secretCount", 1, 1000000);
  const pickEach = setInt(patch, "pickEach", 1, 99);
  const turnSec = setInt(patch, "turnSec", 0, 120);
  if (winTarget != null) room.winTarget = winTarget;
  if (secretCount != null) room.secretCount = secretCount;
  if (pickEach != null) room.pickEach = pickEach;
  if (turnSec != null) room.turnSec = turnSec;
  if (typeof patch.pointAll === "boolean") room.pointAll = patch.pointAll;
  broadcast(room);
}
function onSpinOrder(ws) {
  const ctx = seat(ws);
  if (!hostOnly(ctx)) return fail(ws, "เฉพาะโฮสต์ที่สุ่มลำดับได้");
  const room = ctx.room;
  if (room.phase !== "lobby" || room.activeSpin) return;
  if (liveCount(room) < 2) return fail(ws, "ต้องมีผู้เล่นอย่างน้อย 2 คน");
  beginOrderSpin(room);
}
function onStart(ws) {
  const ctx = seat(ws);
  if (!hostOnly(ctx)) return fail(ws, "เฉพาะโฮสต์ที่เริ่มเกมได้");
  const room = ctx.room;
  if (room.phase !== "lobby" || room.activeSpin) return;
  if (liveCount(room) < 2) return fail(ws, "ต้องมีผู้เล่นอย่างน้อย 2 คน");
  if (room.players.some((item) => !isBot(item) && !item.connected)) return fail(ws, "มีผู้เล่นที่หลุดอยู่ รอให้กลับหรือเอาออกก่อน");
  if (!orderReady(room)) return fail(ws, "กดสุ่มลำดับก่อนเริ่มเกม");
  const rangeErr = checkRange(room.min, room.max);
  const winErr = checkWin(room.winTarget);
  if (room.cat === "wheel") {
    const each = room.pickEach;
    const eachErr = !Number.isInteger(each) || each < 1 ? "จำนวนเลขต่อคนต้องเป็นจำนวนเต็มตั้งแต่ 1" : each > 99 ? "จำนวนเลขต่อคนต้องไม่เกิน 99" : "";
    const err = rangeErr || winErr || eachErr;
    if (err) return fail(ws, err);
    if (room.players.length * each > room.max - room.min + 1) return fail(ws, "เลขในช่วงไม่พอให้ทุกคนเลือก");
    startPick(room);
    broadcast(room);
    return;
  }
  const err = rangeErr || checkCount(room.min, room.max, room.secretCount) || winErr;
  if (err) return fail(ws, err);
  begin(room);
  broadcast(room);
}
function taken(room) {
  const set = new Set();
  room.wheelOrder.forEach((name) => (room.picks[name] || []).forEach((n) => set.add(n)));
  return set;
}
function onPick(ws, msg) {
  const ctx = seat(ws);
  if (!ctx || ctx.room.phase !== "play") return;
  const room = ctx.room;
  const who = currentName(room);
  if (ctx.player.name !== who) return fail(ws, "ยังไม่ถึงตาคุณ");
  const n = msg.n;
  if (!Number.isSafeInteger(n)) return fail(ws, "ใส่เป็นจำนวนเต็ม");
  if (n < room.lo || n > room.hi) return fail(ws, "เลือกเลขระหว่าง " + room.lo + " ถึง " + room.hi);
  if (room.picked.some((item) => item.n === n)) return fail(ws, "เลขนี้ถูกเลือกแล้ว");
  applyPlayChoice(room, who, n);
  broadcast(room);
}
function onPickNum(ws, msg) {
  const ctx = seat(ws);
  if (!ctx || ctx.room.phase !== "pick") return;
  const room = ctx.room;
  const each = Math.max(room.pickEach, 1);
  const total = room.wheelOrder.length * each;
  if (room.pickCursor >= total) return;
  const name = room.wheelOrder[Math.floor(room.pickCursor / each)];
  if (ctx.player.name !== name) return fail(ws, "ยังไม่ถึงตาคุณ");
  const n = msg.n;
  if (!Number.isSafeInteger(n)) return fail(ws, "ใส่เป็นจำนวนเต็ม");
  if (n < room.wheelMin || n > room.wheelMax) return fail(ws, "เลือกเลขระหว่าง " + room.wheelMin + " ถึง " + room.wheelMax);
  if (taken(room).has(n)) return fail(ws, "เลขนี้มีคนเลือกแล้ว");
  applyPickChoice(room, name, n);
  broadcast(room);
}
function onUndo(ws) {
  const ctx = seat(ws);
  if (!ctx || ctx.room.phase !== "pick" || ctx.room.activeSpin) return;
  const room = ctx.room;
  if (room.pickCursor <= 0) return;
  const each = Math.max(room.pickEach, 1);
  const name = room.wheelOrder[Math.floor((room.pickCursor - 1) / each)];
  if (ctx.player.name !== name && ctx.player.id !== room.hostId) return fail(ws, "ย้อนได้เฉพาะเลขของตัวเอง");
  room.pickCursor -= 1;
  const list = room.picks[name] || [];
  list.pop();
  if (!list.length) delete room.picks[name];
  armTurnTimer(room);
  broadcast(room);
}
function onOpenWheel(ws) {
  const ctx = seat(ws);
  if (!hostOnly(ctx)) return fail(ws, "เฉพาะโฮสต์ที่เริ่มหมุนได้");
  const room = ctx.room;
  if (room.phase !== "pick") return;
  const total = room.wheelOrder.length * Math.max(room.pickEach, 1);
  if (!room.wheelOrder.length || room.pickCursor < total) return fail(ws, "ยังเลือกเลขไม่ครบ");
  cancelSpin(room);
  clearTurnTimer(room);
  room.wheelAlive = room.wheelOrder.slice();
  room.wheelLog = [];
  room.wheelGone = [];
  room.wheelRot = 0;
  room.phase = "wheel";
  broadcast(room);
}
function onSpinNum(ws) {
  const ctx = seat(ws);
  if (!hostOnly(ctx)) return fail(ws, "เฉพาะโฮสต์ที่หมุนวงล้อได้");
  const room = ctx.room;
  if (room.phase !== "wheel" || room.activeSpin) return;
  if (room.wheelAlive.length < 2) return;
  beginNumSpin(room);
}
function onRepick(ws) {
  const ctx = seat(ws);
  if (!hostOnly(ctx)) return fail(ws, "เฉพาะโฮสต์");
  const room = ctx.room;
  if (room.phase !== "wheel" || room.activeSpin || room.wheelLog.length) return;
  room.picks = {};
  room.pickCursor = 0;
  room.wheelGone = [];
  room.phase = "pick";
  armTurnTimer(room);
  broadcast(room);
}
function onAgain(ws) {
  const ctx = seat(ws);
  if (!hostOnly(ctx)) return fail(ws, "เฉพาะโฮสต์ที่เริ่มรอบใหม่ได้");
  const room = ctx.room;
  if (room.phase !== "over" || !room.over) return;
  if (!orderReady(room)) {
    room.phase = "lobby";
    room.order = [];
    broadcast(room);
    return fail(ws, "ผู้เล่นในห้องเปลี่ยน กลับไปสุ่มลำดับใหม่");
  }
  if (room.over.reset) clearPoints(room);
  if (room.over.mode === "wheel") startPick(room);
  else begin(room);
  broadcast(room);
}
function onAbort(ws) {
  const ctx = seat(ws);
  if (!hostOnly(ctx)) return fail(ws, "เฉพาะโฮสต์ที่พากลับห้องได้");
  const room = ctx.room;
  cancelSpin(room);
  clearTurnTimer(room);
  room.phase = "lobby";
  room.over = null;
  room.picked = [];
  room.alive = [];
  room.roundOrder = [];
  room.secrets = [];
  room.secretAll = [];
  room.wheelLog = [];
  room.wheelGone = [];
  room.wheelAlive = [];
  room.wheelOrder = [];
  room.picks = {};
  room.pickCursor = 0;
  room.players.forEach((player) => {
    if (!isBot(player)) player.auto = false;
  });
  broadcast(room);
}
function onClear(ws) {
  const ctx = seat(ws);
  if (!hostOnly(ctx)) return;
  const room = ctx.room;
  if (room.phase === "play" || room.phase === "pick" || room.phase === "wheel") return;
  clearPoints(room);
  broadcast(room);
}
function onKick(ws, msg) {
  const ctx = seat(ws);
  if (!hostOnly(ctx)) return;
  const id = typeof msg.id === "string" ? msg.id : "";
  if (!id || id === ctx.player.id) return;
  const target = ctx.room.players.find((player) => player.id === id);
  if (!target) return;
  takeOut(ctx.room, target, target.ws, true);
}
function onGiveHost(ws, msg) {
  const ctx = seat(ws);
  if (!hostOnly(ctx)) return fail(ws, "เฉพาะโฮสต์ที่โอนโฮสต์ได้");
  if (ctx.room.phase !== "lobby") return fail(ws, "โอนโฮสต์ได้เฉพาะตอนอยู่ในล็อบบี้");
  const id = typeof msg.id === "string" ? msg.id : "";
  if (!id || id === ctx.player.id) return fail(ws, "เลือกผู้เล่นอื่นเพื่อโอนโฮสต์");
  const target = ctx.room.players.find((player) => player.id === id);
  if (!target) return fail(ws, "ไม่พบผู้เล่น");
  if (isBot(target)) return fail(ws, "โอนโฮสต์ให้บอทไม่ได้");
  if (!target.connected) return fail(ws, "ผู้เล่นหลุดการเชื่อมต่อ");
  ctx.room.hostId = target.id;
  broadcast(ctx.room);
  broadcastLobby();
}
function onAddBot(ws) {
  const ctx = seat(ws);
  if (!hostOnly(ctx)) return fail(ws, "เฉพาะโฮสต์ที่เพิ่มบอทได้");
  const room = ctx.room;
  if (room.phase !== "lobby" || room.activeSpin) return fail(ws, "เพิ่มบอทได้เฉพาะตอนอยู่ในล็อบบี้");
  if (room.players.length >= MAX_PLAYERS) return fail(ws, "ห้องเต็ม");
  room.players.push(makeBot(room));
  cancelSpin(room);
  room.order = [];
  room.rot = 0;
  broadcast(room);
  broadcastLobby();
}
function onAuto(ws, msg) {
  const ctx = seat(ws);
  if (!ctx) return;
  if (isBot(ctx.player)) return;
  const room = ctx.room;
  if (room.phase !== "play" && room.phase !== "pick") return fail(ws, "เปิดออโต้ได้ตอนกำลังเล่นเท่านั้น");
  ctx.player.auto = !!msg.on;
  if (ctx.player.auto && yourTurn(room, ctx.player)) armTurnTimer(room);
  broadcast(room);
}
function swapName(list, from, to) {
  if (!Array.isArray(list)) return list;
  return list.map((item) => (item === from ? to : item));
}
function renameInRoom(room, player, nextName) {
  const prev = player.name;
  if (prev === nextName) return true;
  if (room.players.some((item) => item.id !== player.id && item.name.toLowerCase() === nextName.toLowerCase())) return false;
  player.name = nextName;
  room.order = swapName(room.order, prev, nextName);
  room.alive = swapName(room.alive, prev, nextName);
  room.roundOrder = swapName(room.roundOrder, prev, nextName);
  room.wheelOrder = swapName(room.wheelOrder, prev, nextName);
  room.wheelAlive = swapName(room.wheelAlive, prev, nextName);
  if (Object.prototype.hasOwnProperty.call(room.picks, prev)) {
    room.picks[nextName] = room.picks[prev];
    delete room.picks[prev];
  }
  room.picked = room.picked.map((item) => (item && item.who === prev ? { ...item, who: nextName } : item));
  room.wheelLog = room.wheelLog.map((item) => (item && item.who === prev ? { ...item, who: nextName } : item));
  if (room.activeSpin && room.activeSpin.owner === prev) room.activeSpin.owner = nextName;
  return true;
}
function onRename(ws, msg) {
  const name = cleanName(msg.name);
  if (!name) return fail(ws, "ใส่ชื่อก่อน");
  ws.pendingName = name;
  const ctx = seat(ws);
  if (!ctx) return send(ws, { t: "renamed", name });
  if (ctx.room.phase !== "lobby") return fail(ws, "เปลี่ยนชื่อผู้เล่นได้เฉพาะตอนอยู่ในล็อบบี้");
  if (!renameInRoom(ctx.room, ctx.player, name)) return fail(ws, "มีชื่อนี้ในห้องแล้ว");
  broadcast(ctx.room);
  send(ws, { t: "renamed", name });
}
function onRenameRoom(ws, msg) {
  const ctx = seat(ws);
  if (!hostOnly(ctx)) return fail(ws, "เฉพาะโฮสต์ที่เปลี่ยนชื่อห้องได้");
  if (ctx.room.phase !== "lobby") return fail(ws, "เปลี่ยนชื่อห้องได้เฉพาะตอนอยู่ในล็อบบี้");
  const title = cleanRoomTitle(msg.title);
  if (!title) return fail(ws, "ใส่ชื่อห้องก่อน");
  ctx.room.title = title;
  broadcast(ctx.room);
}
function identity(ws, msg) {
  const name = cleanName(msg.name) || ws.pendingName;
  const token = validToken(msg.token) ? msg.token : validToken(ws.token) ? ws.token : crypto.randomUUID();
  const avatarUrl = cleanAvatar(msg.avatarUrl);
  ws.token = token;
  trackPresence(ws, token);
  return { name, token, avatarUrl };
}
function onCreate(ws, msg) {
  const { name, token, avatarUrl } = identity(ws, msg);
  if (!name) return fail(ws, "ใส่ชื่อก่อน");
  if (rooms.size >= MAX_ROOMS) return fail(ws, "เซิร์ฟเวอร์เต็ม ลองใหม่ภายหลัง");
  const code = makeCode();
  if (!code) return fail(ws, "สร้างห้องไม่สำเร็จ ลองใหม่");
  const old = findSeat(token);
  if (old) takeOut(old.room, old.player, ws);
  const player = { id: token, name, avatarUrl, ws: null, connected: true, bot: false, auto: false, scoreSecret: 0, scoreWheel: 0, lastSeen: Date.now() };
  const room = blankRoom(code, msg.visibility === "private" ? "private" : "public", player);
  if (msg.title) room.title = cleanRoomTitle(msg.title) || room.title;
  applyRoomSetup(room, msg.setup);
  rooms.set(code, room);
  attach(ws, room, player);
}
function detachSpectator(ws) {
  for (const room of rooms.values()) {
    if (!Array.isArray(room.spectators)) continue;
    const before = room.spectators.length;
    room.spectators = room.spectators.filter((sp) => sp.ws !== ws);
    if (room.spectators.length !== before) broadcastLobby();
  }
}
function onWatch(ws, msg) {
  const code = String(msg.code || "").trim();
  if (!/^\d{6}$/.test(code)) return fail(ws, "รหัสต้องเป็นตัวเลข 6 หลัก");
  const room = rooms.get(code);
  if (!room) return fail(ws, "ไม่พบห้องนี้");
  if (room.phase === "lobby") return fail(ws, "เกมยังไม่เริ่ม — เข้าเป็นผู้เล่นแทน");
  if (room.visibility === "private") return fail(ws, "ห้องส่วนตัวไม่เปิดให้ชม");
  detachSpectator(ws);
  const seatCtx = seat(ws);
  if (seatCtx) takeOut(seatCtx.room, seatCtx.player, ws, false);
  watchers.delete(ws);
  if (!Array.isArray(room.spectators)) room.spectators = [];
  const token = validToken(msg.token) ? msg.token : crypto.randomUUID();
  ws.token = token;
  room.spectators = room.spectators.filter((sp) => sp.ws !== ws && sp.id !== token);
  room.spectators.push({ id: token, ws, name: cleanName(msg.name) || "Viewer" });
  send(ws, snap(room, null, { spectator: true }));
  broadcastLobby();
}
function onUnwatch(ws) {
  detachSpectator(ws);
  watchers.add(ws);
  send(ws, { t: "left" });
  send(ws, lobbyMsg());
}
function onJoin(ws, msg) {
  const code = String(msg.code || "").trim();
  if (!/^\d{6}$/.test(code)) return fail(ws, "รหัสต้องเป็นตัวเลข 6 หลัก");
  const room = rooms.get(code);
  if (!room) return fail(ws, "ไม่พบห้องนี้");
  const { name, token, avatarUrl } = identity(ws, msg);
  const existing = room.players.find((player) => player.id === token);
  if (existing) {
    if (avatarUrl) existing.avatarUrl = avatarUrl;
    if (name) existing.name = name;
    attach(ws, room, existing);
    return;
  }
  if (!name) return fail(ws, "ใส่ชื่อก่อน");
  if (room.phase !== "lobby") return fail(ws, "ห้องนี้เริ่มเกมแล้ว");
  if (room.players.length >= MAX_PLAYERS) return fail(ws, "ห้องเต็ม");
  if (room.players.some((player) => player.name.toLowerCase() === name.toLowerCase())) return fail(ws, "มีชื่อนี้ในห้องแล้ว");
  const old = findSeat(token);
  if (old) takeOut(old.room, old.player, ws);
  const player = { id: token, name, avatarUrl, ws: null, connected: true, bot: false, auto: false, scoreSecret: 0, scoreWheel: 0, lastSeen: Date.now() };
  room.players.push(player);
  if (room.phase === "lobby") {
    cancelSpin(room);
    room.order = [];
    room.rot = 0;
  }
  attach(ws, room, player);
}
function onHello(ws, msg) {
  const token = validToken(msg.token) ? msg.token : "";
  ws.token = token;
  ws.pendingName = cleanName(msg.name);
  if (token) trackPresence(ws, token);
  const avatarUrl = cleanAvatar(msg.avatarUrl);
  if (token) {
    const found = findSeat(token);
    if (found) {
      if (avatarUrl) found.player.avatarUrl = avatarUrl;
      attach(ws, found.room, found.player);
      return;
    }
  }
  watchers.add(ws);
  send(ws, lobbyMsg());
}
function onLeave(ws) {
  const ctx = seat(ws);
  if (!ctx) {
    watchers.add(ws);
    send(ws, { t: "left" });
    send(ws, lobbyMsg());
    return;
  }
  takeOut(ctx.room, ctx.player, ws, true);
}
async function onFriendsOnline(ws) {
  const userId = validToken(ws.token) ? ws.token : "";
  if (!userId || !authEnabled()) {
    send(ws, { t: "friendsOnline", online: [] });
    return;
  }
  try {
    const prisma = await getPrisma();
    const ids = await listAcceptedFriendIds(prisma, userId);
    send(ws, { t: "friendsOnline", online: filterOnline(ids) });
  } catch (err) {
    send(ws, { t: "friendsOnline", online: [] });
  }
}
async function onInviteFriend(ws, msg) {
  if (!authEnabled()) return fail(ws, "ระบบเพื่อนยังไม่พร้อม");
  const ctx = seat(ws);
  if (!ctx) return fail(ws, "ต้องอยู่ในห้องก่อน");
  if (ctx.room.visibility !== "private") return fail(ws, "เชิญเพื่อนได้เฉพาะห้องส่วนตัว");
  if (ctx.room.phase !== "lobby") return fail(ws, "เชิญได้เฉพาะตอนล็อบบี้");
  const fromUserId = ctx.player.id;
  const friendUserId = validToken(msg.friendUserId) ? msg.friendUserId : "";
  if (!friendUserId) return fail(ws, "ไม่พบเพื่อน");
  if (friendUserId === fromUserId) return fail(ws, "เชิญตัวเองไม่ได้");
  if (ctx.room.players.some((p) => p.id === friendUserId)) return fail(ws, "เพื่อนอยู่ในห้องแล้ว");
  if (ctx.room.players.length >= MAX_PLAYERS) return fail(ws, "ห้องเต็ม");
  if (!isUserOnline(friendUserId)) return fail(ws, "เพื่อนออฟไลน์อยู่");
  if (findSeat(friendUserId)) return fail(ws, "เพื่อนอยู่ในห้องอื่นอยู่");

  try {
    const prisma = await getPrisma();
    const ok = await areFriends(prisma, fromUserId, friendUserId);
    if (!ok) return fail(ws, "ยังไม่ได้เป็นเพื่อนกัน");
  } catch (err) {
    return fail(ws, "เชิญไม่สำเร็จ");
  }

  clearInviteForUser(friendUserId);
  const inviteId = crypto.randomUUID();
  const inv = {
    id: inviteId,
    code: ctx.room.code,
    fromUserId,
    toUserId: friendUserId,
    fromName: ctx.player.name,
    fromAvatar: ctx.player.avatarUrl || "",
    roomTitle: roomLabel(ctx.room),
    expires: Date.now() + INVITE_MS
  };
  roomInvites.set(inviteId, inv);
  inviteByUser.set(friendUserId, inviteId);
  const n = sendToUser(friendUserId, {
    t: "roomInvite",
    inviteId,
    fromUserId,
    fromName: inv.fromName,
    fromAvatar: inv.fromAvatar,
    roomTitle: inv.roomTitle,
    expiresIn: INVITE_MS
  });
  if (!n) {
    purgeInvite(inviteId);
    return fail(ws, "เพื่อนออฟไลน์อยู่");
  }
  send(ws, { t: "inviteSent", friendUserId, inviteId });
  getPrisma()
    .then((prisma) =>
      prisma.notification.create({
        data: {
          userId: friendUserId,
          type: "room_invitation",
          title: "Room invitation",
          body: (inv.fromName || "Friend") + " invited you to " + inv.roomTitle,
          payload: { inviteId, code: inv.code }
        }
      })
    )
    .then(() => sendToUser(friendUserId, { t: "notification:new" }))
    .catch(() => {});
}
function onDeclineInvite(ws, msg) {
  const inviteId = String(msg.inviteId || "");
  const inv = roomInvites.get(inviteId);
  if (!inv) return;
  if (ws.token !== inv.toUserId) return;
  purgeInvite(inviteId);
  sendToUser(inv.fromUserId, { t: "inviteDeclined", inviteId, friendUserId: inv.toUserId });
}
function onAcceptInvite(ws, msg) {
  const inviteId = String(msg.inviteId || "");
  const inv = roomInvites.get(inviteId);
  if (!inv || inv.expires < Date.now()) {
    purgeInvite(inviteId);
    return fail(ws, "คำเชิญหมดอายุแล้ว");
  }
  if (ws.token !== inv.toUserId) return fail(ws, "คำเชิญนี้ไม่ใช่ของคุณ");
  const room = rooms.get(inv.code);
  purgeInvite(inviteId);
  if (!room) return fail(ws, "ห้องนี้ไม่มีแล้ว");
  if (room.phase !== "lobby") return fail(ws, "ห้องนี้เริ่มเกมแล้ว");
  if (room.players.length >= MAX_PLAYERS) return fail(ws, "ห้องเต็ม");
  onJoin(ws, {
    t: "join",
    code: inv.code,
    name: cleanName(msg.name) || ws.pendingName || "",
    token: ws.token,
    avatarUrl: msg.avatarUrl || ""
  });
  sendToUser(inv.fromUserId, { t: "inviteAccepted", inviteId, friendUserId: inv.toUserId });
}
function onMessage(ws, raw) {
  if (!allow(ws)) return;
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch (err) { return; }
  if (!msg || typeof msg !== "object") return;
  if (msg.t === "hello") return onHello(ws, msg);
  if (msg.t === "create") return onCreate(ws, msg);
  if (msg.t === "join") return onJoin(ws, msg);
  if (msg.t === "watch") return onWatch(ws, msg);
  if (msg.t === "unwatch") return onUnwatch(ws);
  if (msg.t === "leave") return onLeave(ws);
  if (msg.t === "friendsOnline") return void onFriendsOnline(ws);
  if (msg.t === "inviteFriend") return void onInviteFriend(ws, msg);
  if (msg.t === "acceptInvite") return onAcceptInvite(ws, msg);
  if (msg.t === "declineInvite") return onDeclineInvite(ws, msg);
  if (msg.t === "setup") return onSetup(ws, msg);
  if (msg.t === "spinOrder") return onSpinOrder(ws);
  if (msg.t === "start") return onStart(ws);
  if (msg.t === "pick") return onPick(ws, msg);
  if (msg.t === "pickNum") return onPickNum(ws, msg);
  if (msg.t === "undo") return onUndo(ws);
  if (msg.t === "openWheel") return onOpenWheel(ws);
  if (msg.t === "spinNum") return onSpinNum(ws);
  if (msg.t === "repick") return onRepick(ws);
  if (msg.t === "again") return onAgain(ws);
  if (msg.t === "abort") return onAbort(ws);
  if (msg.t === "clear") return onClear(ws);
  if (msg.t === "kick") return onKick(ws, msg);
  if (msg.t === "giveHost") return onGiveHost(ws, msg);
  if (msg.t === "addBot") return onAddBot(ws);
  if (msg.t === "auto") return onAuto(ws, msg);
  if (msg.t === "rename") return onRename(ws, msg);
  if (msg.t === "renameRoom") return onRenameRoom(ws, msg);
}
function isDashboardAsset(name) {
  const n = String(name || "").replace(/^\/+/, "").replace(/\\/g, "/");
  if (n === "index.html" || n === "") return true;
  if (n.startsWith("js/dashboard/") || n.startsWith("css/dashboard.css")) return true;
  return false;
}

function sendStaticFile(res, name) {
  const file = path.normalize(path.join(PUBLIC, name));
  const rel = path.relative(PUBLIC, file);
  if (rel.startsWith("..") || path.isAbsolute(rel) || rel.includes("\0")) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const stream = fs.createReadStream(file);
  stream.on("error", () => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
  stream.on("open", () => {
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    stream.pipe(res);
  });
}

async function servePublic(req, res) {
  if (!hostAllowed(req)) {
    rejectWrongHost(req, res);
    return;
  }
  const url = new URL(req.url || "/", "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  if (pathname.startsWith("/api/")) {
    const handled = await handleAuthApi(req, res, pathname);
    if (handled) return;
    // Dashboard APIs are admin-port only
    if (
      pathname.startsWith("/api/v1/dashboard") ||
      pathname.startsWith("/api/v1/rooms") ||
      pathname.startsWith("/api/v1/live-games") ||
      pathname.startsWith("/api/v1/history") ||
      pathname.startsWith("/api/v1/stats") ||
      pathname.startsWith("/api/v1/leaderboard") ||
      pathname.startsWith("/api/v1/settings") ||
      pathname.startsWith("/api/v1/notifications")
    ) {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "not_found" }));
    return;
  }
  let name = pathname === "/" ? PUBLIC_PAGE : pathname.replace(/^\/+/, "");
  if (isDashboardAsset(name)) {
    res.writeHead(302, { Location: "/play.html" });
    res.end();
    return;
  }
  sendStaticFile(res, name);
}

async function serveAdmin(req, res) {
  // Admin port is localhost-bound — no public Host enforcement needed
  const url = new URL(req.url || "/", "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === "/js/dashboard/runtime-config.js") {
    const publicWs =
      process.env.ADMIN_PUBLIC_WS_HOST ||
      ("127.0.0.1:" + PORT);
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
    res.end(
      "window.NV_PUBLIC_WS_HOST=" +
        JSON.stringify(publicWs) +
        ";window.NV_ADMIN_DASHBOARD=true;\n"
    );
    return;
  }
  if (pathname.startsWith("/api/")) {
    const handled = await handleAuthApi(req, res, pathname);
    if (handled) return;
    const dash = await handleDashboardApi(req, res, pathname);
    if (dash) return;
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "not_found" }));
    return;
  }
  let name = pathname === "/" ? ADMIN_PAGE : pathname.replace(/^\/+/, "");
  sendStaticFile(res, name);
}

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.phase === "lobby") {
      const keep = room.players.filter((player) => isBot(player) || player.connected || now - player.lastSeen < SEAT_MS);
      if (keep.length !== room.players.length) {
        room.players = keep;
        transferHost(room);
        cancelSpin(room);
        room.order = [];
        room.rot = 0;
        if (!keep.length) scheduleDelete(room);
        else broadcast(room);
        broadcastLobby();
      }
    } else if (skipToConnected(room)) {
      armTurnTimer(room);
      broadcast(room);
    }
    if (room.players.length && !hasHumanOnline(room)) scheduleDelete(room);
  }
}, 1000);

function lobbyRoomRow(room) {
  const host = room.players.find((item) => item.id === room.hostId);
  const count = room.players.filter((item) => item.connected).length;
  const priv = room.visibility === "private";
  return {
    code: priv && room.phase === "lobby" ? "" : room.code,
    visibility: priv ? "private" : "public",
    title: roomLabel(room),
    host: host ? host.name : "",
    count,
    max: MAX_PLAYERS,
    cat: room.cat,
    phase: room.phase,
    joinable: room.phase === "lobby" && room.players.length < MAX_PLAYERS,
    spectators: Array.isArray(room.spectators) ? room.spectators.length : 0,
    created: room.created || 0,
    startedAt: room.startedAt || null
  };
}

attachGameApi({
  listLobbyRooms() {
    const list = [];
    for (const room of rooms.values()) {
      if (!room.players.some((item) => item.connected) && !(room.spectators && room.spectators.length)) continue;
      list.push(lobbyRoomRow(room));
    }
    list.sort((a, b) => (b.created || 0) - (a.created || 0));
    return list.slice(0, 50);
  },
  listLiveGames() {
    const list = [];
    for (const room of rooms.values()) {
      if (room.phase === "lobby" || room.phase === "over") continue;
      if (room.visibility === "private") continue;
      if (!room.players.some((item) => item.connected)) continue;
      list.push(lobbyRoomRow(room));
    }
    return list.slice(0, 50);
  },
  findQuickPlayRoom() {
    for (const room of rooms.values()) {
      if (room.visibility !== "public") continue;
      if (room.phase !== "lobby") continue;
      if (room.players.length >= MAX_PLAYERS) continue;
      if (!room.players.some((p) => p.connected)) continue;
      return { code: room.code, title: roomLabel(room) };
    }
    return null;
  },
  inspectRoom(code) {
    const room = rooms.get(String(code || ""));
    if (!room) return null;
    return {
      code: room.code,
      title: roomLabel(room),
      phase: room.phase,
      joinable: room.phase === "lobby" && room.players.length < MAX_PLAYERS
    };
  },
  createRoomHttp({ visibility, title, token, name, avatarUrl, setup }) {
    if (rooms.size >= MAX_ROOMS) return null;
    const code = makeCode();
    if (!code) return null;
    const id = validToken(token) ? token : crypto.randomUUID();
    const player = {
      id,
      name: cleanName(name) || "Player",
      avatarUrl: cleanAvatar(avatarUrl),
      ws: null,
      connected: false,
      bot: false,
      auto: false,
      scoreSecret: 0,
      scoreWheel: 0,
      lastSeen: Date.now()
    };
    const room = blankRoom(code, visibility === "private" ? "private" : "public", player);
    if (title) room.title = cleanRoomTitle(title) || "";
    applyRoomSetup(room, setup);
    room.holdUntil = Date.now() + 120000;
    rooms.set(code, room);
    scheduleDelete(room);
    return { code, token: id, title: roomLabel(room) };
  }
});

const server = http.createServer(servePublic);
const wss = new WebSocketServer({
  server,
  path: "/ws",
  maxPayload: 8000,
  verifyClient(info) {
    return hostAllowed(info.req);
  }
});
wss.on("connection", (ws) => {
  ws.on("message", (buf) => onMessage(ws, buf));
  ws.on("close", () => {
    untrackPresence(ws);
    detachSpectator(ws);
    releaseSocket(ws, false);
  });
  ws.on("error", () => {});
});
setInterval(() => {
  const now = Date.now();
  for (const [id, inv] of roomInvites) {
    if (inv.expires < now) purgeInvite(id);
  }
}, 5000);
server.listen(PORT, HOST, () => {
  console.log("Public game: http://localhost:" + PORT + " (play.html)");
  console.log("Bind public: " + HOST + ":" + PORT + (HOST === "0.0.0.0" ? " (เครือข่าย)" : " (local)"));
  if (ENFORCE_HOST) {
    console.log("Public host allowlist: " + [...ALLOWED_HOSTS].join(", ") + " (+ localhost)");
    console.log("เข้าผ่าน IP สาธารณะจะถูกปฏิเสธ — ใช้โดเมนเท่านั้น");
  }
  console.log("Auth V1: " + (authEnabled() ? "on" : "off"));
  const base = String(process.env.APP_BASE_URL || "").replace(/\/$/, "");
  if (base) console.log("โดเมนสาธารณะ: " + base);
});

if (ADMIN_PORT > 0) {
  const adminServer = http.createServer(serveAdmin);
  adminServer.listen(ADMIN_PORT, ADMIN_HOST, () => {
    console.log(
      "Admin dashboard: http://" +
        (ADMIN_HOST === "0.0.0.0" ? "127.0.0.1" : ADMIN_HOST) +
        ":" +
        ADMIN_PORT +
        " (user ปกติเข้าไม่ได้ — bind " +
        ADMIN_HOST +
        ")"
    );
    if (ADMIN_HOST === "127.0.0.1" || ADMIN_HOST === "localhost") {
      console.log("Remote admin: ssh -L " + ADMIN_PORT + ":127.0.0.1:" + ADMIN_PORT + " user@server");
    }
  });
}
