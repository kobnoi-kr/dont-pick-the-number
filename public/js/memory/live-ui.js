(function () {
  const FACE = {
    moon: "🌙",
    star: "⭐",
    fire: "🔥",
    drop: "💧",
    clover: "🍀",
    note: "🎵",
    dice: "🎲",
    target: "🎯",
    rocket: "🚀",
    rainbow: "🌈",
    apple: "🍎",
    lemon: "🍋",
    grape: "🍇",
    flower: "🌸",
    cat: "🐱",
    dog: "🐶",
    fish: "🐟",
    balloon: "🎈",
    bolt: "⚡",
    gem: "💎",
    mushroom: "🍄",
    sun: "🌻",
    penguin: "🐧",
    fox: "🦊"
  };

  function createLiveUi(opts) {
    const root = opts.root;
    const onFlip = typeof opts.onFlip === "function" ? opts.onFlip : function () {};
    let clockKey = 0;
    let localDeadline = 0;
    let last = null;
    root.innerHTML =
      '<div class="mem-top"><div><p class="mem-turn" data-mem="turn"></p><p class="mem-sub" data-mem="sub"></p></div><b class="mem-timer" data-mem="timer">—</b></div>' +
      '<div class="mem-board" data-mem="board"></div>' +
      '<ol class="mem-scores" data-mem="scores"></ol>';
    const turn = root.querySelector('[data-mem="turn"]');
    const sub = root.querySelector('[data-mem="sub"]');
    const timer = root.querySelector('[data-mem="timer"]');
    const board = root.querySelector('[data-mem="board"]');
    const scores = root.querySelector('[data-mem="scores"]');

    function remain() {
      return Math.max(0, localDeadline - Date.now());
    }
    function paintClock() {
      if (!last || !last.phaseEndsAt) {
        timer.textContent = "—";
        timer.classList.remove("is-urgent");
        return;
      }
      const sec = Math.ceil(remain() / 1000);
      timer.textContent = sec + "s";
      timer.classList.toggle("is-urgent", sec <= 5 && last.phase === "PLAYING");
    }
    function syncClock(state) {
      const ends = state && state.phaseEndsAt ? state.phaseEndsAt : 0;
      if (ends !== clockKey) {
        clockKey = ends;
        const reported = Number(state && state.phaseLeft);
        localDeadline = ends ? Date.now() + (Number.isFinite(reported) ? Math.max(0, reported) : 0) : 0;
      }
    }
    function paint(state) {
      last = state || null;
      if (!state) {
        board.innerHTML = "";
        scores.innerHTML = "";
        turn.textContent = "";
        return;
      }
      syncClock(state);
      const name = state.turnId && state.names ? state.names[state.turnId] || "—" : "—";
      turn.textContent = state.phase === "FINISHED"
        ? (state.winReason || "จบเกม")
        : state.phase === "REVEAL_HOLD"
          ? "เปิดไม่ตรง — คว่ำการ์ด"
          : "ตาของ " + name;
      sub.textContent = state.yourTurn
        ? "เปิดการ์ด 2 ใบ"
        : state.phase === "PLAYING"
          ? "รอ " + name
          : "";
      board.style.gridTemplateColumns = "repeat(" + (state.cols || 4) + ", minmax(0, 1fr))";
      board.innerHTML = (state.cards || []).map(function (card) {
        const open = card.state === "revealed" || card.state === "matched";
        const face = open ? (FACE[card.face] || "✦") : "";
        const cls = "mem-card is-" + (card.state || "hidden") + (state.phase === "REVEAL_HOLD" && card.state === "revealed" ? " is-shake" : "");
        return '<button type="button" class="' + cls + '" data-card="' + card.id + '" ' + (state.canFlip && card.state === "hidden" ? "" : "disabled") + '>' +
          '<span class="mem-face">' + face + "</span></button>";
      }).join("");
      const order = state.order || [];
      scores.innerHTML = order.map(function (id) {
        const on = id === state.turnId ? " is-turn" : "";
        return "<li class=\"" + on.trim() + "\"><b>" + esc(state.names[id] || "ผู้เล่น") + "</b><span>" +
          (state.scores[id] || 0) + " · คู่ " + (state.pairs[id] || 0) + " · คอมโบ " + (state.combos[id] || 0) + "</span></li>";
      }).join("");
      paintClock();
    }
    board.onclick = function (e) {
      const btn = e.target.closest("[data-card]");
      if (!btn || btn.disabled) return;
      onFlip(Number(btn.getAttribute("data-card")));
    };
    const tick = setInterval(paintClock, 200);
    function halt() {
      last = null;
      clockKey = 0;
      localDeadline = 0;
      paintClock();
    }
    return { paint: paint, halt: halt, stop: function () { clearInterval(tick); } };
  }

  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  window.NVMemory = { createLiveUi: createLiveUi };
})();
