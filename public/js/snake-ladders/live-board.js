/**
 * Server-driven Snake & Ladders board for /play (Phase 3).
 * Does not roll locally — parent calls update(state) after WS snaps.
 */

const TOKEN_COLORS = ["#5b9cf5", "#2dd4a8", "#f5c542", "#f07178", "#c084fc", "#fb923c"];

function cellToGrid(cell, boardSize) {
  const size = Number(boardSize) || 100;
  const n = Number(cell);
  if (!Number.isInteger(n) || n < 1 || n > size) return null;
  const side = Math.round(Math.sqrt(size));
  const idx = n - 1;
  const rowFromBottom = Math.floor(idx / side);
  const colInRow = idx % side;
  const col = rowFromBottom % 2 === 0 ? colInRow : side - 1 - colInRow;
  return { row: rowFromBottom, col, side };
}

function cellCenterPercent(cell, boardSize) {
  const g = cellToGrid(cell, boardSize);
  if (!g) return null;
  return {
    x: ((g.col + 0.5) / g.side) * 100,
    y: ((g.side - 1 - g.row + 0.5) / g.side) * 100
  };
}

function tokenOffset(index, total) {
  if (total <= 1) return { dx: 0, dy: 0 };
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  const r = 2.2;
  return { dx: Math.cos(angle) * r, dy: Math.sin(angle) * r };
}

/**
 * @param {{root: HTMLElement, onRoll?: () => void}} opts
 */
export function createLiveBoard(opts) {
  const root = opts.root;
  const onRoll = typeof opts.onRoll === "function" ? opts.onRoll : null;
  root.innerHTML = `
    <div class="sl-live">
      <div class="sl-board-wrap">
        <div class="sl-board" data-el="board"></div>
        <svg class="sl-paths" data-el="paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
        <div class="sl-tokens" data-el="tokens" aria-hidden="true"></div>
      </div>
      <aside class="sl-panel">
        <h2>กระดาน</h2>
        <div class="sl-meta">
          <div>สถานะ: <strong data-el="status">—</strong></div>
          <div>ตา: <strong data-el="turn">—</strong></div>
        </div>
        <ul class="sl-players" data-el="players"></ul>
        <div class="sl-dice-block">
          <div class="sl-dice" data-el="dice">—</div>
          <button type="button" class="sl-btn" data-el="roll">ทอยลูกเต๋า</button>
        </div>
        <div class="sl-log" data-el="log"></div>
      </aside>
    </div>
  `;

  const els = {
    board: root.querySelector('[data-el="board"]'),
    paths: root.querySelector('[data-el="paths"]'),
    tokens: root.querySelector('[data-el="tokens"]'),
    players: root.querySelector('[data-el="players"]'),
    dice: root.querySelector('[data-el="dice"]'),
    roll: root.querySelector('[data-el="roll"]'),
    status: root.querySelector('[data-el="status"]'),
    turn: root.querySelector('[data-el="turn"]'),
    log: root.querySelector('[data-el="log"]')
  };

  /** @type {Map<string, HTMLElement>} */
  const tokenEls = new Map();
  let builtFor = "";
  let lastVersion = -1;
  let lastMoveKey = "";
  let youId = "";
  let animating = false;

  els.roll.addEventListener("click", () => {
    if (animating || els.roll.disabled) return;
    if (onRoll) onRoll();
  });

  function log(msg) {
    const line = document.createElement("div");
    line.textContent = msg;
    els.log.prepend(line);
    while (els.log.childElementCount > 30) els.log.lastChild.remove();
  }

  function buildBoard(state) {
    const size = state.boardSize || 100;
    const ladderStarts = new Set((state.ladders || []).map((x) => x.start));
    const snakeStarts = new Set((state.snakes || []).map((x) => x.start));
    els.board.innerHTML = "";
    for (let cell = 1; cell <= size; cell++) {
      const div = document.createElement("div");
      div.className = "sl-cell";
      div.textContent = String(cell);
      const g = cellToGrid(cell, size);
      if (g) {
        div.style.gridRow = String(g.side - g.row);
        div.style.gridColumn = String(g.col + 1);
      }
      if (ladderStarts.has(cell)) div.classList.add("is-ladder-start");
      if (snakeStarts.has(cell)) div.classList.add("is-snake-start");
      if (cell === size) div.classList.add("is-goal");
      els.board.appendChild(div);
    }
    const parts = [];
    for (const lad of state.ladders || []) {
      const a = cellCenterPercent(lad.start, size);
      const b = cellCenterPercent(lad.end, size);
      if (!a || !b) continue;
      parts.push(
        `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#3ecf8e" stroke-width="1.8" stroke-linecap="round" opacity="0.9"/>`,
        `<circle cx="${a.x}" cy="${a.y}" r="1.4" fill="#3ecf8e"/>`,
        `<circle cx="${b.x}" cy="${b.y}" r="1.4" fill="#3ecf8e"/>`
      );
    }
    for (const sn of state.snakes || []) {
      const a = cellCenterPercent(sn.start, size);
      const b = cellCenterPercent(sn.end, size);
      if (!a || !b) continue;
      const mx = (a.x + b.x) / 2 + (a.x < b.x ? 6 : -6);
      const my = (a.y + b.y) / 2;
      parts.push(
        `<path d="M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}" fill="none" stroke="#f07178" stroke-width="1.8" stroke-linecap="round" opacity="0.9"/>`,
        `<circle cx="${a.x}" cy="${a.y}" r="1.4" fill="#f07178"/>`,
        `<circle cx="${b.x}" cy="${b.y}" r="1.4" fill="#f07178"/>`
      );
    }
    els.paths.innerHTML = parts.join("");
    builtFor = `${size}:${(state.ladders || []).length}:${(state.snakes || []).length}`;
  }

  function ensureTokens(players) {
    els.tokens.innerHTML = "";
    tokenEls.clear();
    (players || []).forEach((p, i) => {
      const el = document.createElement("div");
      el.className = "sl-token";
      el.style.background = TOKEN_COLORS[i % TOKEN_COLORS.length];
      el.textContent = String((p.username || "?")[0]).toUpperCase();
      el.title = p.username || p.userId;
      els.tokens.appendChild(el);
      tokenEls.set(p.userId, el);
    });
  }

  function placeTokens(state, visualOverride) {
    const players = state.players || [];
    const byCell = new Map();
    for (const p of players) {
      const cell =
        visualOverride && visualOverride.userId === p.userId
          ? visualOverride.cell
          : p.position;
      if (!byCell.has(cell)) byCell.set(cell, []);
      byCell.get(cell).push(p);
    }
    for (const p of players) {
      const cell =
        visualOverride && visualOverride.userId === p.userId
          ? visualOverride.cell
          : p.position;
      const group = byCell.get(cell) || [p];
      const idx = group.findIndex((x) => x.userId === p.userId);
      const el = tokenEls.get(p.userId);
      if (!el) continue;
      const off = tokenOffset(idx, group.length);
      if (!cell || cell <= 0) {
        const c = cellCenterPercent(1, state.boardSize);
        el.style.left = `${(c ? c.x : 5) + off.dx - 3}%`;
        el.style.top = `${(c ? c.y : 95) + off.dy + 4}%`;
      } else {
        const c = cellCenterPercent(cell, state.boardSize);
        if (c) {
          el.style.left = `${c.x + off.dx}%`;
          el.style.top = `${c.y + off.dy}%`;
        }
      }
      el.classList.toggle("is-active", p.turnOrder === state.currentTurn && state.status === "playing");
    }
  }

  function renderPanel(state) {
    els.status.textContent = state.status || "—";
    const active = (state.players || []).find((p) => p.turnOrder === state.currentTurn);
    els.turn.textContent = active
      ? `${active.username} (#${state.turnNumber || 0})`
      : "—";
    els.dice.textContent = state.lastDice != null ? String(state.lastDice) : "—";
    els.players.innerHTML = "";
    (state.players || [])
      .slice()
      .sort((a, b) => a.turnOrder - b.turnOrder)
      .forEach((p) => {
        const li = document.createElement("li");
        li.className =
          "sl-player" + (active && active.userId === p.userId ? " is-turn" : "");
        li.innerHTML = `
          <span class="sl-player-dot" style="background:${TOKEN_COLORS[p.turnOrder % TOKEN_COLORS.length]}"></span>
          <span class="sl-player-name">${escapeHtml(p.username)}</span>
          <span class="sl-player-pos">${p.position}</span>
        `;
        els.players.appendChild(li);
      });
    const can =
      !animating &&
      state.status === "playing" &&
      active &&
      active.userId === youId;
    els.roll.disabled = !can;
    els.roll.textContent = can
      ? "ทอยลูกเต๋า"
      : animating
        ? "กำลังเดิน…"
        : state.status === "finished"
          ? "จบเกม"
          : active
            ? `รอ ${active.username}`
            : "ทอยลูกเต๋า";
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function animateLastMove(state) {
    const move = state.lastMove;
    if (!move || !move.steps || !move.steps.length) return;
    const userId = state.lastMoverId;
    if (!userId) return;

    const el = tokenEls.get(userId);
    if (el) el.classList.add("is-moving");
    animating = true;
    renderPanel(state);
    for (const step of move.steps) {
      placeTokens(state, { userId, cell: step.cell });
      await sleep(step.kind === "step" ? 140 : 380);
    }
    if (el) el.classList.remove("is-moving");
    animating = false;
  }

  /**
   * @param {object|null} state publicState from server
   * @param {{youId?: string}} [meta]
   */
  async function update(state, meta) {
    if (!state) {
      root.classList.add("hidden");
      return;
    }
    root.classList.remove("hidden");
    youId = (meta && meta.youId) || youId || "";
    const key = `${state.boardSize}:${(state.ladders || []).length}:${(state.snakes || []).length}`;
    if (key !== builtFor) buildBoard(state);
    if (tokenEls.size !== (state.players || []).length) ensureTokens(state.players);

    const moveKey = state.lastMove
      ? `${state.version}:${state.lastDice}:${state.lastMove.from}:${state.lastMove.final}`
      : "";
    const shouldAnim =
      moveKey &&
      moveKey !== lastMoveKey &&
      state.lastMove &&
      Array.isArray(state.lastMove.steps) &&
      state.lastMove.steps.length;

    if (shouldAnim) {
      lastMoveKey = moveKey;
      lastVersion = state.version;
      const who =
        (state.players || []).find((p) => p.userId === state.lastMoverId) ||
        (state.players || []).find((p) => p.position === state.lastMove.final) ||
        null;
      const name = who ? who.username : "?";
      if (state.lastMove.bounced) {
        log(`${name} ทอยได้ ${state.lastDice} — เด้ง (ต้องพอดี 100)`);
      } else {
        let msg = `${name} ทอย ${state.lastDice}: ${state.lastMove.from} → ${state.lastMove.landed}`;
        if (state.lastMove.portal) {
          msg += ` → ${state.lastMove.portal.type} → ${state.lastMove.final}`;
        }
        log(msg);
      }
      await animateLastMove(state);
    } else {
      lastVersion = state.version;
      if (moveKey) lastMoveKey = moveKey;
    }

    placeTokens(state, null);
    renderPanel(state);
  }

  function destroy() {
    root.innerHTML = "";
    tokenEls.clear();
  }

  return { update, destroy, root };
}
