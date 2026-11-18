"use strict";

const { MIN_PLAYERS, MAX_PLAYERS } = require("../config/default-board");
const { createBoard } = require("./board");
const { rollDice } = require("./dice");
const { resolveMove } = require("./movement");
const { currentPlayer, advanceTurn, assertCanRoll } = require("./turn-manager");
const { findWinner } = require("./win-condition");

function publicState(state) {
  if (!state) return null;
  return {
    roomId: state.roomId,
    sessionId: state.sessionId,
    status: state.status,
    players: state.players.map((p) => ({
      userId: p.userId,
      username: p.username,
      avatar: p.avatar == null ? null : p.avatar,
      position: p.position,
      turnOrder: p.turnOrder,
      connected: !!p.connected,
      ready: !!p.ready
    })),
    currentTurn: state.currentTurn,
    lastDice: state.lastDice,
    lastMove: state.lastMove || null,
    winnerId: state.winnerId,
    turnNumber: state.turnNumber,
    version: state.version,
    boardSize: state.board.boardSize,
    ladders: state.board.ladders,
    snakes: state.board.snakes
  };
}

/**
 * @param {object} opts
 * @param {string} opts.roomId
 * @param {string} [opts.sessionId]
 * @param {Array<{userId:string,username?:string,avatar?:string|null}>} opts.players
 * @param {object} [opts.boardConfig]
 */
function createGame(opts) {
  const playersIn = Array.isArray(opts && opts.players) ? opts.players : [];
  if (playersIn.length < MIN_PLAYERS || playersIn.length > MAX_PLAYERS) {
    const err = new Error("invalid_player_count");
    err.code = "invalid_player_count";
    throw err;
  }
  const ids = new Set();
  for (const p of playersIn) {
    if (!p || !p.userId || ids.has(p.userId)) {
      const err = new Error("invalid_players");
      err.code = "invalid_players";
      throw err;
    }
    ids.add(p.userId);
  }

  const board = createBoard(opts && opts.boardConfig);
  const players = playersIn.map((p, i) => ({
    userId: String(p.userId),
    username: String(p.username || p.userId),
    avatar: p.avatar == null ? null : p.avatar,
    position: 0,
    turnOrder: i,
    connected: p.connected !== false,
    ready: !!p.ready,
    eliminated: false
  }));

  return {
    roomId: String((opts && opts.roomId) || ""),
    sessionId: String((opts && opts.sessionId) || ""),
    status: "waiting",
    players,
    currentTurn: 0,
    lastDice: null,
    lastMove: null,
    lastCommandId: null,
    rollInFlight: false,
    winnerId: null,
    turnNumber: 0,
    version: 1,
    board
  };
}

function startGame(state) {
  if (!state || state.status === "playing") {
    const err = new Error("invalid_status");
    err.code = "invalid_status";
    throw err;
  }
  if (!state.players || state.players.length < MIN_PLAYERS) {
    const err = new Error("not_enough_players");
    err.code = "not_enough_players";
    throw err;
  }
  return {
    ...state,
    status: "playing",
    currentTurn: 0,
    turnNumber: 1,
    lastDice: null,
    lastMove: null,
    winnerId: null,
    rollInFlight: false,
    version: Number(state.version || 0) + 1
  };
}

/**
 * Server-authoritative roll.
 * @param {object} state
 * @param {string} userId
 * @param {{commandId?:string, rng?:Function}} [opts]
 */
function roll(state, userId, opts) {
  const commandId = opts && opts.commandId ? String(opts.commandId) : null;
  assertCanRoll(state, userId, commandId);

  const dice = rollDice(opts && opts.rng);
  const player = currentPlayer(state);
  const move = resolveMove(state.board, player.position, dice);

  const players = state.players.map((p) => {
    if (p.userId !== player.userId) return p;
    return { ...p, position: move.final };
  });

  let next = {
    ...state,
    players,
    lastDice: dice,
    lastMove: move,
    lastCommandId: commandId,
    rollInFlight: false,
    version: Number(state.version || 0) + 1
  };

  const winner = findWinner(next);
  if (winner) {
    next = {
      ...next,
      status: "finished",
      winnerId: winner.userId
    };
    return { state: next, move, dice, finished: true };
  }

  next = advanceTurn(next);
  return { state: next, move, dice, finished: false };
}

module.exports = {
  createGame,
  startGame,
  roll,
  publicState,
  currentPlayer
};
