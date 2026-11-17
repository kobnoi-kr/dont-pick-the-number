import { api } from "/js/dashboard/api.js";
import { esc, fmtDate, hasPerm } from "./util.js";

const GAMES = [
  {
    id: "secret",
    defaultName: "หาเลข",
    en: "Don't Get The Secret",
    blurb: "เกมทายเลข — ห้ามโดนเลขลับ ใช้ในคลังเกมและตอนสร้างห้อง"
  },
  {
    id: "wheel",
    defaultName: "วงล้อ",
    en: "Number Wheel",
    blurb: "เกมหมุนวงล้อ — ใครโดนเลขตัวเองตกรอบ"
  }
];

function modeLabel(mode) {
  if (mode === "wheel") return "วงล้อ";
  if (mode === "secret") return "หาเลข";
  return mode || "—";
}

function fmtDuration(sec) {
  const n = Number(sec) || 0;
  if (n < 60) return n + " วินาที";
  const m = Math.floor(n / 60);
  const s = n % 60;
  return s ? `${m} นาที ${s} วินาที` : `${m} นาที`;
}

export async function renderGames(root, { user }) {
  root.innerHTML = `<div class="loading">Loading…</div>`;
  const [catRes, histRes] = await Promise.all([
    api("/api/v1/admin/games/catalog", { method: "GET" }),
    api("/api/v1/admin/games/history?limit=40", { method: "GET" })
  ]);
  if (!catRes.res.ok) {
    root.innerHTML = `<div class="empty">โหลดไม่ได้</div>`;
    return;
  }
  const catalog = catRes.data.catalog || {};
  const games = (histRes.data && histRes.data.games) || [];
  const canManage = hasPerm(user, "games.manage");

  root.innerHTML = `
    <div class="card">
      <h2>จัดการเกมในคลัง</h2>
      <p class="muted" style="margin-top:0">
        หน้านี้คุมว่าเกมไหน <b>โชว์ใน Game Library</b> และชื่อที่ผู้เล่นเห็น
        — ไม่ได้สร้างเกมใหม่ แค่เปิด/ปิดและตั้งชื่อแสดงผล
      </p>
      <div class="content-grid" id="gCat" style="margin-top:14px">
        ${GAMES.map((g) => {
          const row = catalog[g.id] || {};
          const name = (row.name && String(row.name).trim()) || g.defaultName;
          const on = row.enabled !== false;
          return `<div class="card nested game-admin-card">
            <div class="row-between" style="align-items:flex-start">
              <div>
                <div class="tiny">รหัสเกม: <code>${esc(g.id)}</code></div>
                <h3 style="margin:4px 0 2px">${esc(g.defaultName)}</h3>
                <div class="tiny">${esc(g.en)}</div>
              </div>
              <label class="switch-row" title="เปิด = โชว์ในคลังเกม">
                <input type="checkbox" data-id="${g.id}" data-field="enabled" ${on ? "checked" : ""} ${canManage ? "" : "disabled"}/>
                <span>${on ? "เปิดในคลัง" : "ปิดจากคลัง"}</span>
              </label>
            </div>
            <p class="tiny" style="margin:10px 0 8px">${esc(g.blurb)}</p>
            <label class="field">
              <span>ชื่อที่แสดงให้ผู้เล่น</span>
              <div class="toolbar" style="margin-top:6px">
                <input class="input" data-id="${g.id}" data-field="name" value="${esc(name)}" ${canManage ? "" : "disabled"} placeholder="${esc(g.defaultName)}"/>
                ${
                  canManage
                    ? `<button type="button" class="btn ghost sm" data-reset="${g.id}">คืนชื่อเดิม</button>`
                    : ""
                }
              </div>
            </label>
          </div>`;
        }).join("")}
      </div>
      ${canManage ? `<button type="button" class="btn sm" id="gSave" style="margin-top:14px">บันทึกการตั้งค่าเกม</button>` : ""}
      <p class="tiny" id="gMsg"></p>
    </div>

    <div style="margin-top:16px">
      <div class="page-head" style="margin-bottom:10px">
        <div>
          <h2 style="margin:0">เกมที่จบแล้วล่าสุด</h2>
          <p class="muted tiny" style="margin:6px 0 0">ประวัติจากห้องที่เล่นจบแล้ว (ดูอย่างเดียว · ลบอัตโนมัติหลัง 7 วัน)</p>
        </div>
      </div>
      ${
        games.length
          ? `<div class="history-card-grid">
            ${games
              .map(
                (g) => `<article class="history-card">
                <div class="room-card-top">
                  <div class="room-card-title">
                    <b>${esc(g.roomName || "ห้องไม่มีชื่อ")}</b>
                    <div class="tiny">รหัส ${esc(g.roomCode)}</div>
                  </div>
                  <span class="history-mode">${esc(modeLabel(g.gameMode))}</span>
                </div>
                <div class="room-card-meta">
                  <span><em>ผู้เล่น</em> ${g.playerCount} คน</span>
                  <span><em>นาน</em> ${esc(fmtDuration(g.durationSec))}</span>
                  <span><em>จบเมื่อ</em> ${esc(fmtDate(g.endedAt))}</span>
                </div>
              </article>`
              )
              .join("")}
          </div>`
          : `<div class="card empty">ยังไม่มีประวัติเกมที่จบ</div>`
      }
    </div>
  `;

  root.querySelectorAll("[data-field='enabled']").forEach((box) => {
    box.onchange = () => {
      const label = box.parentElement && box.parentElement.querySelector("span");
      if (label) label.textContent = box.checked ? "เปิดในคลัง" : "ปิดจากคลัง";
    };
  });

  root.querySelectorAll("[data-reset]").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute("data-reset");
      const g = GAMES.find((x) => x.id === id);
      const input = root.querySelector(`input[data-id="${id}"][data-field="name"]`);
      if (g && input) input.value = g.defaultName;
    };
  });

  const save = root.querySelector("#gSave");
  if (save) {
    save.onclick = async () => {
      const next = {};
      for (const g of GAMES) {
        const en = root.querySelector(`input[data-id="${g.id}"][data-field="enabled"]`);
        const nameEl = root.querySelector(`input[data-id="${g.id}"][data-field="name"]`);
        const name = ((nameEl && nameEl.value) || "").trim() || g.defaultName;
        next[g.id] = { enabled: !!(en && en.checked), name };
      }
      const r = await api("/api/v1/admin/games/catalog", {
        method: "PATCH",
        body: JSON.stringify({ catalog: next })
      });
      root.querySelector("#gMsg").textContent = r.res.ok
        ? "บันทึกแล้ว — ผู้เล่นจะเห็นตามนี้ในคลังเกม"
        : "บันทึกไม่สำเร็จ";
      if (r.res.ok) renderGames(root, { user });
    };
  }
}
