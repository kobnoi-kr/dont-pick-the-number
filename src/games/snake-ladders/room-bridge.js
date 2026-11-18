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
  MIN_PLAYERS,
  MAX_PLAYERS
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
  let state = createGame({
    roomId: room.code,
    sessionId: "sn-" + room.code + "-" + Date.now(),
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
  return publicState(room.snake);
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
    const result = roll(room.snake, userId, opts);
    room.snake = result.state;
    return { result };
  } catch (err) {
    return { error: err };
  }
}

function normalizeCat(cat) {
  if (cat === "wheel" || cat === "secret" || cat === "snake") return cat;
  return null;
}

module.exports = {
  MIN_PLAYERS,
  MAX_PLAYERS,
  isSnakeCat,
  isSnakeRoom,
  roomCap,
  normalizeCat,
  startSnake,
  clearSnake,
  snapSnake,
  snakeYourTurn,
  snakeCurrentSeat,
  applySnakeRoll
};
