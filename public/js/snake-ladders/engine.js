/**
 * Browser port of Phase 1 engine for mock UI.
 * Server source of truth remains src/games/snake-ladders (Phase 3+).
 */

export const BOARD_SIZE = 100;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export const DEFAULT_LADDERS = [
  { start: 3, end: 22 },
  { start: 8, end: 30 },
  { start: 28, end: 55 },
  { start: 58, end: 77 },
  { start: 75, end: 95 }
];

export const DEFAULT_SNAKES = [
  { start: 17, end: 7 },
  { start: 54, end: 34 },
  { start: 62, end: 19 },
  { start: 88, end: 24 },
  { start: 99, end: 78 }
];

function buildPortalMap(ladders, snakes) {
  const map = Object.create(null);
  for (const row of ladders || []) map[Number(row.start)] = { type: "ladder", to: Number(row.end) };
  for (const row of snakes || []) map[Number(row.start)] = { type: "snake", to: Number(row.end) };
  return map;
}

export function cellToGrid(cell, boardSize = BOARD_SIZE) {
  const size = Number(boardSize) || BOARD_SIZE;
  const n = Number(cell);
  if (!Number.isInteger(n) || n < 1 || n > size) return null;
  const side = Math.round(Math.sqrt(size));
  const idx = n - 1;
  const rowFromBottom = Math.floor(idx / side);
  const colInRow = idx % side;
  const col = rowFromBottom % 2 === 0 ? colInRow : side - 1 - colInRow;
  return { row: rowFromBottom, col, side };
}

/** CSS grid placement: row 1 = top */
export function cellToCssGrid(cell, boardSize = BOARD_SIZE) {
  const g = cellToGrid(cell, boardSize);
  if (!g) return null;
  return { gridRow: g.side - g.row, gridColumn: g.col + 1, ...g };
}

/** Percent centers for SVG overlay (origin top-left) */
export function cellCenterPercent(cell, boardSize = BOARD_SIZE) {
  const g = cellToGrid(cell, boardSize);
  if (!g) return null;
  const x = ((g.col + 0.5) / g.side) * 100;
  const y = ((g.side - 1 - g.row + 0.5) / g.side) * 100;
  return { x, y };
}

export function createBoard(config) {
  const boardSize = Number((config && config.boardSize) || BOARD_SIZE) || BOARD_SIZE;
  const ladders = (config && config.ladders) || DEFAULT_LADDERS;
  const snakes = (config && config.snakes) || DEFAULT_SNAKES;
  return {
    boardSize,
    ladders: ladders.map((x) => ({ start: x.start, end: x.end })),
    snakes: snakes.map((x) => ({ start: x.start, end: x.end })),
    portals: buildPortalMap(ladders, snakes)
  };
}

function applyPortal(board, position) {
  const hit = board.portals[position];
  if (!hit) return { position, portal: null };
  return { position: hit.to, portal: { type: hit.type, from: position, to: hit.to } };
}

export function resolveMove(board, from, dice) {
  const start = Math.max(0, Number(from) || 0);
  const roll = Number(dice);
  const goal = board.boardSize;
  const tentative = start + roll;
  if (tentative > goal) {
    return {
      from: start,
      dice: roll,
      bounced: true,
      landed: start,
      final: start,
      portal: null,
      steps: [],
      won: false
    };
  }
  const steps = [];
  for (let p = start + 1; p <= tentative; p++) steps.push({ cell: p, kind: "step" });
  const afterPortal = applyPortal(board, tentative);
  if (afterPortal.portal) {
    steps.push({
      cell: afterPortal.position,
      kind: afterPortal.portal.type,
      from: afterPortal.portal.from
    });
  }
  return {
    from: start,
    dice: roll,
    bounced: false,
    landed: tentative,
    final: afterPortal.position,
    portal: afterPortal.portal,
    steps,
    won: afterPortal.position === goal
  };
}

export function rollDice() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return 1 + (buf[0] % 6);
}

function currentPlayer(state) {
  return (state.players || []).find((p) => p.turnOrder === state.currentTurn) || null;
}

function advanceTurn(state) {
  const sorted = state.players.slice().sort((a, b) => a.turnOrder - b.turnOrder);
  const idx = sorted.findIndex((p) => p.turnOrder === state.currentTurn);
  const next = sorted[(idx + 1) % sorted.length];
  return {
    ...state,
    currentTurn: next.turnOrder,
    turnNumber: Number(state.turnNumber || 0) + 1,
    version: Number(state.version || 0) + 1
  };
}

export function createGame(opts) {
  const playersIn = Array.isArray(opts && opts.players) ? opts.players : [];
  if (playersIn.length < MIN_PLAYERS || playersIn.length > MAX_PLAYERS) {
    throw Object.assign(new Error("invalid_player_count"), { code: "invalid_player_count" });
  }
  const board = createBoard(opts && opts.boardConfig);
  const players = playersIn.map((p, i) => ({
    userId: String(p.userId),
    username: String(p.username || p.userId),
    avatar: p.avatar == null ? null : p.avatar,
    position: 0,
    turnOrder: i,
    connected: p.connected !== false,
    ready: !!p.ready
  }));
  return {
    roomId: String((opts && opts.roomId) || "MOCK"),
    sessionId: String((opts && opts.sessionId) || "mock-session"),
    status: "waiting",
    players,
    currentTurn: 0,
    lastDice: null,
    lastMove: null,
    lastCommandId: null,
    winnerId: null,
    turnNumber: 0,
    version: 1,
    board
  };
}

export function startGame(state) {
  return {
    ...state,
    status: "playing",
    currentTurn: 0,
    turnNumber: 1,
    lastDice: null,
    lastMove: null,
    winnerId: null,
    version: Number(state.version || 0) + 1
  };
}

export function roll(state, userId, opts) {
  if (!state || state.status !== "playing") {
    throw Object.assign(new Error("game_not_playing"), { code: "game_not_playing" });
  }
  const player = currentPlayer(state);
  if (!player || player.userId !== userId) {
    throw Object.assign(new Error("not_your_turn"), { code: "not_your_turn" });
  }
  const commandId = opts && opts.commandId ? String(opts.commandId) : null;
  if (commandId && state.lastCommandId && commandId === state.lastCommandId) {
    throw Object.assign(new Error("duplicate_command"), { code: "duplicate_command" });
  }
  const dice = opts && typeof opts.dice === "number" ? opts.dice : rollDice();
  const move = resolveMove(state.board, player.position, dice);
  const players = state.players.map((p) =>
    p.userId === player.userId ? { ...p, position: move.final } : p
  );
  let next = {
    ...state,
    players,
    lastDice: dice,
    lastMove: move,
    lastCommandId: commandId,
    version: Number(state.version || 0) + 1
  };
  if (move.won) {
    next = { ...next, status: "finished", winnerId: player.userId };
    return { state: next, move, dice, finished: true };
  }
  next = advanceTurn(next);
  return { state: next, move, dice, finished: false };
}

export function publicState(state) {
  return {
    roomId: state.roomId,
    sessionId: state.sessionId,
    status: state.status,
    players: state.players.map((p) => ({ ...p })),
    currentTurn: state.currentTurn,
    lastDice: state.lastDice,
    lastMove: state.lastMove,
    winnerId: state.winnerId,
    turnNumber: state.turnNumber,
    version: state.version,
    boardSize: state.board.boardSize,
    ladders: state.board.ladders,
    snakes: state.board.snakes
  };
}

export { currentPlayer };
