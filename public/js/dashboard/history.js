import { api } from "./api.js";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function when(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export async function renderHistory(root) {
  root.innerHTML = `<div class="card"><h2>Game History</h2><div id="histBody"><div class="loading">Loading…</div></div></div>
    <div class="card hidden" id="histDetail" style="margin-top:14px"></div>`;
  const body = root.querySelector("#histBody");
  const { res, data } = await api("/api/v1/history", { method: "GET" });
  if (!res.ok) {
    body.innerHTML = `<div class="error-state">โหลดประวัติไม่สำเร็จ <button class="btn ghost sm" id="retryHist">Retry</button></div>`;
    body.querySelector("#retryHist").onclick = () => renderHistory(root);
    return;
  }
  const items = (data && data.items) || [];
  if (!items.length) {
    body.innerHTML = `<div class="empty">You haven't played any games yet.</div>`;
    return;
  }
  body.innerHTML = `
    <table class="table">
      <thead><tr><th>Room</th><th>Mode</th><th>Result</th><th>Rank</th><th>Points</th><th>Date</th><th></th></tr></thead>
      <tbody>
        ${items.map((it) => `
          <tr>
            <td>${esc(it.roomName)}</td>
            <td>${esc(it.gameMode)}</td>
            <td>${esc(it.result || "—")}</td>
            <td>${it.rank != null ? "#" + it.rank : "—"}</td>
            <td>${it.pointsEarned != null ? it.pointsEarned : "—"}</td>
            <td class="tiny">${when(it.endedAt || it.startedAt)}</td>
            <td><button class="btn ghost sm" data-id="${esc(it.id)}">Details</button></td>
          </tr>`).join("")}
      </tbody>
    </table>`;

  body.querySelectorAll("[data-id]").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute("data-id");
      const detail = root.querySelector("#histDetail");
      detail.classList.remove("hidden");
      detail.innerHTML = `<div class="loading">Loading details…</div>`;
      const d = await api("/api/v1/history/" + id, { method: "GET" });
      if (!d.res.ok || !d.data || !d.data.game) {
        detail.innerHTML = `<div class="error-state">ไม่พบรายละเอียด</div>`;
        return;
      }
      const g = d.data.game;
      const players = g.players || [];
      detail.innerHTML = `
        <h3>${esc(g.roomName)}</h3>
        <p class="muted">${esc(g.gameMode)} · ${when(g.startedAt)} → ${when(g.endedAt)}</p>
        <table class="table">
          <thead><tr><th>Rank</th><th>Player</th><th>Points</th><th>Result</th></tr></thead>
          <tbody>
            ${players.map((p) => `<tr><td>#${p.rank}</td><td>${esc(p.displayName)}</td><td>${p.points}</td><td>${p.won ? "Win" : "—"}</td></tr>`).join("")}
          </tbody>
        </table>`;
    };
  });
}
