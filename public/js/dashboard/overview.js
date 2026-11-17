import { api, playUrl } from "./api.js";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function modeLabel(mode) {
  return mode === "wheel" ? "วงล้อ" : "หาเลข";
}

export async function renderOverview(root, { user, openCreate, openRooms }) {
  const name = (user && (user.displayName || user.username)) || "Player";
  const guest = !user || user.accountType === "guest";
  root.innerHTML = `
    <section class="welcome">
      <div>
        <p class="big">${guest ? "ยินดีต้อนรับ!" : "สวัสดี, " + esc(name)}</p>
        <p class="muted">${guest ? "เริ่มเล่นได้เลย หรือผูกบัญชีเพื่อเก็บสถิติ" : "พร้อมท้าเพื่อนอีกเกมไหม?"}</p>
      </div>
      <div class="actions">
        <button type="button" class="btn" id="ovStart">ไปที่ห้องของฉัน</button>
        <button type="button" class="btn ghost" id="ovLibrary">คลังเกม</button>
      </div>
    </section>
    <div id="ovAnnounce" class="hidden"></div>
    <div class="stats-row" id="ovStats">
      <div class="stat"><div class="label">เกมที่เล่น</div><div class="value skeleton" style="height:28px;width:40%"></div></div>
      <div class="stat"><div class="label">ชั่วโมงเล่น</div><div class="value skeleton" style="height:28px;width:40%"></div></div>
      <div class="stat"><div class="label">ห้องที่สร้าง</div><div class="value skeleton" style="height:28px;width:40%"></div></div>
      <div class="stat"><div class="label">แต้มรวม</div><div class="value skeleton" style="height:28px;width:40%"></div></div>
    </div>
    <div class="content-grid">
      <div class="card">
        <h2>เกมที่เล่นล่าสุด</h2>
        <div id="ovLast"><div class="loading">Loading…</div></div>
      </div>
      <div class="card">
        <h2>ประวัติล่าสุด</h2>
        <div id="ovActivity"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
      </div>
    </div>
  `;

  root.querySelector("#ovStart").onclick = () => {
    if (openRooms) openRooms();
    else location.hash = "#rooms";
  };
  root.querySelector("#ovLibrary").onclick = () => {
    location.hash = "#library";
  };

  const [summary, announceRes] = await Promise.all([
    api("/api/v1/dashboard/summary", { method: "GET" }),
    api("/api/v1/announcements/active", { method: "GET" })
  ]);
  const announces = (announceRes.data && announceRes.data.announcements) || [];
  const annBox = root.querySelector("#ovAnnounce");
  if (annBox && announces.length) {
    annBox.classList.remove("hidden");
    annBox.innerHTML = announces
      .map(
        (a) => `<div class="announce-banner">
        <b>${esc(a.title)}</b>
        <div class="tiny">${esc(a.body)}</div>
      </div>`
      )
      .join("");
  }
  const stats = (summary.data && summary.data.stats) || {};
  const lastGame = summary.data && summary.data.lastGame;
  root.querySelector("#ovStats").innerHTML = `
    <div class="stat"><div class="label">เกมที่เล่น</div><div class="value">${stats.totalGames || 0}</div></div>
    <div class="stat"><div class="label">ชั่วโมงเล่น</div><div class="value">${stats.playHours != null ? stats.playHours : Math.round(((stats.playTimeSec || 0) / 3600) * 10) / 10}</div></div>
    <div class="stat"><div class="label">ห้องที่สร้าง</div><div class="value">${stats.roomsCreated || 0}</div></div>
    <div class="stat"><div class="label">แต้มรวม</div><div class="value">${stats.totalPoints || 0}</div></div>
  `;

  const lastBox = root.querySelector("#ovLast");
  if (!lastGame) {
    lastBox.innerHTML = `<div class="empty">ยังไม่มีเกมล่าสุด <button class="btn sm" id="ovCreateFirst" style="margin-top:10px">สร้างห้อง</button></div>`;
    const b = lastBox.querySelector("#ovCreateFirst");
    if (b) b.onclick = () => openCreate && openCreate();
  } else {
    lastBox.innerHTML = `
      <div class="list">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
          <div>
            <b>${esc(lastGame.roomName || "Room")}</b>
            <div class="tiny">${esc(modeLabel(lastGame.gameMode))} · ${lastGame.won ? "ชนะ" : "เล่น"} · ${lastGame.points || 0} pts</div>
          </div>
          <span class="tiny">${lastGame.endedAt ? esc(new Date(lastGame.endedAt).toLocaleString()) : ""}</span>
        </div>
      </div>
      <div style="margin-top:12px">
        <button type="button" class="btn sm" id="ovPlayAgain">เล่นเกมนี้อีก</button>
      </div>`;
    lastBox.querySelector("#ovPlayAgain").onclick = () =>
      openCreate && openCreate({ cat: lastGame.gameMode === "wheel" ? "wheel" : "secret" });
  }

  const act = await api("/api/v1/dashboard/activity", { method: "GET" });
  const items = (act.data && act.data.items) || [];
  const box = root.querySelector("#ovActivity");
  if (!items.length) {
    box.innerHTML = `<div class="empty">ประวัติจะโชว์หลังจบเกมแรก</div>`;
  } else {
    box.innerHTML = `<ul class="list">${items
      .map(
        (it) => `
      <li><div class="grow"><b>${esc(it.title)}</b><div class="tiny">${esc(it.subtitle || "")}</div></div>
      <span class="tiny">${esc(it.when || "")}</span></li>`
      )
      .join("")}</ul>`;
  }
}
