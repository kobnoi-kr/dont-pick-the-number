/**
 * Server-driven Snake & Ladders board for /play.
 * Board-game look; rolls come from WS snaps only.
 */

import {
  cellToGrid,
  cellCenterPercent,
  renderBoardPaths,
  diceFaceHtml
} from "./board-art.js";

const TOKEN_COLORS = ["#5b9cf5", "#2dd4a8", "#f5c542", "#f07178", "#c084fc", "#fb923c"];

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
      <div class="sl-stage">
        <div class="sl-board-wrap">
          <div class="sl-board-shadow" aria-hidden="true"></div>
          <div class="sl-board-frame">
            <div class="sl-board" data-el="board"></div>
            <svg class="sl-paths" data-el="paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
            <div class="sl-tokens" data-el="tokens" aria-hidden="true"></div>
          </div>
        </div>
      </div>
      <aside class="sl-panel">
        <div class="sl-panel-title">งูและบันได</div>
        <div class="sl-meta">
          <div>สถานะ: <strong data-el="status">—</strong></div>
          <div>ตา: <strong data-el="turn">—</strong></div>
        </div>
        <ul class="sl-players" data-el="players"></ul>
        <div class="sl-dice-block">
          <div class="sl-dice" data-el="dice">${diceFaceHtml(null)}</div>
          <button type="button" class="sl-btn" data-el="roll">ทอยลูกเต๋า</button>
        </div>
        <div class="sl-banner" data-el="banner" role="status"></div>
        <p class="sl-wait" data-el="wait">รอกระดานจากเซิร์ฟเวอร์…</p>
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
    log: root.querySelector('[data-el="log"]'),
    banner: root.querySelector('[data-el="banner"]'),
    wait: root.querySelector('[data-el="wait"]')
  };

  /** @type {Map<string, HTMLElement>} */
  const tokenEls = new Map();
  let builtFor = "";
  let lastMoveKey = "";
  let lastSession = "";
  let youId = "";
  let spectator = false;
  let animating = false;

  els.roll.addEventListener("click", () => {
    if (spectator || animating || els.roll.disabled) return;
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
        div.classList.add((g.row + g.col) % 2 === 0 ? "is-light" : "is-dark");
      }
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
    els.paths.innerHTML = renderBoardPaths(state.ladders, state.snakes, size);
    builtFor = `${size}:${(state.ladders || []).length}:${(state.snakes || []).length}`;
  }

  function ensureTokens(players) {
    els.tokens.innerHTML = "";
    tokenEls.clear();
    (players || []).forEach((p, i) => {
      const el = document.createElement("div");
      el.className = "sl-token";
      el.style.setProperty("--token", TOKEN_COLORS[i % TOKEN_COLORS.length]);
      el.innerHTML = `<span class="sl-token-glow"></span><span class="sl-token-face">${String(
        (p.username || "?")[0]
      ).toUpperCase()}</span>`;
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
      el.classList.toggle(
        "is-active",
        p.turnOrder === state.currentTurn && state.status === "playing"
      );
    }
  }

  function pulseDice() {
    els.dice.classList.remove("is-rolling");
    void els.dice.offsetWidth;
    els.dice.classList.add("is-rolling");
    setTimeout(() => els.dice.classList.remove("is-rolling"), 480);
  }

  function renderPanel(state) {
    els.status.textContent = spectator
      ? (state.status || "—") + " · ชม"
      : state.status || "—";
    const active = (state.players || []).find((p) => p.turnOrder === state.currentTurn);
    els.turn.textContent = active
      ? `${active.username} (#${state.turnNumber || 0})`
      : "—";
    els.dice.innerHTML = diceFaceHtml(state.lastDice);
    els.players.innerHTML = "";
    (state.players || [])
      .slice()
      .sort((a, b) => a.turnOrder - b.turnOrder)
      .forEach((p) => {
        const li = document.createElement("li");
        li.className =
          "sl-player" + (active && active.userId === p.userId ? " is-turn" : "");
        const posLabel = p.position > 0 ? `ช่อง ${p.position}` : "เริ่ม";
        li.innerHTML = `
          <span class="sl-player-dot" style="background:${TOKEN_COLORS[p.turnOrder % TOKEN_COLORS.length]}"></span>
          <span class="sl-player-name">${escapeHtml(p.username)}</span>
          <span class="sl-player-pos">${posLabel}</span>
        `;
        els.players.appendChild(li);
      });

    if (state.status === "finished" && state.winnerId) {
      const w = (state.players || []).find((p) => p.userId === state.winnerId);
      els.banner.textContent = `🏆 ${w ? w.username : "ผู้เล่น"} ถึง 100 แล้ว!`;
      els.banner.classList.add("is-visible");
    } else {
      els.banner.classList.remove("is-visible");
      els.banner.textContent = "";
    }

    const can =
      !spectator &&
      !animating &&
      state.status === "playing" &&
      active &&
      active.userId === youId;
    els.roll.disabled = !can;
    if (spectator) els.roll.textContent = "ชมอย่างเดียว";
    else if (can) els.roll.textContent = "ทอยลูกเต๋า";
    else if (animating) els.roll.textContent = "กำลังเดิน…";
    else if (state.status === "finished") els.roll.textContent = "จบเกม";
    else if (active) els.roll.textContent = `รอ ${active.username}`;
    else els.roll.textContent = "ทอยลูกเต๋า";
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

    pulseDice();
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
   * @param {object|null} state
   * @param {{youId?: string, spectator?: boolean}} [meta]
   */
  async function update(state, meta) {
    youId = (meta && meta.youId) || youId || "";
    spectator = !!(meta && meta.spectator);
    root.classList.toggle("is-spectator", spectator);

    if (!state) {
      els.wait.classList.add("is-visible");
      els.wait.textContent = "รอกระดานจากเซิร์ฟเวอร์…";
      els.roll.disabled = true;
      els.roll.textContent = spectator ? "ชมอย่างเดียว" : "รอ…";
      return;
    }

    els.wait.classList.remove("is-visible");
    root.classList.remove("hidden");

    const session = String(state.sessionId || state.roomId || "");
    if (session && session !== lastSession) {
      lastSession = session;
      lastMoveKey = "";
      els.log.innerHTML = "";
      if (spectator) log("เริ่มชมแมตช์");
    }

    const key = `${state.boardSize}:${(state.ladders || []).length}:${(state.snakes || []).length}`;
    if (key !== builtFor) buildBoard(state);
    if (tokenEls.size !== (state.players || []).length) ensureTokens(state.players);

    const moveKey = state.lastMove
      ? `${state.version}:${state.lastDice}:${state.lastMove.from}:${state.lastMove.final}:${state.lastMoverId || ""}`
      : "";
    const shouldAnim =
      moveKey &&
      moveKey !== lastMoveKey &&
      state.lastMove &&
      Array.isArray(state.lastMove.steps) &&
      state.lastMove.steps.length;

    if (shouldAnim) {
      lastMoveKey = moveKey;
      const who =
        (state.players || []).find((p) => p.userId === state.lastMoverId) ||
        (state.players || []).find((p) => p.position === state.lastMove.final) ||
        null;
      const name = who ? who.username : "?";
      if (state.lastMove.bounced) {
        log(`${name} ทอยได้ ${state.lastDice} — เด้ง (ต้องพอดี 100)`);
        pulseDice();
      } else {
        let msg = `${name} ทอย ${state.lastDice}: ${state.lastMove.from} → ${state.lastMove.landed}`;
        if (state.lastMove.portal) {
          msg += state.lastMove.portal.type === "ladder" ? " 🪜" : " 🐍";
          msg += ` → ${state.lastMove.final}`;
        }
        log(msg);
      }
      await animateLastMove(state);
    } else if (moveKey) {
      lastMoveKey = moveKey;
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
