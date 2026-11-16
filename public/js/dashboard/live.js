import { api, playUrl } from "./api.js";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export async function renderLive(root) {
  root.innerHTML = `<div class="card"><h2>Live Games</h2><p class="muted">ห้องที่กำลังเล่น — ดูแบบ Spectator ได้</p><div id="liveBody"><div class="loading">Loading…</div></div></div>`;
  const body = root.querySelector("#liveBody");
  const { res, data } = await api("/api/v1/live-games", { method: "GET" });
  if (!res.ok) {
    body.innerHTML = `<div class="error-state">โหลดไม่สำเร็จ <button class="btn ghost sm" id="retryLive">Retry</button></div>`;
    body.querySelector("#retryLive").onclick = () => renderLive(root);
    return;
  }
  const games = (data && data.games) || [];
  if (!games.length) {
    body.innerHTML = `<div class="empty">ไม่มีเกมที่กำลังเล่นอยู่ตอนนี้</div>`;
    return;
  }
  body.innerHTML = `
    <table class="table">
      <thead><tr><th>Room</th><th>Host</th><th>Players</th><th>Mode</th><th>Phase</th><th>Spectators</th><th></th></tr></thead>
      <tbody>
        ${games.map((g) => `
          <tr>
            <td><b>${esc(g.title)}</b><div class="tiny">${esc(g.code)}</div></td>
            <td>${esc(g.host)}</td>
            <td>${g.count}/${g.max}</td>
            <td>${g.cat === "wheel" ? "Wheel" : "Secret"}</td>
            <td><span class="pill busy">${esc(g.phase)}</span></td>
            <td>${g.spectators || 0}</td>
            <td><a class="btn sm" href="${playUrl({ code: g.code, watch: true })}">Watch</a></td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}
