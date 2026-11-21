"use strict";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const FACES = [
  "moon", "star", "fire", "drop", "clover", "note", "dice", "target",
  "rocket", "rainbow", "apple", "lemon", "grape", "flower", "cat", "dog",
  "fish", "balloon", "bolt", "gem", "mushroom", "sun", "penguin", "fox",
  "heart", "cherry", "peach", "melon", "banana", "kiwi", "coconut", "avocado",
  "bee", "butterfly", "turtle", "whale", "octopus", "crab", "frog", "unicorn",
  "crown", "key", "bell", "gift", "trophy", "soccer", "basket", "car",
  "plane", "ship", "house", "tree", "snow", "pizza", "burger", "sushi",
  "ice", "cake", "cookie", "coffee"
];
const BOARDS = {
  "4x4": { cols: 4, rows: 4 },
  "6x4": { cols: 6, rows: 4 },
  "8x4": { cols: 8, rows: 4 },
  "6x6": { cols: 6, rows: 6 },
  "8x6": { cols: 8, rows: 6 },
  "10x6": { cols: 10, rows: 6 },
  "8x8": { cols: 8, rows: 8 },
  "10x8": { cols: 10, rows: 8 },
  "12x8": { cols: 12, rows: 8 },
  "10x10": { cols: 10, rows: 10 },
  "12x10": { cols: 12, rows: 10 }
};
const PHASE = {
  PLAYING: "PLAYING",
  REVEAL_HOLD: "REVEAL_HOLD",
  FINISHED: "FINISHED"
};

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function normalizeBoard(v) {
  return BOARDS[v] ? v : "4x4";
}

function normalizeTurnSec(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n <= 12) return 10;
  if (n <= 17) return 15;
  if (n <= 25) return 20;
  return 30;
}

function normalizeRevealMs(v) {
  const n = Number(v);
  if (n === 1000 || n === 1500 || n === 2000 || n === 3000) return n;
  return 1500;
}

function normalizePoints(v) {
  const n = Number(v);
  if (n === 50 || n === 150 || n === 200) return n;
  return 100;
}

function normalizeOnMatch(v) {
  return v === "next" ? "next" : "continue";
}

function normalizeOnWrong(v) {
  return v === "retry" ? "retry" : "next";
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

function chebyshev(a, b, cols) {
  const dr = Math.abs(Math.floor(a / cols) - Math.floor(b / cols));
  const dc = Math.abs((a % cols) - (b % cols));
  return Math.max(dr, dc);
}

function tryDeal(faces, cols, total, rng, minGap, attempt) {
  const deck = new Array(total);
  let open = shuffle(Array.from({ length: total }, (_, i) => i), rng);
  for (let faceIndex = 0; faceIndex < faces.length; faceIndex++) {
    const face = faces[faceIndex];
    const start = (Math.floor(rng() * open.length) + attempt + faceIndex) % open.length;
    let placed = false;
    for (let shift = 0; shift < open.length && !placed; shift++) {
      const i = (start + shift) % open.length;
      const a = open[i];
      const partners = [];
      for (let j = 0; j < open.length; j++) {
        if (j !== i && chebyshev(a, open[j], cols) >= minGap) partners.push(j);
      }
      if (!partners.length) continue;
      const j = partners[(Math.floor(rng() * partners.length) + attempt) % partners.length];
      const b = open[j];
      deck[a] = face;
      deck[b] = face;
      open = open.filter((cell) => cell !== a && cell !== b);
      placed = true;
    }
    if (!placed) return null;
  }
  return deck.every((face) => face) ? deck : null;
}

function dealSpread(faces, cols, rows, rng) {
  const total = cols * rows;
  const gaps = total >= 24 ? [3, 2] : [2];
  for (const gap of gaps) {
    for (let attempt = 0; attempt < 48; attempt++) {
      const deck = tryDeal(faces, cols, total, rng, gap, attempt);
      if (deck) return deck;
    }
  }
  return shuffle(faces.concat(faces), rng);
}

function armTurn(state, now) {
  const sec = state.turnSec;
  state.phase = PHASE.PLAYING;
  state.turnSerial = (state.turnSerial || 0) + 1;
  state.phaseEndsAt = sec > 0 ? now + sec * 1000 : 0;
}

function finish(state, reason) {
  if (state.phase === PHASE.FINISHED) return state;
  for (const id of state.order) {
    if ((state.wrongs[id] || 0) === 0 && (state.pairs[id] || 0) > 0) {
      state.scores[id] = (state.scores[id] || 0) + 200;
      state.perfect[id] = true;
    }
  }
  state.phase = PHASE.FINISHED;
  state.phaseEndsAt = 0;
  state.open = [];
  state.winReason = reason || "จับคู่ครบแล้ว";
  state.ranking = rankIds(state);
  state.winnerIds = winnersOf(state);
  return state;
}

function rankIds(state) {
  return state.order.slice().sort((a, b) => {
    const score = (state.scores[b] || 0) - (state.scores[a] || 0);
    if (score) return score;
    const pairs = (state.pairs[b] || 0) - (state.pairs[a] || 0);
    if (pairs) return pairs;
    return (state.scoreAt[a] || Number.MAX_SAFE_INTEGER) - (state.scoreAt[b] || Number.MAX_SAFE_INTEGER);
  });
}

function winnersOf(state) {
  const ranking = state.ranking || rankIds(state);
  if (!ranking.length) return [];
  const top = ranking[0];
  return ranking.filter((id) => {
    return (state.scores[id] || 0) === (state.scores[top] || 0)
      && (state.pairs[id] || 0) === (state.pairs[top] || 0)
      && (state.scoreAt[id] || 0) === (state.scoreAt[top] || 0);
  });
}

function allMatched(state) {
  return state.cards.every((card) => card.state === "matched");
}

function currentId(state) {
  return state.order[state.turnIndex] || null;
}

function nextIndex(state) {
  if (!state.order.length) return 0;
  state.turnIndex = (state.turnIndex + 1) % state.order.length;
}

function createGame(opts) {
  const players = Array.isArray(opts && opts.players) ? opts.players : [];
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    const err = new Error("invalid_player_count");
    err.code = "invalid_player_count";
    throw err;
  }
  const rng = typeof opts.rng === "function" ? opts.rng : Math.random;
  const board = normalizeBoard(opts.board);
  const spec = BOARDS[board];
  const total = spec.cols * spec.rows;
  const faces = shuffle(FACES, rng).slice(0, total / 2);
  const deck = dealSpread(faces, spec.cols, spec.rows, rng);
  const order = players.map((p) => String(p.id));
  const names = {};
  const scores = {};
  const combos = {};
  const maxCombo = {};
  const pairs = {};
  const wrongs = {};
  const scoreAt = {};
  const perfect = {};
  for (const p of players) {
    const id = String(p.id);
    names[id] = String(p.name || "Player");
    scores[id] = 0;
    combos[id] = 0;
    maxCombo[id] = 0;
    pairs[id] = 0;
    wrongs[id] = 0;
    scoreAt[id] = 0;
    perfect[id] = false;
  }
  const now = Date.now();
  const durationSec = Number(opts.durationSec) > 0 ? Number(opts.durationSec) : 0;
  const state = {
    status: "playing",
    phase: PHASE.PLAYING,
    board,
    cols: spec.cols,
    rows: spec.rows,
    cards: deck.map((face, id) => ({ id, face, state: "hidden" })),
    open: [],
    order,
    names,
    turnIndex: 0,
    turnSec: normalizeTurnSec(opts.turnSec == null ? 20 : opts.turnSec),
    revealMs: normalizeRevealMs(opts.revealMs),
    matchPoints: normalizePoints(opts.matchPoints),
    comboOn: opts.combo !== false,
    onMatch: normalizeOnMatch(opts.onMatch),
    onWrong: normalizeOnWrong(opts.onWrong),
    retriesLeft: 0,
    scores,
    combos,
    maxCombo,
    pairs,
    wrongs,
    scoreAt,
    perfect,
    phaseEndsAt: 0,
    startedAt: now,
    gameEndsAt: durationSec ? now + durationSec * 1000 : 0,
    winReason: "",
    ranking: [],
    winnerIds: [],
    lastAction: ""
  };
  armTurn(state, now);
  state.retriesLeft = state.onWrong === "retry" ? 1 : 0;
  return state;
}

function award(state, id, now) {
  let gain = state.matchPoints;
  state.combos[id] = (state.combos[id] || 0) + 1;
  state.maxCombo[id] = Math.max(state.maxCombo[id] || 0, state.combos[id]);
  if (state.comboOn) {
    const combo = state.combos[id];
    if (combo >= 4) gain += 60;
    else if (combo === 3) gain += 40;
    else if (combo === 2) gain += 20;
  }
  state.scores[id] = (state.scores[id] || 0) + gain;
  state.pairs[id] = (state.pairs[id] || 0) + 1;
  state.scoreAt[id] = now;
  state.lastGain = gain;
}

function hideOpen(state) {
  const open = new Set(state.open);
  for (const card of state.cards) {
    if (open.has(card.id) && card.state === "revealed") card.state = "hidden";
  }
  state.open = [];
}

function afterWrong(state, now) {
  const id = currentId(state);
  state.wrongs[id] = (state.wrongs[id] || 0) + 1;
  state.combos[id] = 0;
  state.lastAction = "mismatch";
  state.phase = PHASE.REVEAL_HOLD;
  state.phaseEndsAt = now + state.revealMs;
  state.pendingWrong = state.onWrong === "retry" && state.retriesLeft > 0 ? "retry" : "next";
  if (state.pendingWrong === "retry") state.retriesLeft -= 1;
}

function afterMatch(state, now) {
  const id = currentId(state);
  award(state, id, now);
  state.open = [];
  state.lastAction = "match";
  if (allMatched(state)) return finish(state, "จับคู่ครบแล้ว");
  if (state.onMatch === "next") nextIndex(state);
  state.retriesLeft = state.onWrong === "retry" ? 1 : 0;
  armTurn(state, now);
  return state;
}

function flipCard(state, playerId, cardId, now = Date.now()) {
  if (!state || state.phase === PHASE.FINISHED) return { ok: false, error: "finished" };
  if (state.phase !== PHASE.PLAYING) return { ok: false, error: "wrong_phase" };
  const id = String(playerId);
  if (currentId(state) !== id) return { ok: false, error: "not_your_turn" };
  const cid = Number(cardId);
  const card = state.cards.find((item) => item.id === cid);
  if (!card) return { ok: false, error: "bad_card" };
  if (card.state !== "hidden") return { ok: false, error: "taken" };
  if (state.open.indexOf(cid) >= 0) return { ok: false, error: "duplicate" };
  card.state = "revealed";
  state.open.push(cid);
  if (state.open.length < 2) {
    state.lastAction = "flip";
    if (state.turnSec > 0) state.phaseEndsAt = now + state.turnSec * 1000;
    return { ok: true, state };
  }
  const a = state.cards.find((item) => item.id === state.open[0]);
  const b = state.cards.find((item) => item.id === state.open[1]);
  if (a && b && a.face === b.face) {
    a.state = "matched";
    b.state = "matched";
    afterMatch(state, now);
  } else {
    afterWrong(state, now);
  }
  return { ok: true, state };
}

function resolveHold(state, now) {
  hideOpen(state);
  if (state.pendingWrong === "next") {
    nextIndex(state);
    state.retriesLeft = state.onWrong === "retry" ? 1 : 0;
  }
  state.pendingWrong = "";
  armTurn(state, now);
}

function skipTurn(state, now) {
  hideOpen(state);
  for (const card of state.cards) {
    if (card.state === "revealed") card.state = "hidden";
  }
  state.open = [];
  nextIndex(state);
  state.retriesLeft = state.onWrong === "retry" ? 1 : 0;
  state.lastAction = "timeout";
  armTurn(state, now);
}

function tick(state, now = Date.now()) {
  if (!state || state.phase === PHASE.FINISHED) return state;
  if (state.gameEndsAt && now >= state.gameEndsAt) return finish(state, "หมดเวลาเกม");
  if (state.phase === PHASE.REVEAL_HOLD && state.phaseEndsAt && now >= state.phaseEndsAt) {
    resolveHold(state, now);
    return state;
  }
  if (state.phase === PHASE.PLAYING && state.phaseEndsAt && now >= state.phaseEndsAt) {
    skipTurn(state, now);
  }
  return state;
}

function removePlayer(state, playerId, now = Date.now()) {
  if (!state || state.phase === PHASE.FINISHED) return state;
  const id = String(playerId);
  const idx = state.order.indexOf(id);
  if (idx < 0) return state;
  const wasTurn = currentId(state) === id;
  state.order.splice(idx, 1);
  if (!state.order.length) return finish(state, "ผู้เล่นออกจากเกม");
  if (idx < state.turnIndex) state.turnIndex -= 1;
  if (state.turnIndex >= state.order.length) state.turnIndex = 0;
  if (wasTurn || state.phase === PHASE.REVEAL_HOLD) {
    hideOpen(state);
    state.pendingWrong = "";
    state.retriesLeft = state.onWrong === "retry" ? 1 : 0;
    armTurn(state, now);
  }
  return state;
}

function publicCard(card) {
  const open = card.state === "revealed" || card.state === "matched";
  return {
    id: card.id,
    state: card.state,
    face: open ? card.face : null
  };
}

function publicState(state, viewerId) {
  if (!state) return null;
  const now = Date.now();
  const turnId = currentId(state);
  return {
    phase: state.phase,
    board: state.board,
    cols: state.cols,
    rows: state.rows,
    cards: state.cards.map(publicCard),
    open: state.open.slice(),
    order: state.order.slice(),
    names: Object.assign({}, state.names),
    turnId,
    turnIndex: state.turnIndex,
    turnSerial: state.turnSerial || 0,
    yourTurn: !!(viewerId && turnId && String(viewerId) === String(turnId) && state.phase === PHASE.PLAYING),
    canFlip: !!(viewerId && turnId && String(viewerId) === String(turnId) && state.phase === PHASE.PLAYING),
    scores: Object.assign({}, state.scores),
    combos: Object.assign({}, state.combos),
    maxCombo: Object.assign({}, state.maxCombo),
    pairs: Object.assign({}, state.pairs),
    wrongs: Object.assign({}, state.wrongs),
    phaseEndsAt: state.phaseEndsAt || 0,
    phaseLeft: state.phaseEndsAt ? Math.max(0, state.phaseEndsAt - now) : 0,
    gameEndsAt: state.gameEndsAt || 0,
    turnSec: state.turnSec,
    revealMs: state.revealMs,
    matchPoints: state.matchPoints,
    comboOn: !!state.comboOn,
    onMatch: state.onMatch,
    onWrong: state.onWrong,
    lastAction: state.lastAction || "",
    lastGain: state.lastGain || 0,
    winReason: state.winReason || "",
    ranking: (state.ranking || []).slice(),
    winnerIds: (state.winnerIds || []).slice()
  };
}

module.exports = {
  MIN_PLAYERS,
  MAX_PLAYERS,
  FACES,
  BOARDS,
  PHASE,
  normalizeBoard,
  normalizeTurnSec,
  normalizeRevealMs,
  normalizePoints,
  normalizeOnMatch,
  normalizeOnWrong,
  createGame,
  flipCard,
  tick,
  removePlayer,
  publicState,
  rankIds
};
