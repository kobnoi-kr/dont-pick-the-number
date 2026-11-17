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
    <div class="stats-row" id="ovStats">
      <div class="stat"><div class="label">เกมที่เล่น</div><div class="value skeleton" style="height:28px;width:40%"></div></div>
      <div class="stat"><div class="label">ชั่วโมงเล่น</div><div class="value skeleton" style="height:28px;width:40%"></div></div>
      <div class="stat"><div class="label">ห้องที่สร้าง</div><div class="value skeleton" style="height:28px;width:40%"></div></div>
      <div class="stat"><div class="label">แต้มรวม</div><div class="value skeleton" style="height:28px;width:40%"></div></div>
    </div>
    <div class="card" style="margin-bottom:18px">
      <div class="row-between" style="align-items:center;gap:10px;flex-wrap:wrap">
        <div>
          <h2 style="margin:0">Top Weekly</h2>
          <p class="muted tiny" style="margin:4px 0 0">Top 1–3 สัปดาห์นี้ (จันทร์–อาทิตย์ เวลาไทย)</p>
        </div>
        <a class="btn ghost sm" href="#ranking">ดูทั้งหมด</a>
      </div>
      <div class="rank-cooldown" id="ovRankCd" style="margin-top:12px">
        <span class="rank-cooldown-label">รีเซ็ต Weekly ใน (จันทร์ 00:00 เวลาไทย)</span>
        <b class="rank-cooldown-time" id="ovRankCdTime">—:—:—</b>
      </div>
      <div id="ovTopRank" style="margin-top:12px"><div class="loading">Loading…</div></div>
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

  const summary = await api("/api/v1/dashboard/summary", { method: "GET" });
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

  const topBox = root.querySelector("#ovTopRank");
  const cdTimeEl = root.querySelector("#ovRankCdTime");
  const cdWrap = root.querySelector("#ovRankCd");

  function formatCountdown(ms) {
    if (ms <= 0) return "รีเซ็ตแล้ว";
    const total = Math.floor(ms / 1000);
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (d > 0) return `${d}วัน ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function ovAvatar(row) {
    if (row && row.avatarUrl) {
      return `<img class="rank-av lg" src="${esc(row.avatarUrl)}" alt="" referrerpolicy="no-referrer">`;
    }
    const ch = ((row && row.displayName) || "?").slice(0, 1).toUpperCase();
    return `<div class="rank-av lg ph">${esc(ch)}</div>`;
  }

  function ovPodiumSlot(row, place) {
    const placeClass = place === 1 ? "gold" : place === 2 ? "silver" : "bronze";
    if (!row) {
      return `<div class="podium-slot ${placeClass} empty">
        <div class="podium-medal">#${place}</div>
        <div class="rank-av lg ph">?</div>
        <div class="podium-name">—</div>
        <div class="podium-score">ยังว่าง</div>
      </div>`;
    }
    return `<div class="podium-slot ${placeClass}">
      <div class="podium-medal">#${place}</div>
      ${ovAvatar(row)}
      <div class="podium-name">${esc(row.displayName || "ผู้เล่น")}</div>
      <div class="podium-score"><b>${row.totalPoints || 0}</b> แต้ม</div>
      <div class="podium-sub">${row.gamesWon || 0} ชนะ · ${row.totalGames || 0} เกม</div>
    </div>`;
  }

  if (topBox) {
    if (guest) {
      if (cdWrap) cdWrap.classList.add("hidden");
      topBox.innerHTML = `<div class="empty">เข้าสู่ระบบเพื่อดู Ranking</div>`;
    } else {
      const lb = await api("/api/v1/leaderboard/weekly?sort=points&limit=3", { method: "GET" });
      const rows = (lb.data && lb.data.rows) || [];
      if (lb.data && lb.data.resetsAt && cdTimeEl) {
        const resetsAtMs = new Date(lb.data.resetsAt).getTime();
        const tick = () => {
          cdTimeEl.textContent = formatCountdown(resetsAtMs - Date.now());
        };
        tick();
        const t = setInterval(tick, 1000);
        const onLeave = () => {
          clearInterval(t);
          window.removeEventListener("hashchange", onLeave);
        };
        window.addEventListener("hashchange", onLeave);
      }
      if (!lb.res.ok) {
        topBox.innerHTML = `<div class="empty">โหลด Top ไม่ได้</div>`;
      } else if (!rows.length) {
        topBox.innerHTML = `<div class="empty">ยังไม่มี Top 3 สัปดาห์นี้</div>`;
      } else {
        const top1 = rows.find((r) => r.rank === 1) || rows[0] || null;
        const top2 = rows.find((r) => r.rank === 2) || rows[1] || null;
        const top3 = rows.find((r) => r.rank === 3) || rows[2] || null;
        topBox.innerHTML = `<div class="podium" aria-label="Top 3 Weekly">
          ${ovPodiumSlot(top2, 2)}
          ${ovPodiumSlot(top1, 1)}
          ${ovPodiumSlot(top3, 3)}
        </div>`;
      }
    }
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
