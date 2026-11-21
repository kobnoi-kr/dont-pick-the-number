"use strict";

const assert = require("assert");
const eng = require("../src/games/memory/engine/game-engine");

function players(n) {
  return Array.from({ length: n }, (_, i) => ({ id: "u" + (i + 1), name: "P" + (i + 1) }));
}

function pairOf(state, face) {
  return state.cards.filter((card) => card.face === face && card.state === "hidden").map((card) => card.id);
}

function run() {
  const state = eng.createGame({
    players: players(2),
    board: "4x4",
    turnSec: 20,
    revealMs: 1000,
    matchPoints: 100,
    combo: true,
    onMatch: "continue",
    onWrong: "next",
    rng: () => 0.2
  });
  assert.strictEqual(state.cards.length, 16);
  assert.strictEqual(state.phase, eng.PHASE.PLAYING);
  const pub = eng.publicState(state, state.order[0]);
  assert.ok(pub.canFlip);
  assert.ok(pub.cards.every((card) => card.face == null));
  assert.ok(!JSON.stringify(pub).includes(state.cards[0].face));

  const face = state.cards[0].face;
  const ids = pairOf(state, face);
  assert.strictEqual(ids.length, 2);
  const turn = state.order[state.turnIndex];
  assert.strictEqual(eng.flipCard(state, state.order[1], ids[0]).error, "not_your_turn");
  assert.ok(eng.flipCard(state, turn, ids[0]).ok);
  assert.ok(eng.flipCard(state, turn, ids[0]).error);
  assert.ok(eng.flipCard(state, turn, ids[1]).ok);
  assert.strictEqual(state.phase, eng.PHASE.PLAYING);
  assert.strictEqual(state.scores[turn], 100);
  assert.strictEqual(state.pairs[turn], 1);
  assert.ok(eng.publicState(state, turn).cards.find((card) => card.id === ids[0]).face);

  const hidden = state.cards.filter((card) => card.state === "hidden");
  const a = hidden[0];
  const b = hidden.find((card) => card.face !== a.face);
  const who = state.order[state.turnIndex];
  assert.ok(eng.flipCard(state, who, a.id).ok);
  assert.ok(eng.flipCard(state, who, b.id).ok);
  assert.strictEqual(state.phase, eng.PHASE.REVEAL_HOLD);
  assert.strictEqual(state.combos[who], 0);
  eng.tick(state, state.phaseEndsAt + 1);
  assert.strictEqual(state.phase, eng.PHASE.PLAYING);
  assert.ok(state.cards.find((card) => card.id === a.id).state === "hidden");
  assert.notStrictEqual(state.order[state.turnIndex], who);

  const closer = eng.createGame({
    players: players(2),
    board: "4x4",
    turnSec: 0,
    onMatch: "continue",
    rng: () => 0.3
  });
  let guard = 0;
  while (closer.phase !== eng.PHASE.FINISHED && guard < 40) {
    const id = closer.order[closer.turnIndex];
    const open = closer.cards.find((card) => card.state === "hidden");
    const mate = closer.cards.find((card) => card.state === "hidden" && card.face === open.face && card.id !== open.id);
    eng.flipCard(closer, id, open.id);
    eng.flipCard(closer, id, mate.id);
    guard += 1;
  }
  const biggest = Object.keys(eng.BOARDS).reduce((max, id) => {
    const spec = eng.BOARDS[id];
    return Math.max(max, (spec.cols * spec.rows) / 2);
  }, 0);
  assert.ok(eng.FACES.length >= biggest);
  for (const board of Object.keys(eng.BOARDS)) {
    for (let n = 0; n < 20; n++) {
      const dealt = eng.createGame({
        players: players(2),
        board,
        rng: () => Math.random()
      });
      const cols = dealt.cols;
      const seen = {};
      dealt.cards.forEach((card) => {
        if (!seen[card.face]) seen[card.face] = [];
        seen[card.face].push(card.id);
      });
      Object.keys(seen).forEach((face) => {
        const ids = seen[face];
        assert.strictEqual(ids.length, 2, board + " " + face);
        const dr = Math.abs(Math.floor(ids[0] / cols) - Math.floor(ids[1] / cols));
        const dc = Math.abs((ids[0] % cols) - (ids[1] % cols));
        assert.ok(Math.max(dr, dc) >= 2, board + " mates touch " + face);
      });
    }
  }
  assert.strictEqual(closer.phase, eng.PHASE.FINISHED);
  assert.ok(closer.winnerIds.length >= 1);
  assert.ok(closer.scores[closer.winnerIds[0]] > 100);
  console.log("memory engine ok");
}

run();
