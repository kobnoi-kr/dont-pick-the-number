"use strict";

function currentPlayer(state) {
  if (!state || !Array.isArray(state.players) || !state.players.length) return null;
  const order = Number(state.currentTurn);
  return state.players.find((p) => p.turnOrder === order) || null;
}

function advanceTurn(state) {
  const alive = (state.players || []).filter((p) => p && !p.eliminated);
  if (!alive.length) return state;
  const sorted = alive.slice().sort((a, b) => a.turnOrder - b.turnOrder);
  const idx = sorted.findIndex((p) => p.turnOrder === state.currentTurn);
  const next = sorted[(idx + 1 + sorted.length) % sorted.length];
  return {
    ...state,
    currentTurn: next.turnOrder,
    turnNumber: Number(state.turnNumber || 0) + 1,
    version: Number(state.version || 0) + 1
  };
}

function assertCanRoll(state, userId, commandId) {
  if (!state || state.status !== "playing") {
    const err = new Error("game_not_playing");
    err.code = "game_not_playing";
    throw err;
  }
  const player = currentPlayer(state);
  if (!player || player.userId !== userId) {
    const err = new Error("not_your_turn");
    err.code = "not_your_turn";
    throw err;
  }
  if (commandId && state.lastCommandId && commandId === state.lastCommandId) {
    const err = new Error("duplicate_command");
    err.code = "duplicate_command";
    throw err;
  }
  if (state.rollInFlight) {
    const err = new Error("roll_in_flight");
    err.code = "roll_in_flight";
    throw err;
  }
  return player;
}

module.exports = {
  currentPlayer,
  advanceTurn,
  assertCanRoll
};
