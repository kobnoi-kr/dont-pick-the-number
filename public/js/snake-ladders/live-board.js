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
 * @param {{
 *   root: HTMLElement,
 *   onRoll?: (parity?: 'even'|'odd'|null) => void,
 *   onToggleAuto?: () => void,
 *   onSnakeHit?: () => void,
 *   onBombHit?: (effect: object) => void,
 *   onYourTurn?: () => void,
 *   onOpenBag?: () => void
 * }} opts
 */
export function createLiveBoard(opts) {
  const root = opts.root;
  const onRoll = typeof opts.onRoll === "function" ? opts.onRoll : null;
  const onToggleAuto = typeof opts.onToggleAuto === "function" ? opts.onToggleAuto : null;
  const onSnakeHit = typeof opts.onSnakeHit === "function" ? opts.onSnakeHit : null;
  const onBombHit = typeof opts.onBombHit === "function" ? opts.onBombHit : null;
  const onYourTurn = typeof opts.onYourTurn === "function" ? opts.onYourTurn : null;
  const onOpenBag = typeof opts.onOpenBag === "function" ? opts.onOpenBag : null;
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
          <div class="sl-bomb-pick-bar hidden" data-el="bombPickBar" role="status">
            <span>เลือกช่องวางบอม (1–99)</span>
            <button type="button" class="sl-btn sl-btn-compact sl-btn-ghost" data-el="bombPickCancel">ยกเลิก</button>
          </div>
        </div>
      </div>
      <aside class="sl-panel" data-el="panel">
        <div class="sl-panel-head">
          <div class="sl-panel-title">บันไดงู</div>
          <div class="sl-panel-head-acts">
            <button type="button" class="sl-icon-btn" data-el="bag" title="ไอเทม" aria-label="เปิดกระเป๋าไอเทม">🎒</button>
            <button type="button" class="sl-icon-btn" data-el="hidePanel" title="ซ่อนแผง" aria-label="ซ่อนแผงควบคุม">ซ่อน</button>
          </div>
        </div>
        <div class="sl-meta">
          <div>แมพ: <strong data-el="map">—</strong></div>
          <div>สถานะ: <strong data-el="status">—</strong></div>
          <div>ตา: <strong data-el="turn">—</strong></div>
        </div>
        <ul class="sl-players" data-el="players"></ul>
        <div class="sl-dice-block">
          <div class="sl-dice" data-el="dice">${diceFaceHtml(null)}</div>
          <button type="button" class="sl-btn" data-el="roll">ทอยลูกเต๋า</button>
          <div class="sl-parity hidden" data-el="parity">
            <button type="button" class="sl-btn sl-btn-parity" data-el="even">คู่</button>
            <button type="button" class="sl-btn sl-btn-parity" data-el="odd">คี่</button>
            <span class="sl-parity-left" data-el="parityLeft"></span>
          </div>
          <button type="button" class="sl-btn sl-btn-ghost" data-el="auto">เล่นอัตโนมัติ</button>
        </div>
        <div class="sl-banner" data-el="banner" role="status"></div>
        <p class="sl-wait" data-el="wait">รอกระดานจากเซิร์ฟเวอร์…</p>
        <div class="sl-log" data-el="log"></div>
      </aside>
      <div class="sl-compact-bar hidden" data-el="compact">
        <button type="button" class="sl-btn sl-btn-compact" data-el="compactRoll">ทอย</button>
        <button type="button" class="sl-btn sl-btn-compact sl-btn-ghost" data-el="compactBag">ไอเทม</button>
        <button type="button" class="sl-btn sl-btn-compact sl-btn-ghost" data-el="compactShow">แสดงแผง</button>
      </div>
    </div>
  `;

  const live = root.querySelector(".sl-live");
  const els = {
    live,
    panel: root.querySelector('[data-el="panel"]'),
    compact: root.querySelector('[data-el="compact"]'),
    hidePanel: root.querySelector('[data-el="hidePanel"]'),
    compactShow: root.querySelector('[data-el="compactShow"]'),
    compactRoll: root.querySelector('[data-el="compactRoll"]'),
    compactBag: root.querySelector('[data-el="compactBag"]'),
    bag: root.querySelector('[data-el="bag"]'),
    board: root.querySelector('[data-el="board"]'),
    paths: root.querySelector('[data-el="paths"]'),
    tokens: root.querySelector('[data-el="tokens"]'),
    players: root.querySelector('[data-el="players"]'),
    dice: root.querySelector('[data-el="dice"]'),
    roll: root.querySelector('[data-el="roll"]'),
    parity: root.querySelector('[data-el="parity"]'),
    even: root.querySelector('[data-el="even"]'),
    odd: root.querySelector('[data-el="odd"]'),
    parityLeft: root.querySelector('[data-el="parityLeft"]'),
    auto: root.querySelector('[data-el="auto"]'),
    map: root.querySelector('[data-el="map"]'),
    status: root.querySelector('[data-el="status"]'),
    turn: root.querySelector('[data-el="turn"]'),
    log: root.querySelector('[data-el="log"]'),
    banner: root.querySelector('[data-el="banner"]'),
    wait: root.querySelector('[data-el="wait"]'),
    bombPickBar: root.querySelector('[data-el="bombPickBar"]'),
    bombPickCancel: root.querySelector('[data-el="bombPickCancel"]')
  };

  /** @type {Map<string, HTMLElement>} */
  const tokenEls = new Map();
  let builtFor = "";
  let tokenSig = "";
  let lastMoveKey = "";
  let bombPickMode = false;
  /** @type {null | { onPick?: (cell:number)=>void, onCancel?: ()=>void }} */
  let bombPickHandlers = null;
  let lastBombsSig = "";
  let lastSession = "";
  let lastTurnSoundKey = "";
  let youId = "";
  let spectator = false;
  let autoPlay = false;
  let animating = false;
  let evenOddCharges = 0;
  let panelHidden = false;

  function escAttr(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function setPanelHidden(hidden) {
    panelHidden = !!hidden;
    if (els.live) els.live.classList.toggle("is-panel-hidden", panelHidden);
    if (els.compact) els.compact.classList.toggle("hidden", !panelHidden);
    try {
      sessionStorage.setItem("nv-snake-panel-hidden", panelHidden ? "1" : "0");
    } catch (_) {}
  }

  function doRoll(parity) {
    if (spectator || animating || autoPlay) return;
    if (onRoll) onRoll(parity || null);
  }

  els.roll.addEventListener("click", () => {
    if (els.roll.disabled) return;
    doRoll(null);
  });
  if (els.compactRoll) {
    els.compactRoll.addEventListener("click", () => {
      if (els.compactRoll.disabled) return;
      doRoll(null);
    });
  }
  if (els.even) {
    els.even.addEventListener("click", () => {
      if (els.even.disabled || evenOddCharges < 1) return;
      doRoll("even");
    });
  }
  if (els.odd) {
    els.odd.addEventListener("click", () => {
      if (els.odd.disabled || evenOddCharges < 1) return;
      doRoll("odd");
    });
  }
  if (els.auto) {
    els.auto.addEventListener("click", () => {
      if (spectator || !onToggleAuto) return;
      onToggleAuto();
    });
  }
  if (els.hidePanel) els.hidePanel.addEventListener("click", () => setPanelHidden(true));
  if (els.compactShow) els.compactShow.addEventListener("click", () => setPanelHidden(false));
  if (els.bag) {
    els.bag.addEventListener("click", () => {
      if (onOpenBag) onOpenBag();
    });
  }
  if (els.compactBag) {
    els.compactBag.addEventListener("click", () => {
      if (onOpenBag) onOpenBag();
    });
  }
  try {
    if (sessionStorage.getItem("nv-snake-panel-hidden") === "1") setPanelHidden(true);
  } catch (_) {}

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
      div.dataset.cell = String(cell);
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
    lastBombsSig = "";
    els.board.querySelectorAll(".sl-cell").forEach((cellEl) => {
      cellEl.addEventListener("click", () => {
        if (!bombPickMode || !bombPickHandlers || typeof bombPickHandlers.onPick !== "function") return;
        const n = Math.floor(Number(cellEl.dataset.cell) || 0);
        const sizeNow = Number(state.boardSize) || 100;
        if (n < 1 || n >= sizeNow) return;
        bombPickHandlers.onPick(n);
      });
    });
  }

  function syncBombMarkers(bombs) {
    const list = Array.isArray(bombs) ? bombs : [];
    const sig = list.map((b) => String(b && b.cell)).sort().join(",");
    if (sig === lastBombsSig) return;
    lastBombsSig = sig;
    const want = new Set(list.map((b) => String(Math.floor(Number(b && b.cell) || 0))));
    els.board.querySelectorAll(".sl-cell").forEach((cellEl) => {
      const id = String(cellEl.dataset.cell || "");
      const on = want.has(id);
      cellEl.classList.toggle("has-bomb", on);
      let mark = cellEl.querySelector(".sl-bomb-mark");
      if (on) {
        if (!mark) {
          mark = document.createElement("img");
          mark.className = "sl-bomb-mark";
          mark.src = "/images/items/bomb-cell.png";
          mark.alt = "BOMB";
          mark.draggable = false;
          cellEl.appendChild(mark);
        }
      } else if (mark) {
        mark.remove();
      }
    });
  }

  function setBombPickMode(enabled, handlers) {
    bombPickMode = !!enabled;
    bombPickHandlers = bombPickMode ? handlers || null : null;
    root.classList.toggle("is-bomb-pick", bombPickMode);
    if (els.bombPickBar) els.bombPickBar.classList.toggle("hidden", !bombPickMode);
    els.board.querySelectorAll(".sl-cell").forEach((cellEl) => {
      const n = Math.floor(Number(cellEl.dataset.cell) || 0);
      const size = Number(els.board.children.length) || 100;
      const pickable = bombPickMode && n >= 1 && n < size;
      cellEl.classList.toggle("is-bomb-pickable", pickable);
    });
  }

  if (els.bombPickCancel) {
    els.bombPickCancel.addEventListener("click", () => {
      const cancel = bombPickHandlers && bombPickHandlers.onCancel;
      setBombPickMode(false);
      if (typeof cancel === "function") cancel();
    });
  }

  function ensureTokens(players) {
    const list = players || [];
    const sig = list
      .map((p) => `${p.userId}:${p.avatar || ""}:${p.turnOrder}`)
      .join("|");
    if (sig === tokenSig && tokenEls.size === list.length) return;
    tokenSig = sig;
    els.tokens.innerHTML = "";
    tokenEls.clear();
    list.forEach((p, i) => {
      const el = document.createElement("div");
      el.className = "sl-token";
      el.style.setProperty("--token", TOKEN_COLORS[i % TOKEN_COLORS.length]);
      const av = p.avatar ? String(p.avatar) : "";
      el.innerHTML = av
        ? `<span class="sl-token-glow"></span><img class="sl-token-face" src="${escAttr(
            av
          )}" alt="" referrerpolicy="no-referrer" draggable="false"><span class="sl-pause-tag hidden">Pause</span>`
        : `<span class="sl-token-glow"></span><span class="sl-token-face sl-token-blank" aria-hidden="true"></span><span class="sl-pause-tag hidden">Pause</span>`;
      el.title = p.username || p.userId;
      els.tokens.appendChild(el);
      tokenEls.set(p.userId, el);
    });
  }

  function syncPauseTags(players) {
    for (const p of players || []) {
      const el = tokenEls.get(p.userId);
      if (!el) continue;
      const paused = !!p.skipNextTurn;
      el.classList.toggle("is-paused", paused);
      const tag = el.querySelector(".sl-pause-tag");
      if (tag) tag.classList.toggle("hidden", !paused);
      if (paused) el.title = (p.username || p.userId) + " · Pause";
      else el.title = p.username || p.userId;
    }
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
    syncPauseTags(players);
  }

  function pulseDice() {
    els.dice.classList.remove("is-rolling");
    void els.dice.offsetWidth;
    els.dice.classList.add("is-rolling");
    setTimeout(() => els.dice.classList.remove("is-rolling"), 480);
  }

  function renderPanel(state) {
    if (els.map) els.map.textContent = state.mapName || state.mapId || "—";
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
        const isAuto = !!(p.auto && !p.bot);
        const paused = !!p.skipNextTurn;
        li.className =
          "sl-player" +
          (active && active.userId === p.userId ? " is-turn" : "") +
          (isAuto ? " is-auto" : "") +
          (paused ? " is-paused" : "");
        if (p.userId) li.dataset.pid = p.userId;
        const posLabel = p.position > 0 ? `ช่อง ${p.position}` : "เริ่ม";
        const color = TOKEN_COLORS[p.turnOrder % TOKEN_COLORS.length];
        const av = p.avatar
          ? `<img class="sl-player-av" src="${escAttr(p.avatar)}" alt="" referrerpolicy="no-referrer" width="28" height="28">`
          : `<span class="sl-player-av sl-player-av-ph" style="--token:${color}" aria-hidden="true"></span>`;
        const headTag = paused
          ? `<span class="sl-pause-tag" title="ข้ามเทิร์น">Pause</span>`
          : isAuto
            ? `<span class="pavatar-auto-tag" title="เล่นอัตโนมัติ">AUTO</span>`
            : "";
        const tags = [];
        if (p.userId === youId) tags.push("คุณ");
        if (p.bot) tags.push("บอท");
        else if (isAuto) tags.push("ออโต้");
        if (paused) tags.push("Pause");
        li.innerHTML = `
          <span class="sl-player-av-wrap${isAuto ? " is-auto" : ""}${paused ? " is-paused" : ""}">${av}${headTag}</span>
          <span class="sl-player-name">${escapeHtml(p.username)}${
            tags.length ? ` · ${escapeHtml(tags.join(" · "))}` : ""
          }</span>
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
      !autoPlay &&
      state.status === "playing" &&
      active &&
      active.userId === youId;
    els.roll.disabled = !can;
    if (els.compactRoll) els.compactRoll.disabled = !can;
    if (spectator) els.roll.textContent = "ชมอย่างเดียว";
    else if (autoPlay && state.status === "playing") els.roll.textContent = "ออโต้กำลังทอย…";
    else if (can) els.roll.textContent = "ทอยลูกเต๋า";
    else if (animating) els.roll.textContent = "กำลังเดิน…";
    else if (state.status === "finished") els.roll.textContent = "จบเกม";
    else if (active) els.roll.textContent = `รอ ${active.username}`;
    else els.roll.textContent = "ทอยลูกเต๋า";
    if (els.compactRoll) {
      els.compactRoll.textContent = can ? "ทอย" : autoPlay ? "ออโต้…" : "รอ";
    }

    const showParity = !spectator && evenOddCharges > 0 && state.status === "playing";
    if (els.parity) els.parity.classList.toggle("hidden", !showParity);
    if (els.even) els.even.disabled = !can || evenOddCharges < 1;
    if (els.odd) els.odd.disabled = !can || evenOddCharges < 1;
    if (els.parityLeft) {
      els.parityLeft.textContent = showParity ? `เหลือ ${evenOddCharges}/5` : "";
    }
    if (els.bag) els.bag.classList.toggle("hidden", !!spectator);
    if (els.compactBag) els.compactBag.classList.toggle("hidden", !!spectator);

    if (els.auto) {
      const showAuto = !spectator && state.status === "playing";
      els.auto.classList.toggle("hidden", !showAuto);
      els.auto.classList.toggle("is-on", autoPlay);
      els.auto.setAttribute("aria-pressed", autoPlay ? "true" : "false");
      els.auto.textContent = autoPlay ? "ปิดออโต้" : "เล่นอัตโนมัติ";
      els.auto.disabled = !showAuto;
    }
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

  function clearCellLights(hard) {
    const sel = hard
      ? ".sl-cell.is-lit, .sl-cell.is-lit-portal, .sl-cell.is-lit-ladder, .sl-cell.is-lit-snake, .sl-cell.is-lit-trail"
      : ".sl-cell.is-lit, .sl-cell.is-lit-portal, .sl-cell.is-lit-ladder, .sl-cell.is-lit-snake";
    els.board.querySelectorAll(sel).forEach((n) => {
      n.classList.remove("is-lit", "is-lit-portal", "is-lit-ladder", "is-lit-snake");
      if (hard) n.classList.remove("is-lit-trail");
    });
  }

  function lightCell(cell, kind) {
    // Keep a short trail so the floor glow is easy to see while walking
    els.board.querySelectorAll(".sl-cell.is-lit, .sl-cell.is-lit-portal").forEach((n) => {
      n.classList.remove("is-lit", "is-lit-portal", "is-lit-ladder", "is-lit-snake");
      n.classList.add("is-lit-trail");
    });
    const trails = els.board.querySelectorAll(".sl-cell.is-lit-trail");
    if (trails.length > 3) {
      for (let i = 0; i < trails.length - 3; i++) trails[i].classList.remove("is-lit-trail");
    }
    const node = els.board.querySelector(`.sl-cell[data-cell="${cell}"]`);
    if (!node) return;
    node.classList.remove("is-lit-trail");
    if (kind === "ladder") {
      node.classList.add("is-lit", "is-lit-portal", "is-lit-ladder");
    } else if (kind === "snake") {
      node.classList.add("is-lit", "is-lit-portal", "is-lit-snake");
    } else if (kind === "bomb_back") {
      node.classList.add("is-lit", "is-lit-bomb");
    } else {
      node.classList.add("is-lit");
    }
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
    clearCellLights(true);
    for (const step of move.steps) {
      lightCell(step.cell, step.kind);
      placeTokens(state, { userId, cell: step.cell });
      if (step.kind === "snake" && onSnakeHit) onSnakeHit();
      await sleep(step.kind === "step" ? 170 : 460);
    }
    await sleep(320);
    clearCellLights(true);
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
    autoPlay = !!(meta && meta.auto);
    evenOddCharges = Math.max(0, Number(meta && meta.evenOddCharges) || 0);
    root.classList.toggle("is-spectator", spectator);
    root.classList.toggle("is-auto", autoPlay);

    if (!state) {
      els.wait.classList.add("is-visible");
      els.wait.textContent = "รอกระดานจากเซิร์ฟเวอร์…";
      els.roll.disabled = true;
      els.roll.textContent = spectator ? "ชมอย่างเดียว" : "รอ…";
      return;
    }

    els.wait.classList.remove("is-visible");
    root.classList.remove("hidden");

    const mapId = String(state.mapId || "classic");
    root.dataset.map = mapId;
    try {
      document.body.dataset.snakeMap = mapId;
    } catch (_) {}

    const session = String(state.sessionId || state.roomId || "");
    if (session && session !== lastSession) {
      lastSession = session;
      lastMoveKey = "";
      lastTurnSoundKey = "";
      els.log.innerHTML = "";
      if (spectator) log("เริ่มชมแมตช์");
    }

    const key = `${mapId}:${state.boardSize}:${(state.ladders || []).length}:${(state.snakes || []).length}`;
    if (key !== builtFor) buildBoard(state);
    ensureTokens(state.players);

    const moveKey = state.lastMove
      ? `${state.version}:${state.lastDice}:${state.lastMove.from}:${state.lastMove.final}:${state.lastMoverId || ""}:${
          (state.lastMove.bombEffect && state.lastMove.bombEffect.type) || ""
        }`
      : "";
    const isNewMove = !!(moveKey && moveKey !== lastMoveKey);
    const shouldAnim =
      isNewMove &&
      state.lastMove &&
      Array.isArray(state.lastMove.steps) &&
      state.lastMove.steps.length;
    const bombFx = state.lastMove && state.lastMove.bombEffect;

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
        if (bombFx && bombFx.type === "angel") msg += " · 👼 โมฆะบอม";
        else if (bombFx && bombFx.type === "back") msg += ` · 💣 ถอย ${bombFx.steps} ช่อง`;
        else if (bombFx && bombFx.type === "pause") msg += ` · 💣 Pause ${bombFx.turns} เทิร์น`;
        log(msg);
      }
      if (bombFx && onBombHit) onBombHit(bombFx);
      await animateLastMove(state);
    } else if (isNewMove) {
      lastMoveKey = moveKey;
      if (bombFx) {
        const who =
          (state.players || []).find((p) => p.userId === state.lastMoverId) || null;
        const name = who ? who.username : "?";
        if (bombFx.type === "angel") log(`${name} · 👼 โมฆะบอม`);
        else if (bombFx.type === "back") log(`${name} · 💣 ถอย ${bombFx.steps} ช่อง`);
        else if (bombFx.type === "pause") log(`${name} · 💣 Pause ${bombFx.turns} เทิร์น`);
        if (onBombHit) onBombHit(bombFx);
      }
    }

    syncBombMarkers(state.bombs);
    placeTokens(state, null);
    renderPanel(state);

    // Your-turn cue: only the active seat hears it
    const active = (state.players || []).find((p) => p.turnOrder === state.currentTurn);
    const turnSoundKey = `${state.sessionId || ""}:${state.turnNumber || 0}:${state.currentTurn}`;
    if (
      state.status === "playing" &&
      active &&
      active.userId === youId &&
      !spectator &&
      turnSoundKey !== lastTurnSoundKey
    ) {
      lastTurnSoundKey = turnSoundKey;
      if (onYourTurn) onYourTurn();
    }
  }

  function destroy() {
    setBombPickMode(false);
    root.innerHTML = "";
    tokenEls.clear();
    tokenSig = "";
    lastTurnSoundKey = "";
    lastBombsSig = "";
    try {
      delete document.body.dataset.snakeMap;
    } catch (_) {}
  }

  return { update, destroy, root, setBombPickMode };
}
