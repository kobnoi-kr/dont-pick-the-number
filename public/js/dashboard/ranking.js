import { api } from "./api.js";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

const SORTS = [
  { id: "points", label: "แต้ม" },
  { id: "wins", label: "ชนะ" },
  { id: "winRate", label: "Win rate" },
  { id: "games", label: "เกม" }
];

function avatarHtml(row, size) {
  const cls = size === "lg" ? "rank-av lg" : "rank-av";
  if (row && row.avatarUrl) {
    return `<img class="${cls}" src="${esc(row.avatarUrl)}" alt="" referrerpolicy="no-referrer">`;
  }
  const ch = ((row && row.displayName) || "?").slice(0, 1).toUpperCase();
  return `<div class="${cls} ph">${esc(ch)}</div>`;
}

function metricValue(row, sort) {
  if (sort === "wins") return String(row.gamesWon || 0);
  if (sort === "winRate") return (row.winRate || 0) + "%";
  if (sort === "games") return String(row.totalGames || 0);
  return String(row.totalPoints || 0);
}

function metricLabel(sort) {
  if (sort === "wins") return "ชนะ";
  if (sort === "winRate") return "Win rate";
  if (sort === "games") return "เกม";
  return "แต้ม";
}

function countdownParts(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(total / 86400),
    h: Math.floor((total % 86400) / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60
  };
}

function calendarCountdownHtml() {
  return `<div class="rank-cal-cd" id="rankCooldown" aria-label="นับถอยหลัง">
    <div class="rank-cal-unit"><b data-cd="d">00</b><span>วัน</span></div>
    <div class="rank-cal-unit"><b data-cd="h">00</b><span>ชม</span></div>
    <div class="rank-cal-unit"><b data-cd="m">00</b><span>นาที</span></div>
    <div class="rank-cal-unit"><b data-cd="s">00</b><span>วิ</span></div>
  </div>`;
}

function rowHtml(row, sort, meId) {
  const mine = meId && row.userId === meId;
  return `<div class="rank-row${mine ? " is-me" : ""}">
    <span class="rank-pos">#${row.rank != null ? row.rank : "—"}</span>
    ${avatarHtml(row)}
    <span class="rank-meta">
      <span class="rank-name">${esc(row.displayName || "ผู้เล่น")}${mine ? ' <span class="rank-you">คุณ</span>' : ""}</span>
      <span class="rank-sub">${row.totalGames || 0} เกม · ${row.gamesWon || 0} ชนะ · ${row.winRate || 0}%</span>
    </span>
    <span class="rank-score">
      <b>${esc(metricValue(row, sort))}</b>
      <span class="tiny">${esc(metricLabel(sort))}</span>
    </span>
  </div>`;
}

function podiumSlot(row, place, sort, meId) {
  const placeClass = place === 1 ? "gold" : place === 2 ? "silver" : "bronze";
  if (!row) {
    return `<div class="podium-slot ${placeClass} empty">
      <div class="podium-medal">#${place}</div>
      <div class="rank-av lg ph">?</div>
      <div class="podium-name">—</div>
      <div class="podium-score">ยังว่าง</div>
    </div>`;
  }
  const mine = meId && row.userId === meId;
  return `<div class="podium-slot ${placeClass}${mine ? " is-me" : ""}">
    <div class="podium-medal">#${place}</div>
    ${avatarHtml(row, "lg")}
    <div class="podium-name">${esc(row.displayName || "ผู้เล่น")}${mine ? ' <span class="rank-you">คุณ</span>' : ""}</div>
    <div class="podium-score"><b>${esc(metricValue(row, sort))}</b> ${esc(metricLabel(sort))}</div>
    <div class="podium-sub">${row.gamesWon || 0} ชนะ · ${row.totalGames || 0} เกม</div>
  </div>`;
}

function podiumHtml(rows, sort, meId) {
  const top1 = rows.find((r) => r.rank === 1) || rows[0] || null;
  const top2 = rows.find((r) => r.rank === 2) || rows[1] || null;
  const top3 = rows.find((r) => r.rank === 3) || rows[2] || null;
  // Visual order: 2 (left) · 1 (center) · 3 (right)
  return `<div class="podium" aria-label="Top 3">
    ${podiumSlot(top2, 2, sort, meId)}
    ${podiumSlot(top1, 1, sort, meId)}
    ${podiumSlot(top3, 3, sort, meId)}
  </div>`;
}

export async function renderRanking(root, { user }) {
  const registered = !!(user && user.accountType === "registered");
  let period = "weekly";
  let sort = "points";
  let countdownTimer = null;
  let resetsAtMs = 0;

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h2 style="margin:0">Ranking</h2>
        <p class="muted" style="margin:6px 0 0">จัดอันดับท็อปแรงค์ · ตามเวลาไทย</p>
      </div>
    </div>
    ${
      registered
        ? `<div class="rank-controls">
            <div class="rank-tabs" role="tablist" aria-label="ช่วงเวลา">
              <button type="button" class="rank-tab on" data-period="weekly">Weekly</button>
              <button type="button" class="rank-tab" data-period="monthly">Monthly</button>
            </div>
            <div class="rank-sorts" role="group" aria-label="จัดด้วย">
              ${SORTS.map(
                (s) =>
                  `<button type="button" class="rank-chip${s.id === "points" ? " on" : ""}" data-sort="${s.id}">${s.label}</button>`
              ).join("")}
            </div>
          </div>
          <div class="rank-podium-wrap">
            ${calendarCountdownHtml()}
            <div id="rankPodium"></div>
          </div>
          <div class="card rank-card">
            <div class="rank-rest-label">อันดับ 4 ลงไป</div>
            <div id="rankList"><div class="loading">Loading…</div></div>
            <div id="rankMe" class="rank-me hidden"></div>
          </div>`
        : `<div class="card empty">เข้าสู่ระบบด้วยบัญชีจริงเพื่อดู Ranking<br>
            <a class="btn sm" href="#profile" style="margin-top:12px;display:inline-flex">ไปที่ Profile</a>
          </div>`
    }
  `;

  if (!registered) return;

  const listEl = root.querySelector("#rankList");
  const meEl = root.querySelector("#rankMe");
  const podiumEl = root.querySelector("#rankPodium");
  const cdRoot = root.querySelector("#rankCooldown");

  function tickCountdown() {
    if (!cdRoot) return;
    const left = resetsAtMs - Date.now();
    const p = countdownParts(left);
    const set = (key, val) => {
      const el = cdRoot.querySelector(`[data-cd="${key}"]`);
      if (el) el.textContent = String(val).padStart(2, "0");
    };
    set("d", p.d);
    set("h", p.h);
    set("m", p.m);
    set("s", p.s);
    if (left <= 0 && countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      load();
    }
  }

  function startCountdown(iso) {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    resetsAtMs = iso ? new Date(iso).getTime() : 0;
    tickCountdown();
    countdownTimer = setInterval(tickCountdown, 1000);
  }

  async function load() {
    listEl.innerHTML = `<div class="loading">Loading…</div>`;
    meEl.classList.add("hidden");
    meEl.innerHTML = "";
    if (podiumEl) podiumEl.innerHTML = `<div class="loading">Loading…</div>`;
    const qs = new URLSearchParams({ sort, limit: "50" });
    const { res, data } = await api(`/api/v1/leaderboard/${period}?${qs}`, { method: "GET" });
    if (!res.ok) {
      listEl.innerHTML = `<div class="empty">โหลด Ranking ไม่ได้</div>`;
      if (podiumEl) podiumEl.innerHTML = "";
      return;
    }
    startCountdown(data.resetsAt);
    const rows = data.rows || [];
    const me = data.me;
    const meId = user && user.id;
    const top = rows.filter((r) => r.rank >= 1 && r.rank <= 3);
    const rest = rows.filter((r) => r.rank > 3);

    if (podiumEl) {
      if (!top.length) {
        podiumEl.innerHTML = `<div class="card empty">ยังไม่มี Top 3 ในช่วงนี้ — เล่นเกมจนจบเพื่อขึ้นโพเดียม</div>`;
      } else {
        podiumEl.innerHTML = podiumHtml(top, sort, meId);
      }
    }

    if (!rest.length) {
      listEl.innerHTML = top.length
        ? `<div class="empty tiny" style="margin:0">ยังไม่มีอันดับ 4 ลงไป</div>`
        : `<div class="empty">ยังไม่มีสถิติในช่วงนี้</div>`;
    } else {
      listEl.innerHTML = `<div class="rank-list">${rest.map((r) => rowHtml(r, sort, meId)).join("")}</div>`;
    }
    if (me && me.rank != null && me.rank > rows.length) {
      meEl.classList.remove("hidden");
      meEl.innerHTML = `<div class="rank-me-label">อันดับของคุณ</div>${rowHtml(me, sort, meId)}`;
    } else if (me && me.rank == null && registered) {
      meEl.classList.remove("hidden");
      meEl.innerHTML = `<div class="empty tiny" style="margin:0;padding:8px 0">คุณยังไม่มีเกมในช่วงนี้</div>`;
    }
  }

  root.querySelectorAll("[data-period]").forEach((btn) => {
    btn.onclick = () => {
      period = btn.getAttribute("data-period") || "weekly";
      root.querySelectorAll("[data-period]").forEach((b) => b.classList.toggle("on", b === btn));
      load();
    };
  });
  root.querySelectorAll("[data-sort]").forEach((btn) => {
    btn.onclick = () => {
      sort = btn.getAttribute("data-sort") || "points";
      root.querySelectorAll("[data-sort]").forEach((b) => b.classList.toggle("on", b === btn));
      load();
    };
  });

  // Clear timer when leaving view via hashchange
  const onLeave = () => {
    if (countdownTimer) clearInterval(countdownTimer);
    window.removeEventListener("hashchange", onLeave);
  };
  window.addEventListener("hashchange", onLeave);

  await load();
}
