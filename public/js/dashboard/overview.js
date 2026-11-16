import { api, playUrl } from "./api.js";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export async function renderOverview(root, { user, openCreate, openJoinFocus }) {
  const name = (user && (user.displayName || user.username)) || "Player";
  const guest = !user || user.accountType === "guest";
  root.innerHTML = `
    <section class="welcome">
      <div>
        <p class="big">${guest ? "Welcome, Guest!" : "Welcome back, " + esc(name) + "!"}</p>
        <p class="muted">${guest ? "Jump into a game and have fun." : "Ready to challenge your friends?"}</p>
      </div>
      <div class="actions">
        <button type="button" class="btn" id="ovQuickPlay">Quick Play</button>
        <a class="btn ghost" href="${playUrl()}">Open Game</a>
      </div>
    </section>
    <div class="quick-grid">
      <button type="button" class="quick-card" id="ovCreate"><h3>Create Room</h3><p>ตั้งค่าห้อง แล้วชวนเพื่อนด้วยรหัส 6 หลัก</p></button>
      <button type="button" class="quick-card" id="ovJoin"><h3>Join Room</h3><p>ใส่รหัสห้องเพื่อเข้าเล่นทันที</p></button>
      <button type="button" class="quick-card" id="ovRooms"><h3>Public Rooms</h3><p>ดูห้องสาธารณะที่เปิดรับผู้เล่น</p></button>
    </div>
    <div class="stats-row" id="ovStats">
      <div class="stat"><div class="label">Total Games</div><div class="value skeleton" style="height:28px;width:40%"></div></div>
      <div class="stat"><div class="label">Wins</div><div class="value skeleton" style="height:28px;width:40%"></div></div>
      <div class="stat"><div class="label">Win Rate</div><div class="value skeleton" style="height:28px;width:40%"></div></div>
      <div class="stat"><div class="label">Points</div><div class="value skeleton" style="height:28px;width:40%"></div></div>
    </div>
    <div class="content-grid">
      <div class="card">
        <h2>Recent Activity</h2>
        <div id="ovActivity"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
      </div>
      <div class="panel-right">
        <div class="card">
          <h3>Account</h3>
          <p class="muted">${guest ? "Guest session — upgrade anytime." : "Registered player"}</p>
          <p class="tiny">ID: ${esc(user && user.id)}</p>
          <a class="btn ghost block" style="margin-top:10px" href="/account.html">Manage Account</a>
        </div>
      </div>
    </div>
  `;

  root.querySelector("#ovCreate").onclick = openCreate;
  root.querySelector("#ovJoin").onclick = openJoinFocus;
  root.querySelector("#ovRooms").onclick = () => location.hash = "#rooms";
  root.querySelector("#ovQuickPlay").onclick = async () => {
    const { res, data } = await api("/api/v1/rooms/quick-play", { method: "POST", body: "{}" });
    if (res.ok && data && data.code) {
      location.href = playUrl({ code: data.code });
      return;
    }
    openCreate();
  };

  const summary = await api("/api/v1/dashboard/summary", { method: "GET" });
  const stats = (summary.data && summary.data.stats) || {};
  const games = stats.totalGames || 0;
  const wins = stats.gamesWon || 0;
  const rate = games ? Math.round((wins / games) * 100) : 0;
  root.querySelector("#ovStats").innerHTML = `
    <div class="stat"><div class="label">Total Games</div><div class="value">${games}</div></div>
    <div class="stat"><div class="label">Wins</div><div class="value">${wins}</div></div>
    <div class="stat"><div class="label">Win Rate</div><div class="value">${rate}%</div></div>
    <div class="stat"><div class="label">Points</div><div class="value">${stats.totalPoints || 0}</div></div>
  `;

  const act = await api("/api/v1/dashboard/activity", { method: "GET" });
  const items = (act.data && act.data.items) || [];
  const box = root.querySelector("#ovActivity");
  if (!items.length) {
    box.innerHTML = `<div class="empty">Play your first game to start tracking activity.</div>`;
  } else {
    box.innerHTML = `<ul class="list">${items.map((it) => `
      <li><div class="grow"><b>${esc(it.title)}</b><div class="tiny">${esc(it.subtitle || "")}</div></div>
      <span class="tiny">${esc(it.when || "")}</span></li>`).join("")}</ul>`;
  }
}
