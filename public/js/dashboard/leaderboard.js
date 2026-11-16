import { api } from "./api.js";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export async function renderLeaderboard(root, { period = "global" } = {}) {
  root.innerHTML = `
    <div class="card">
      <h2>Leaderboard</h2>
      <div class="filters" id="lbFilters">
        <button type="button" data-p="global" class="${period === "global" ? "on" : ""}">Global</button>
        <button type="button" data-p="weekly" class="${period === "weekly" ? "on" : ""}">Weekly</button>
        <button type="button" data-p="monthly" class="${period === "monthly" ? "on" : ""}">Monthly</button>
        <button type="button" data-p="friends" class="${period === "friends" ? "on" : ""}">Friends</button>
      </div>
      <div id="lbMine" class="card" style="background:var(--nv-bg-2);margin:12px 0"></div>
      <div id="lbBody"><div class="loading">Loading…</div></div>
    </div>`;

  root.querySelector("#lbFilters").onclick = (e) => {
    const b = e.target.closest("button[data-p]");
    if (b) renderLeaderboard(root, { period: b.getAttribute("data-p") });
  };

  const path = period === "friends"
    ? "/api/v1/leaderboard/friends"
    : "/api/v1/leaderboard/" + period;
  const { res, data } = await api(path, { method: "GET" });
  const body = root.querySelector("#lbBody");
  const mine = root.querySelector("#lbMine");
  if (!res.ok) {
    body.innerHTML = `<div class="error-state">โหลดอันดับไม่สำเร็จ</div>`;
    mine.innerHTML = "";
    return;
  }
  const rows = (data && data.rows) || [];
  const me = data && data.me;
  if (me && me.rank != null) {
    mine.innerHTML = `<div style="display:flex;justify-content:space-between;gap:12px"><div><b>Your rank</b><div class="tiny">${esc(me.displayName)}</div></div><div style="text-align:right"><div class="value" style="font-size:1.4rem;font-weight:800">#${me.rank}</div><div class="tiny">${me.totalPoints || 0} pts · ${me.gamesWon || 0} wins</div></div></div>`;
  } else {
    mine.innerHTML = `<div class="empty" style="padding:12px">Play your first game to appear on the leaderboard.</div>`;
  }
  if (!rows.length) {
    body.innerHTML = `<div class="empty">No ranking data yet.</div>`;
    return;
  }
  body.innerHTML = `
    <table class="table">
      <thead><tr><th>Rank</th><th>Player</th><th>Points</th><th>Wins</th><th>Win Rate</th></tr></thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td>#${r.rank}</td>
            <td style="display:flex;gap:8px;align-items:center">
              ${r.avatarUrl ? `<img src="${esc(r.avatarUrl)}" width="28" height="28" style="border-radius:50%;object-fit:cover" referrerpolicy="no-referrer">` : `<span class="avatar-fallback" style="width:28px;height:28px;font-size:0.75rem">${esc((r.displayName || "?").slice(0, 1))}</span>`}
              ${esc(r.displayName)}
            </td>
            <td>${r.totalPoints || 0}</td>
            <td>${r.gamesWon || 0}</td>
            <td>${r.winRate != null ? r.winRate + "%" : "—"}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}
