"use strict";

const {
  MIN_PLAYERS,
  MAX_PLAYERS,
  PHASE,
  createGame,
  flipCard,
  tick,
  removePlayer,
  publicState,
  normalizeBoard,
  normalizeTurnSec,
  normalizeRevealMs,
  normalizePoints,
  normalizeOnMatch,
  normalizeOnWrong
} = require("./index");

function isMemoryCat(cat) {
  return cat === "cardmemory";
}

function normalizeCat(cat) {
  return cat === "cardmemory" || cat === "memory" ? "cardmemory" : null;
}

function roomCap(room, defaultCap) {
  if (room && isMemoryCat(room.cat)) return MAX_PLAYERS;
  return Number(defaultCap) || 12;
}

function applyLobbyDefaults(room) {
  if (!room) return;
  room.memoryBoard = normalizeBoard(room.memoryBoard);
  room.memoryTurnSec = normalizeTurnSec(room.memoryTurnSec == null ? 20 : room.memoryTurnSec);
  room.memoryRevealMs = normalizeRevealMs(room.memoryRevealMs);
  room.memoryPoints = normalizePoints(room.memoryPoints);
  room.memoryCombo = room.memoryCombo !== false;
  room.memoryOnMatch = normalizeOnMatch(room.memoryOnMatch);
  room.memoryOnWrong = normalizeOnWrong(room.memoryOnWrong);
}

function orderedPlayers(room) {
  const names = Array.isArray(room.order) ? room.order : [];
  const list = [];
  for (const name of names) {
    const player = (room.players || []).find((item) => item.name === name);
    if (player) list.push(player);
  }
  return list.length ? list : (room.players || []).slice();
}

function autoPlayBots(room) {
  const state = room && room.memory;
  if (!state || state.phase !== PHASE.PLAYING) return;
  let guard = 0;
  while (state.phase === PHASE.PLAYING && guard < 24) {
    const id = state.order[state.turnIndex];
    const player = (room.players || []).find((item) => String(item.id) === String(id));
    if (!player || !player.bot) return;
    const hidden = state.cards.filter((card) => card.state === "hidden");
    if (!hidden.length) return;
    const card = hidden[Math.floor(Math.random() * hidden.length)];
    const res = flipCard(state, id, card.id);
    if (!res.ok) return;
    guard += 1;
  }
}

function startMemory(room) {
  const players = orderedPlayers(room).map((player) => ({ id: player.id, name: player.name }));
  applyLobbyDefaults(room);
  const state = createGame({
    players,
    board: room.memoryBoard,
    turnSec: room.memoryTurnSec,
    revealMs: room.memoryRevealMs,
    matchPoints: room.memoryPoints,
    combo: room.memoryCombo,
    onMatch: room.memoryOnMatch,
    onWrong: room.memoryOnWrong
  });
  room.memory = state;
  room.phase = "cardmemory";
  room.over = null;
  room.startedAt = room.startedAt || Date.now();
  room._persisted = false;
  autoPlayBots(room);
  return state;
}

function clearMemory(room) {
  if (room) room.memory = null;
}

function snapMemory(room, player) {
  if (!room || !room.memory) return null;
  return publicState(room.memory, player && player.id);
}

function flipMemory(room, playerId, cardId) {
  if (!room || !room.memory) return { ok: false, error: "no_game" };
  const res = flipCard(room.memory, playerId, cardId);
  if (res.ok) autoPlayBots(room);
  return res;
}

function tickMemory(room) {
  if (!room || !room.memory) return false;
  const before = room.memory.phase;
  const beforeEnds = room.memory.phaseEndsAt;
  tick(room.memory);
  autoPlayBots(room);
  return room.memory.phase !== before || room.memory.phaseEndsAt !== beforeEnds;
}

function dropPlayerByName(room, name) {
  if (!room || !room.memory) return;
  const player = (room.players || []).find((item) => item.name === name);
  if (!player) return;
  removePlayer(room.memory, player.id);
  autoPlayBots(room);
}

function finishIfDone(room, setOver) {
  if (!room || !room.memory || room.memory.phase !== PHASE.FINISHED) return false;
  const state = room.memory;
  const names = (state.winnerIds || []).map((id) => state.names[id] || id);
  const ranking = (state.ranking || []).map((id) => ({
    id,
    name: state.names[id] || id,
    score: state.scores[id] || 0,
    pairs: state.pairs[id] || 0,
    wrongs: state.wrongs[id] || 0,
    maxCombo: state.maxCombo[id] || 0
  }));
  if (typeof setOver === "function") {
    setOver(room, {
      title: names.length ? names.join(" กับ ") + " ชนะ!" : "จบเกม",
      note: state.winReason || "",
      mode: "cardmemory",
      secretLabel: "",
      secretText: "",
      many: false,
      hist: null,
      again: "เล่นอีกครั้ง",
      reset: true,
      winners: names,
      ranking
    });
  }
  return true;
}

module.exports = {
  MIN_PLAYERS,
  MAX_PLAYERS,
  PHASE,
  isMemoryCat,
  normalizeCat,
  roomCap,
  applyLobbyDefaults,
  normalizeBoard,
  normalizeTurnSec,
  normalizeRevealMs,
  normalizePoints,
  normalizeOnMatch,
  normalizeOnWrong,
  startMemory,
  clearMemory,
  snapMemory,
  flipMemory,
  tickMemory,
  dropPlayerByName,
  finishIfDone
};
