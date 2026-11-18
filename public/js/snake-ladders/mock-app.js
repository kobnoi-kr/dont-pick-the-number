import {
  createGame,
  startGame,
  roll,
  publicState,
  currentPlayer
} from "./engine.js";
import {
  cellCenterPercent,
  renderBoardPaths,
  diceFaceHtml
} from "./board-art.js";

const TOKEN_COLORS = ["#5b9cf5", "#2dd4a8", "#f5c542", "#f07178", "#c084fc", "#fb923c"];

const els = {
  board: document.getElementById("sl-board"),
  paths: document.getElementById("sl-paths"),
  tokens: document.getElementById("sl-tokens"),
  players: document.getElementById("sl-players"),
  dice: document.getElementById("sl-dice"),
  rollBtn: document.getElementById("sl-roll"),
  resetBtn: document.getElementById("sl-reset"),
  status: document.getElementById("sl-status"),
  turn: document.getElementById("sl-turn"),
  room: document.getElementById("sl-room"),
  log: document.getElementById("sl-log"),
  banner: document.getElementById("sl-banner")
};

const MOCK_PLAYERS = [
  { userId: "u1", username: "Kim", ready: true },
  { userId: "u2", username: "Nova", ready: true },
  { userId: "u3", username: "Rex", ready: true },
  { userId: "u4", username: "Mira", ready: true }
];

let state = null;
let animating = false;
/** @type {Map<string, HTMLElement>} */
const tokenEls = new Map();
/** Visual positions during animation (before engine sync) */
const visualPos = new Map();

function log(msg) {
  const line = document.createElement("div");
  line.textContent = msg;
  els.log.prepend(line);
  while (els.log.childElementCount > 40) els.log.lastChild.remove();
}

function buildBoard(board) {
  els.board.innerHTML = "";
  const size = board.boardSize;
  const ladderStarts = new Set(board.ladders.map((x) => x.start));
  const snakeStarts = new Set(board.snakes.map((x) => x.start));

  // Visual order: top-left first → cell 91 for classic layout; place via CSS grid
  for (let cell = 1; cell <= size; cell++) {
    const div = document.createElement("div");
    div.className = "sl-cell";
    div.dataset.cell = String(cell);
    div.textContent = String(cell);
    const side = Math.round(Math.sqrt(size));
    const idx = cell - 1;
    const rowFromBottom = Math.floor(idx / side);
    const colInRow = idx % side;
    const col = rowFromBottom % 2 === 0 ? colInRow : side - 1 - colInRow;
    div.style.gridRow = String(side - rowFromBottom);
    div.style.gridColumn = String(col + 1);
    div.classList.add((rowFromBottom + col) % 2 === 0 ? "is-light" : "is-dark");
    if (ladderStarts.has(cell)) div.classList.add("is-ladder-start");
    if (snakeStarts.has(cell)) div.classList.add("is-snake-start");
    if (cell === 1) {
      div.classList.add("is-start");
      div.innerHTML = `<span class="sl-cell-num">1</span><span class="sl-cell-tag">START</span>`;
    }
    if (cell === size) {
      div.classList.add("is-goal");
      div.innerHTML = `<span class="sl-cell-num">${size}</span><span class="sl-cell-tag">WINNER</span>`;
    }
    els.board.appendChild(div);
  }

  els.paths.innerHTML = renderBoardPaths(board.ladders, board.snakes, size);
}

function tokenOffset(index, total) {
  if (total <= 1) return { dx: 0, dy: 0 };
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  const r = 2.2;
  return { dx: Math.cos(angle) * r, dy: Math.sin(angle) * r };
}

function setTokenAt(userId, cell, index, total, boardSize) {
  const el = tokenEls.get(userId);
  if (!el) return;
  const pos = Number(cell) || 0;
  if (pos <= 0) {
    // start strip below board — park near cell 1
    const c = cellCenterPercent(1, boardSize);
    const off = tokenOffset(index, total);
    el.style.left = `${(c ? c.x : 5) + off.dx - 3}%`;
    el.style.top = `${(c ? c.y : 95) + off.dy + 4}%`;
    return;
  }
  const c = cellCenterPercent(pos, boardSize);
  if (!c) return;
  const off = tokenOffset(index, total);
  el.style.left = `${c.x + off.dx}%`;
  el.style.top = `${c.y + off.dy}%`;
}

function ensureTokens(pub) {
  const players = pub.players;
  els.tokens.innerHTML = "";
  tokenEls.clear();
  players.forEach((p, i) => {
    const el = document.createElement("div");
    el.className = "sl-token";
    el.dataset.userId = p.userId;
    el.style.setProperty("--token", TOKEN_COLORS[i % TOKEN_COLORS.length]);
    el.innerHTML = `<span class="sl-token-glow"></span><span class="sl-token-face">${String(
      (p.username || "?")[0]
    ).toUpperCase()}</span>`;
    el.title = p.username;
    els.tokens.appendChild(el);
    tokenEls.set(p.userId, el);
    visualPos.set(p.userId, p.position);
  });
}

function renderPlayers(pub) {
  const active = currentPlayer({ ...state, players: pub.players, currentTurn: pub.currentTurn });
  els.players.innerHTML = "";
  pub.players
    .slice()
    .sort((a, b) => a.turnOrder - b.turnOrder)
    .forEach((p, i) => {
      const li = document.createElement("li");
      li.className = "sl-player" + (active && active.userId === p.userId ? " is-turn" : "");
      li.innerHTML = `
        <span class="sl-player-dot" style="background:${TOKEN_COLORS[p.turnOrder % TOKEN_COLORS.length]}"></span>
        <span class="sl-player-name">${escapeHtml(p.username)}</span>
        <span class="sl-player-pos">${p.position}</span>
      `;
      void i;
      els.players.appendChild(li);
    });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMeta(pub) {
  els.status.textContent = pub.status;
  els.room.textContent = pub.roomId;
  const active = pub.players.find((p) => p.turnOrder === pub.currentTurn);
  els.turn.textContent =
    pub.status === "finished"
      ? `Winner: ${pub.players.find((p) => p.userId === pub.winnerId)?.username || pub.winnerId}`
      : active
        ? `${active.username} (turn #${pub.turnNumber})`
        : "—";
  els.dice.innerHTML = diceFaceHtml(pub.lastDice);
  if (pub.status === "finished") {
    const w = pub.players.find((p) => p.userId === pub.winnerId);
    els.banner.textContent = `${w ? w.username : "Player"} wins!`;
    els.banner.classList.add("is-visible");
  } else {
    els.banner.classList.remove("is-visible");
  }
}

function renderTokens(pub) {
  const byCell = new Map();
  for (const p of pub.players) {
    const cell = visualPos.has(p.userId) ? visualPos.get(p.userId) : p.position;
    if (!byCell.has(cell)) byCell.set(cell, []);
    byCell.get(cell).push(p);
  }
  for (const p of pub.players) {
    const cell = visualPos.has(p.userId) ? visualPos.get(p.userId) : p.position;
    const group = byCell.get(cell) || [p];
    const idx = group.findIndex((x) => x.userId === p.userId);
    setTokenAt(p.userId, cell, idx, group.length, pub.boardSize);
    const el = tokenEls.get(p.userId);
    if (el) {
      const isTurn = p.turnOrder === pub.currentTurn && pub.status === "playing";
      el.classList.toggle("is-active", isTurn);
    }
  }
}

function renderAll() {
  const pub = publicState(state);
  renderMeta(pub);
  renderPlayers(pub);
  renderTokens(pub);
  updateRollButton(pub);
}

function updateRollButton(pub) {
  const active = pub.players.find((p) => p.turnOrder === pub.currentTurn);
  const can =
    !animating && pub.status === "playing" && active && active.userId === "u1";
  els.rollBtn.disabled = !can;
  els.rollBtn.textContent = can
    ? "Roll dice (you)"
    : pub.status === "finished"
      ? "Game over"
      : animating
        ? "Moving…"
        : active
          ? `Waiting for ${active.username}`
          : "Roll";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function animateMove(userId, move, boardSize) {
  const el = tokenEls.get(userId);
  if (!el) return;
  el.classList.add("is-moving");
  if (!move.steps || move.steps.length === 0) {
    // bounce — shake dice area only
    el.classList.remove("is-moving");
    return;
  }
  for (const step of move.steps) {
    visualPos.set(userId, step.cell);
    renderTokens(publicState(state));
    await sleep(step.kind === "step" ? 160 : 420);
  }
  el.classList.remove("is-moving");
}

async function autoPlayBots() {
  while (state && state.status === "playing" && !animating) {
    const active = currentPlayer(state);
    if (!active || active.userId === "u1") break;
    await sleep(650);
    await doRoll(active.userId);
  }
}

async function doRoll(userId) {
  if (animating || !state || state.status !== "playing") return;
  const active = currentPlayer(state);
  if (!active || active.userId !== userId) return;

  animating = true;
  updateRollButton(publicState(state));
  els.dice.classList.add("is-rolling");
  await sleep(280);
  els.dice.classList.remove("is-rolling");

  let result;
  try {
    result = roll(state, userId, { commandId: `mock-${Date.now()}-${Math.random()}` });
  } catch (err) {
    animating = false;
    log(`error: ${err.code || err.message}`);
    renderAll();
    return;
  }

  // Keep visual at previous position until animation; engine already advanced
  const prevPos = visualPos.get(userId) ?? 0;
  state = result.state;
  els.dice.innerHTML = diceFaceHtml(result.dice);
  visualPos.set(userId, prevPos);

  const name = active.username;
  if (result.move.bounced) {
    log(`${name} rolled ${result.dice} — bounce (need exact ${state.board.boardSize})`);
  } else {
    let msg = `${name} rolled ${result.dice}: ${result.move.from} → ${result.move.landed}`;
    if (result.move.portal) {
      msg += ` → ${result.move.portal.type} → ${result.move.final}`;
    }
    log(msg);
  }

  await animateMove(userId, result.move, state.board.boardSize);
  visualPos.set(userId, result.move.final);
  animating = false;
  renderAll();

  if (result.finished) {
    log(`★ ${name} wins!`);
    return;
  }
  await autoPlayBots();
}

function resetGame() {
  animating = false;
  state = startGame(
    createGame({
      roomId: "MOCK-SL",
      sessionId: "mock-ui-phase2",
      players: MOCK_PLAYERS
    })
  );
  buildBoard(state.board);
  ensureTokens(publicState(state));
  for (const p of state.players) visualPos.set(p.userId, 0);
  els.log.innerHTML = "";
  log("Mock match started — you are Kim. Bots auto-roll.");
  renderAll();
  // If somehow not Kim's turn — shouldn't happen
  autoPlayBots();
}

els.rollBtn.addEventListener("click", () => doRoll("u1"));
els.resetBtn.addEventListener("click", resetGame);

resetGame();
