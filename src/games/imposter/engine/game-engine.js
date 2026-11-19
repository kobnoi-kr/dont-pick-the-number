"use strict";

const { pickWord } = require("../config/words");

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 8;
const ROLE_REVEAL_MS = 20_000;
const CLUE_TURN_MS = 45_000;
const MAX_ROUNDS = 5;
const CLUE_MAX_LEN = 32;

const PHASE = {
  ROLE_REVEAL: "ROLE_REVEAL",
  CLUE_TURN: "CLUE_TURN",
  DISCUSSION: "DISCUSSION",
  VOTING: "VOTING",
  VOTE_RESULT: "VOTE_RESULT",
  GUESS: "GUESS",
  FINISHED: "FINISHED"
};

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function normalizeInfo(v) {
  return v === "category" ? "category" : "none";
}

function normalizeImpostorCount(n, playerCount) {
  let c = Number(n) === 2 ? 2 : 1;
  if (playerCount < 6) c = 1;
  if (c >= playerCount) c = 1;
  return c;
}

function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

function createGame(opts) {
  const players = Array.isArray(opts.players) ? opts.players : [];
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    const err = new Error("invalid_player_count");
    err.code = "invalid_player_count";
    throw err;
  }
  const discussionSec = clamp(Number(opts.discussionSec) || 60, 30, 180);
  const voteSec = clamp(Number(opts.voteSec) || 45, 20, 120);
  const impostorInfo = normalizeInfo(opts.impostorInfo);
  const impostorCount = normalizeImpostorCount(opts.impostorCount, players.length);
  const picked = pickWord(opts.rng);
  const order = players.map((p) => String(p.id));
  const roles = {};
  const impostorIds = shuffle(order, opts.rng).slice(0, impostorCount);
  const impostorSet = new Set(impostorIds);
  for (const id of order) {
    roles[id] = impostorSet.has(id) ? "imposter" : "villager";
  }
  const names = {};
  for (const p of players) names[String(p.id)] = String(p.name || "Player");

  return {
    status: "playing",
    phase: PHASE.ROLE_REVEAL,
    round: 1,
    maxRounds: MAX_ROUNDS,
    word: picked.word,
    category: picked.category,
    impostorInfo,
    impostorCount,
    discussionSec,
    voteSec,
    order,
    names,
    roles,
    alive: order.slice(),
    clueIndex: 0,
    clues: [],
    votes: {},
    voteTallies: null,
    eliminated: [],
    confirmed: {},
    phaseEndsAt: Date.now() + ROLE_REVEAL_MS,
    winner: null,
    winReason: "",
    guessPlayerId: null,
    lastVoteTarget: null
  };
}

function privateView(state, playerId) {
  if (!state || !playerId) return null;
  const id = String(playerId);
  if (!state.roles[id]) return null;
  const role = state.roles[id];
  const isImp = role === "imposter";
  const out = {
    role,
    word: null,
    category: null,
    confirmed: !!state.confirmed[id]
  };
  if (!isImp) {
    out.word = state.word;
    out.category = state.category;
  } else if (state.impostorInfo === "category") {
    out.category = state.category;
  }
  if (state.phase === PHASE.FINISHED || state.phase === PHASE.GUESS) {
    /* still private until finished public reveal */
  }
  return out;
}

function publicState(state, viewerId) {
  if (!state) return null;
  const now = Date.now();
  const phaseLeft = state.phaseEndsAt ? Math.max(0, state.phaseEndsAt - now) : 0;
  const aliveSet = new Set(state.alive);
  const clueTurnId =
    state.phase === PHASE.CLUE_TURN && state.alive.length
      ? state.order.filter((id) => aliveSet.has(id))[state.clueIndex] || null
      : null;
  const voted = Object.keys(state.votes || {});
  const out = {
    phase: state.phase,
    status: state.status,
    round: state.round,
    maxRounds: state.maxRounds,
    order: state.order.slice(),
    alive: state.alive.slice(),
    names: Object.assign({}, state.names),
    clueIndex: state.clueIndex,
    clueTurnId,
    clues: (state.clues || []).map((c) => ({
      playerId: c.playerId,
      name: c.name,
      text: c.text
    })),
    discussionSec: state.discussionSec,
    voteSec: state.voteSec,
    phaseEndsAt: state.phaseEndsAt || 0,
    phaseLeft,
    impostorInfo: state.impostorInfo,
    impostorCount: state.impostorCount,
    votedIds: voted,
    voteTallies: state.voteTallies,
    eliminated: (state.eliminated || []).map((e) => ({
      playerId: e.playerId,
      name: e.name,
      wasImposter: !!e.wasImposter
    })),
    winner: state.winner,
    winReason: state.winReason || "",
    guessPlayerId: state.guessPlayerId,
    lastVoteTarget: state.lastVoteTarget,
    yourTurn: !!(viewerId && clueTurnId && String(viewerId) === String(clueTurnId)),
    canVote:
      state.phase === PHASE.VOTING &&
      !!viewerId &&
      aliveSet.has(String(viewerId)) &&
      !Object.prototype.hasOwnProperty.call(state.votes, String(viewerId)),
    canGuess:
      state.phase === PHASE.GUESS &&
      !!viewerId &&
      String(viewerId) === String(state.guessPlayerId),
    confirmedCount: Object.keys(state.confirmed || {}).length,
    playerCount: state.order.length
  };
  if (state.phase === PHASE.FINISHED) {
    out.word = state.word;
    out.category = state.category;
    out.roles = Object.assign({}, state.roles);
  }
  return out;
}

function setPhase(state, phase, durationMs) {
  state.phase = phase;
  state.phaseEndsAt = durationMs > 0 ? Date.now() + durationMs : 0;
  return state;
}

function aliveInOrder(state) {
  const set = new Set(state.alive);
  return state.order.filter((id) => set.has(id));
}

function countAliveRoles(state) {
  let imposters = 0;
  let villagers = 0;
  for (const id of state.alive) {
    if (state.roles[id] === "imposter") imposters += 1;
    else villagers += 1;
  }
  return { imposters, villagers };
}

function finish(state, winner, reason) {
  state.status = "finished";
  state.winner = winner;
  state.winReason = reason || "";
  state.guessPlayerId = null;
  return setPhase(state, PHASE.FINISHED, 0);
}

function checkAutoWin(state) {
  const { imposters, villagers } = countAliveRoles(state);
  if (imposters <= 0) return finish(state, "villagers", "จับ Imposter ได้ครบ");
  if (imposters >= villagers) return finish(state, "imposters", "Imposter กลืนทีมได้");
  return state;
}

function beginClueTurn(state) {
  state.clues = [];
  state.clueIndex = 0;
  state.votes = {};
  state.voteTallies = null;
  state.lastVoteTarget = null;
  return setPhase(state, PHASE.CLUE_TURN, CLUE_TURN_MS);
}

function beginDiscussion(state) {
  state.votes = {};
  state.voteTallies = null;
  return setPhase(state, PHASE.DISCUSSION, state.discussionSec * 1000);
}

function beginVoting(state) {
  state.votes = {};
  state.voteTallies = null;
  return setPhase(state, PHASE.VOTING, state.voteSec * 1000);
}

function confirmReveal(state, playerId) {
  if (state.phase !== PHASE.ROLE_REVEAL) return { ok: false, error: "wrong_phase" };
  const id = String(playerId);
  if (!state.roles[id]) return { ok: false, error: "not_player" };
  state.confirmed[id] = true;
  const all = state.order.every((pid) => state.confirmed[pid]);
  if (all) beginClueTurn(state);
  return { ok: true, state };
}

function submitClue(state, playerId, text) {
  if (state.phase !== PHASE.CLUE_TURN) return { ok: false, error: "wrong_phase" };
  const id = String(playerId);
  const turnOrder = aliveInOrder(state);
  const current = turnOrder[state.clueIndex];
  if (!current || current !== id) return { ok: false, error: "not_your_turn" };
  const clue = Array.from(String(text || "").trim().replace(/\s+/g, " "))
    .slice(0, CLUE_MAX_LEN)
    .join("");
  if (!clue) return { ok: false, error: "empty" };
  const lower = clue.toLowerCase();
  if (lower === String(state.word).toLowerCase()) {
    return { ok: false, error: "secret_word" };
  }
  state.clues.push({ playerId: id, name: state.names[id] || "Player", text: clue });
  state.clueIndex += 1;
  if (state.clueIndex >= turnOrder.length) beginDiscussion(state);
  else setPhase(state, PHASE.CLUE_TURN, CLUE_TURN_MS);
  return { ok: true, state };
}

function skipClue(state, playerId) {
  if (state.phase !== PHASE.CLUE_TURN) return { ok: false, error: "wrong_phase" };
  const id = String(playerId);
  const turnOrder = aliveInOrder(state);
  const current = turnOrder[state.clueIndex];
  if (!current || current !== id) return { ok: false, error: "not_your_turn" };
  state.clues.push({ playerId: id, name: state.names[id] || "Player", text: "—" });
  state.clueIndex += 1;
  if (state.clueIndex >= turnOrder.length) beginDiscussion(state);
  else setPhase(state, PHASE.CLUE_TURN, CLUE_TURN_MS);
  return { ok: true, state };
}

function submitVote(state, voterId, targetId) {
  if (state.phase !== PHASE.VOTING) return { ok: false, error: "wrong_phase" };
  const vid = String(voterId);
  const tid = targetId == null || targetId === "" ? null : String(targetId);
  if (!state.alive.includes(vid)) return { ok: false, error: "not_alive" };
  if (Object.prototype.hasOwnProperty.call(state.votes, vid)) {
    return { ok: false, error: "already_voted" };
  }
  if (tid != null) {
    if (tid === vid) return { ok: false, error: "self_vote" };
    if (!state.alive.includes(tid)) return { ok: false, error: "bad_target" };
  }
  state.votes[vid] = tid;
  const alive = state.alive;
  if (alive.every((id) => Object.prototype.hasOwnProperty.call(state.votes, id))) {
    resolveVotes(state);
  }
  return { ok: true, state };
}

function resolveVotes(state) {
  const counts = {};
  for (const id of state.alive) counts[id] = 0;
  let abstain = 0;
  for (const id of state.alive) {
    const t = state.votes[id];
    if (t == null) abstain += 1;
    else if (counts[t] != null) counts[t] += 1;
  }
  const tallies = Object.keys(counts)
    .map((playerId) => ({
      playerId,
      name: state.names[playerId] || "Player",
      count: counts[playerId]
    }))
    .sort((a, b) => b.count - a.count);
  state.voteTallies = { entries: tallies, abstain };

  const top = tallies[0];
  const tied = top && tallies.filter((t) => t.count === top.count && top.count > 0).length > 1;
  if (!top || top.count <= 0 || tied) {
    state.lastVoteTarget = null;
    setPhase(state, PHASE.VOTE_RESULT, 5000);
    return state;
  }
  state.lastVoteTarget = top.playerId;
  setPhase(state, PHASE.VOTE_RESULT, 5000);
  return state;
}

function applyElimination(state) {
  const target = state.lastVoteTarget;
  if (!target) {
    // tie / no votes → next round clues or finish
    if (state.round >= state.maxRounds) {
      return finish(state, "imposters", "ครบรอบแล้วยังจับไม่ได้");
    }
    state.round += 1;
    return beginClueTurn(state);
  }
  const wasImposter = state.roles[target] === "imposter";
  state.alive = state.alive.filter((id) => id !== target);
  state.eliminated.push({
    playerId: target,
    name: state.names[target] || "Player",
    wasImposter
  });

  if (wasImposter) {
    const still = state.alive.some((id) => state.roles[id] === "imposter");
    if (!still) {
      state.guessPlayerId = target;
      return setPhase(state, PHASE.GUESS, 30_000);
    }
    const checked = checkAutoWin(state);
    if (checked.phase === PHASE.FINISHED) return checked;
    if (state.round >= state.maxRounds) {
      return finish(state, "imposters", "ครบรอบแล้วยังจับไม่ได้");
    }
    state.round += 1;
    return beginClueTurn(state);
  }
  const checked = checkAutoWin(state);
  if (checked.phase === PHASE.FINISHED) return checked;
  if (state.round >= state.maxRounds) {
    return finish(state, "imposters", "ครบรอบแล้วยังจับไม่ได้");
  }
  state.round += 1;
  return beginClueTurn(state);
}

function submitGuess(state, playerId, guess) {
  if (state.phase !== PHASE.GUESS) return { ok: false, error: "wrong_phase" };
  if (String(playerId) !== String(state.guessPlayerId)) {
    return { ok: false, error: "not_guesser" };
  }
  const g = String(guess || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!g) return { ok: false, error: "empty" };
  if (g.toLowerCase() === String(state.word).toLowerCase()) {
    finish(state, "imposters", "Imposter ทายคำถูก");
  } else {
    finish(state, "villagers", "Imposter ทายคำผิด");
  }
  return { ok: true, state };
}

function tick(state, now = Date.now()) {
  if (!state || state.status !== "playing") return state;
  if (!state.phaseEndsAt || state.phaseEndsAt <= 0) return state;
  if (now < state.phaseEndsAt) return state;

  if (state.phase === PHASE.ROLE_REVEAL) {
    return beginClueTurn(state);
  }
  if (state.phase === PHASE.DISCUSSION) {
    return beginVoting(state);
  }
  if (state.phase === PHASE.VOTING) {
    // auto-abstain remaining
    for (const id of state.alive) {
      if (!Object.prototype.hasOwnProperty.call(state.votes, id)) state.votes[id] = null;
    }
    return resolveVotes(state);
  }
  if (state.phase === PHASE.VOTE_RESULT) {
    return applyElimination(state);
  }
  if (state.phase === PHASE.GUESS) {
    return finish(state, "villagers", "Imposter ไม่ทายคำทัน");
  }
  if (state.phase === PHASE.CLUE_TURN) {
    // AFK on current clue seat
    const turnOrder = aliveInOrder(state);
    const current = turnOrder[state.clueIndex];
    if (current) skipClue(state, current);
    return state;
  }
  return state;
}

module.exports = {
  MIN_PLAYERS,
  MAX_PLAYERS,
  PHASE,
  CLUE_MAX_LEN,
  createGame,
  privateView,
  publicState,
  confirmReveal,
  submitClue,
  skipClue,
  submitVote,
  submitGuess,
  tick,
  normalizeInfo,
  normalizeImpostorCount,
  beginDiscussion,
  beginVoting,
  beginClueTurn,
  applyElimination,
  resolveVotes,
  finish,
  checkAutoWin
};
