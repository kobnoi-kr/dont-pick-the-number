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
  room.snakeBombs = [];
  room.phase = "snake";
  room.over = null;
  room.startedAt = room.startedAt || Date.now();
  room._persisted = false;
  return state;
}

function clearSnake(room) {
  if (room) {
    room.snake = null;
    room.snakeBombs = [];
  }
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
    const pauseLeft = Math.max(0, Number(rp.bombPauseTurns) || 0);
    return Object.assign({}, p, {
      avatar: rp.avatarUrl || p.avatar || null,
      auto: !!(rp.auto || rp.bot),
      bot: !!rp.bot,
      skipNextTurn: !!rp.skipNextTurn || pauseLeft > 0,
      bombPauseTurns: pauseLeft
    });
  });
  pub.bombs = Array.isArray(room.snakeBombs)
    ? room.snakeBombs
        .map((b) => ({
          cell: Math.floor(Number(b && b.cell) || 0),
          by: b && b.by ? String(b.by) : ""
        }))
        .filter((b) => b.cell >= 1 && b.cell < (pub.boardSize || 100))
    : [];
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
/**
 * After a move lands on a bomb cell: angel nullifies, else random back(1–6) or pause(1–3).
 * May chain if back-step lands on another bomb.
 */
function resolveBombsAfterMove(room, userId) {
  if (!room || !room.snake || room.snake.status !== "playing") return null;
  if (!Array.isArray(room.snakeBombs)) room.snakeBombs = [];
  const events = [];
  let safety = 0;
  while (safety++ < 10) {
    const player = (room.snake.players || []).find((p) => p && p.userId === userId);
    if (!player) break;
    const pos = Math.floor(Number(player.position) || 0);
    const bi = room.snakeBombs.findIndex((b) => Math.floor(Number(b && b.cell) || 0) === pos);
    if (bi < 0) break;
    const bomb = room.snakeBombs[bi];
    room.snakeBombs.splice(bi, 1);

    const seat = (room.players || []).find((p) => p && p.id === userId);
    const charges = seat ? Math.max(0, Number(seat.angelSnakeCharges) || 0) : 0;
    if (charges > 0) {
      seat.angelSnakeCharges = charges - 1;
      const evt = { type: "angel", cell: bomb.cell, userId };
      events.push(evt);
      const prev = room.snake.lastMove || {};
      room.snake = Object.assign({}, room.snake, {
        lastMove: Object.assign({}, prev, {
          bombEffect: evt,
          final: pos
        }),
        version: Number(room.snake.version || 0) + 1
      });
      break;
    }

    const kind = Math.random() < 0.5 ? "back" : "pause";
    if (kind === "pause") {
      const turns = 1 + Math.floor(Math.random() * 3);
      if (seat) {
        seat.bombPauseTurns = Math.max(0, Number(seat.bombPauseTurns) || 0) + turns;
      }
      const evt = { type: "pause", cell: bomb.cell, userId, turns };
      events.push(evt);
      const prev = room.snake.lastMove || {};
      room.snake = Object.assign({}, room.snake, {
        lastMove: Object.assign({}, prev, { bombEffect: evt }),
        version: Number(room.snake.version || 0) + 1
      });
      break;
    }

    const stepsN = 1 + Math.floor(Math.random() * 6);
    const from = pos;
    const to = Math.max(1, from - stepsN);
    const path = [];
    for (let c = from - 1; c >= to; c -= 1) path.push({ cell: c, kind: "bomb_back" });
    const players = (room.snake.players || []).map((p) =>
      p.userId === userId ? Object.assign({}, p, { position: to }) : p
    );
    const prev = room.snake.lastMove || {};
    const prevSteps = Array.isArray(prev.steps) ? prev.steps.slice() : [];
    const evt = { type: "back", cell: bomb.cell, userId, from, to, steps: stepsN };
    events.push(evt);
    room.snake = Object.assign({}, room.snake, {
      players,
      lastMoverId: userId,
      lastMove: Object.assign({}, prev, {
        final: to,
        steps: prevSteps.concat(path),
        bombEffect: evt
      }),
      version: Number(room.snake.version || 0) + 1
    });
  }
  return events.length ? events : null;
}

function assertBombCell(room, cell) {
  if (!room || !room.snake || room.snake.status !== "playing") {
    const err = new Error("snake_not_playing");
    err.code = "snake_not_playing";
    throw err;
  }
  const size = (room.snake.board && room.snake.board.boardSize) || 100;
  const n = Math.floor(Number(cell) || 0);
  if (!Number.isInteger(n) || n < 1 || n >= size) {
    const err = new Error("invalid_bomb_cell");
    err.code = "invalid_bomb_cell";
    throw err;
  }
  if (!Array.isArray(room.snakeBombs)) room.snakeBombs = [];
  if (room.snakeBombs.some((b) => Math.floor(Number(b && b.cell) || 0) === n)) {
    const err = new Error("bomb_cell_taken");
    err.code = "bomb_cell_taken";
    throw err;
  }
  return n;
}

function placeSnakeBomb(room, cell, byUserId) {
  const n = assertBombCell(room, cell);
  const row = { cell: n, by: String(byUserId || "") };
  room.snakeBombs.push(row);
  return row;
}

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
    const bombs = resolveBombsAfterMove(room, userId);
    if (bombs) result.bombs = bombs;
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
  skipSnakeTurn,
  assertBombCell,
  placeSnakeBomb,
  resolveBombsAfterMove
};
