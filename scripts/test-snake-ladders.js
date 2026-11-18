"use strict";

const assert = require("assert");
const {
  createBoard,
  validateBoardConfig,
  cellToGrid,
  resolveMove,
  createGame,
  startGame,
  roll,
  publicState,
  DEFAULT_LADDERS,
  DEFAULT_SNAKES
} = require("../src/games/snake-ladders");

function rngSequence(values) {
  let i = 0;
  return () => {
    const v = values[i++];
    if (v == null) throw new Error("rng_exhausted");
    return v;
  };
}

function players(n) {
  return Array.from({ length: n }, (_, i) => ({
    userId: "u" + (i + 1),
    username: "P" + (i + 1)
  }));
}

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("ok -", name);
  } catch (err) {
    console.error("FAIL -", name);
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  }
}

test("board serpentine mapping", () => {
  assert.deepStrictEqual(cellToGrid(1), { row: 0, col: 0, side: 10 });
  assert.deepStrictEqual(cellToGrid(10), { row: 0, col: 9, side: 10 });
  assert.deepStrictEqual(cellToGrid(11), { row: 1, col: 9, side: 10 });
  assert.deepStrictEqual(cellToGrid(20), { row: 1, col: 0, side: 10 });
  assert.deepStrictEqual(cellToGrid(100), { row: 9, col: 0, side: 10 });
});

test("default board config validates", () => {
  validateBoardConfig({
    boardSize: 100,
    ladders: DEFAULT_LADDERS,
    snakes: DEFAULT_SNAKES
  });
  createBoard();
});

test("normal movement", () => {
  const board = createBoard();
  const m = resolveMove(board, 0, 4);
  assert.strictEqual(m.final, 4);
  assert.strictEqual(m.bounced, false);
  assert.strictEqual(m.won, false);
});

test("ladder teleport", () => {
  const board = createBoard();
  const m = resolveMove(board, 1, 2); // 1+2=3 → ladder to 22
  assert.strictEqual(m.landed, 3);
  assert.strictEqual(m.final, 22);
  assert.strictEqual(m.portal.type, "ladder");
});

test("snake teleport", () => {
  const board = createBoard();
  const m = resolveMove(board, 15, 2); // 17 → snake to 7
  assert.strictEqual(m.landed, 17);
  assert.strictEqual(m.final, 7);
  assert.strictEqual(m.portal.type, "snake");
});

test("overshoot 100 keeps position", () => {
  const board = createBoard();
  const m = resolveMove(board, 98, 5);
  assert.strictEqual(m.bounced, true);
  assert.strictEqual(m.final, 98);
  assert.strictEqual(m.won, false);
});

test("exact 100 wins", () => {
  const board = createBoard();
  const m = resolveMove(board, 97, 3);
  assert.strictEqual(m.final, 100);
  assert.strictEqual(m.won, true);
});

test("create/start/turn change", () => {
  let state = createGame({ roomId: "r1", players: players(2) });
  assert.strictEqual(state.status, "waiting");
  state = startGame(state);
  assert.strictEqual(state.status, "playing");
  assert.strictEqual(state.currentTurn, 0);

  const r1 = roll(state, "u1", { rng: rngSequence([0]) }); // dice 1
  state = r1.state;
  assert.strictEqual(r1.dice, 1);
  assert.strictEqual(state.players[0].position, 1);
  assert.strictEqual(state.currentTurn, 1);

  const r2 = roll(state, "u2", { rng: rngSequence([0.5]) }); // dice 4
  state = r2.state;
  assert.strictEqual(state.currentTurn, 0);
});

test("not your turn rejected", () => {
  let state = startGame(createGame({ roomId: "r1", players: players(2) }));
  assert.throws(() => roll(state, "u2", { rng: rngSequence([0]) }), (e) => e.code === "not_your_turn");
});

test("duplicate command rejected", () => {
  let state = startGame(createGame({ roomId: "r1", players: players(2) }));
  const r1 = roll(state, "u1", { commandId: "c1", rng: rngSequence([0]) });
  state = r1.state;
  // after turn advanced to u2, same command id on u2 would still check lastCommandId
  assert.throws(
    () => roll(state, "u2", { commandId: "c1", rng: rngSequence([0]) }),
    (e) => e.code === "duplicate_command"
  );
});

test("invalid player count", () => {
  assert.throws(() => createGame({ roomId: "r", players: players(1) }), (e) => e.code === "invalid_player_count");
  assert.throws(() => createGame({ roomId: "r", players: players(7) }), (e) => e.code === "invalid_player_count");
});

test("win finishes game", () => {
  let state = startGame(createGame({ roomId: "r1", players: players(2) }));
  state = {
    ...state,
    players: state.players.map((p, i) => (i === 0 ? { ...p, position: 99 } : p))
  };
  const r = roll(state, "u1", { rng: rngSequence([0]) }); // +1 → 100
  assert.strictEqual(r.finished, true);
  assert.strictEqual(r.state.status, "finished");
  assert.strictEqual(r.state.winnerId, "u1");
});

test("publicState strips internals", () => {
  const state = startGame(createGame({ roomId: "r1", players: players(2) }));
  const pub = publicState(state);
  assert.strictEqual(pub.roomId, "r1");
  assert.ok(Array.isArray(pub.ladders));
  assert.strictEqual(pub.board, undefined);
  assert.strictEqual(pub.rollInFlight, undefined);
});

if (!process.exitCode) {
  console.log("\nAll " + passed + " tests passed.");
}
