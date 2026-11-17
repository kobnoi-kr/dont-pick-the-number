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

function avatarHtml(row) {
  if (row && row.avatarUrl) {
    return `<img class="rank-av" src="${esc(row.avatarUrl)}" alt="" width="36" height="36" referrerpolicy="no-referrer">`;
  }
  const ch = ((row && row.displayName) || "?").slice(0, 1).toUpperCase();
  return `<div class="rank-av ph">${esc(ch)}</div>`;
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

export async function renderRanking(root, { user }) {
  const registered = !!(user && user.accountType === "registered");
  let period = "weekly";
  let sort = "points";

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h2 style="margin:0">Ranking</h2>
        <p class="muted" style="margin:6px 0 0">จัดอันดับบัญชีที่ล็อกอินแล้ว จากเกมที่จบในช่วงเวลา</p>
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
          <div class="card rank-card">
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

  async function load() {
    listEl.innerHTML = `<div class="loading">Loading…</div>`;
    meEl.classList.add("hidden");
    meEl.innerHTML = "";
    const qs = new URLSearchParams({ sort, limit: "50" });
    const { res, data } = await api(`/api/v1/leaderboard/${period}?${qs}`, { method: "GET" });
    if (!res.ok) {
      listEl.innerHTML = `<div class="empty">โหลด Ranking ไม่ได้</div>`;
      return;
    }
    const rows = data.rows || [];
    const me = data.me;
    const meId = user && user.id;
    if (!rows.length) {
      listEl.innerHTML = `<div class="empty">ยังไม่มีสถิติในช่วงนี้ — เล่นเกมจนจบเพื่อขึ้นบอร์ด</div>`;
    } else {
      listEl.innerHTML = `<div class="rank-list">${rows.map((r) => rowHtml(r, sort, meId)).join("")}</div>`;
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

  await load();
}
