"use strict";

/**
 * Thin adapter between NUMVERSE rooms and the pure Snake & Ladders engine.
 * No DOM / Prisma / ws — server.js owns those.
 */

const {
  createGame,
  startGame,
  roll,
  publicState,
  currentPlayer,
  advanceTurn,
  MIN_PLAYERS,
  MAX_PLAYERS,
  listMaps,
  normalizeMapId,
  boardConfigForMap,
  DEFAULT_MAP_ID
} = require("./index");

function isSnakeCat(cat) {
  return cat === "snake";
}

function isSnakeRoom(room) {
  return !!(room && isSnakeCat(room.cat));
}

function roomCap(room, defaultCap) {
  if (isSnakeRoom(room)) return MAX_PLAYERS;
  return Number(defaultCap) || 12;
}

function orderedPlayers(room) {
  const list = [];
  const names = Array.isArray(room.order) ? room.order : [];
  for (const name of names) {
    const p = (room.players || []).find((x) => x.name === name);
    if (p) list.push(p);
  }
  return list;
}

function startSnake(room) {
  const ordered = orderedPlayers(room);
  if (ordered.length < MIN_PLAYERS || ordered.length > MAX_PLAYERS) {
    const err = new Error("invalid_player_count");
    err.code = "invalid_player_count";
    throw err;
  }
  const mapId = normalizeMapId(room.snakeMapId || DEFAULT_MAP_ID);
  room.snakeMapId = mapId;
  let state = createGame({
    roomId: room.code,
    sessionId: "sn-" + room.code + "-" + Date.now(),
    boardConfig: boardConfigForMap(mapId),
    players: ordered.map((p) => ({
      userId: String(p.id),
      username: String(p.name),
      avatar: p.avatarUrl || null,
      connected: !!(p.bot || p.connected),
      ready: true
    }))
  });
  state = startGame(state);
  room.snake = state;
  room.phase = "snake";
  room.over = null;
  room.startedAt = room.startedAt || Date.now();
  room._persisted = false;
  return state;
}

function clearSnake(room) {
  if (room) room.snake = null;
}

function snapSnake(room) {
  if (!room || !room.snake) return null;
  const pub = publicState(room.snake);
  if (!pub) return null;
  // Merge live room cosmetics / auto flags onto snake seats
  const byId = new Map((room.players || []).map((p) => [String(p.id), p]));
  pub.players = (pub.players || []).map((p) => {
    const rp = byId.get(String(p.userId));
    if (!rp) return p;
    return Object.assign({}, p, {
      avatar: rp.avatarUrl || p.avatar || null,
      auto: !!(rp.auto || rp.bot),
      bot: !!rp.bot
    });
  });
  if (!pub.mapId) {
    pub.mapId = normalizeMapId(room.snakeMapId || DEFAULT_MAP_ID);
  }
  return pub;
}

function snakeYourTurn(room, player) {
  if (!room || room.phase !== "snake" || !room.snake || !player) return false;
  const cur = currentPlayer(room.snake);
  return !!(cur && cur.userId === player.id);
}

function snakeCurrentSeat(room) {
  if (!room || !room.snake) return null;
  const cur = currentPlayer(room.snake);
  if (!cur) return null;
  return (room.players || []).find((p) => p.id === cur.userId) || null;
}

/**
 * @returns {{ result: object, error?: never } | { result?: never, error: Error }}
 */
function applySnakeRoll(room, userId, opts) {
  try {
    const seat = (room.players || []).find((p) => p && p.id === userId);
    const snakeCharges = seat ? Math.max(0, Number(seat.angelSnakeCharges) || 0) : 0;
    const ignoreSnakes = snakeCharges > 0;
    const parity = opts && (opts.parity === "even" || opts.parity === "odd") ? opts.parity : null;
    const result = roll(room.snake, userId, Object.assign({}, opts || {}, { ignoreSnakes, parity }));
    room.snake = result.state;
    if (result.move && result.move.angelBlockedSnake && seat) {
      seat.angelSnakeCharges = Math.max(0, snakeCharges - 1);
    }
    return { result };
  } catch (err) {
    return { error: err };
  }
}

/** Skip the current snake seat without rolling. */
function skipSnakeTurn(room) {
  if (!room || !room.snake || room.snake.status !== "playing") return false;
  room.snake = advanceTurn(room.snake);
  return true;
}

function normalizeCat(cat) {
  if (cat === "wheel" || cat === "secret" || cat === "snake") return cat;
  return null;
}

module.exports = {
  MIN_PLAYERS,
  MAX_PLAYERS,
  DEFAULT_MAP_ID,
  listMaps,
  normalizeMapId,
  boardConfigForMap,
  isSnakeCat,
  isSnakeRoom,
  roomCap,
  normalizeCat,
  startSnake,
  clearSnake,
  snapSnake,
  snakeYourTurn,
  snakeCurrentSeat,
  applySnakeRoll,
  skipSnakeTurn
};
