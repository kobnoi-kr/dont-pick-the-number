import { api } from "/js/dashboard/api.js";
import { esc, fmtDate, modeLabel, hasPerm } from "./util.js";

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
      <h2>Game catalog</h2>
      <div class="content-grid" id="gCat">
        ${["secret", "wheel"]
          .map((id) => {
            const row = catalog[id] || { enabled: true, name: id === "wheel" ? "วงล้อ" : "หาเลข" };
            return `<div class="card nested">
              <label class="row-between">
                <b>${esc(row.name || id)}</b>
                <span><input type="checkbox" data-id="${id}" data-field="enabled" ${row.enabled !== false ? "checked" : ""} ${canManage ? "" : "disabled"}/> Enabled</span>
              </label>
              <input class="input" style="margin-top:8px" data-id="${id}" data-field="name" value="${esc(row.name || "")}" ${canManage ? "" : "disabled"}/>
              <div class="tiny" style="margin-top:6px">id: ${esc(id)}</div>
            </div>`;
          })
          .join("")}
      </div>
      ${canManage ? `<button type="button" class="btn sm" id="gSave" style="margin-top:12px">Save catalog</button>` : ""}
      <p class="tiny" id="gMsg"></p>
    </div>
    <div class="card" style="margin-top:16px">
      <h2>Finished games</h2>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Room</th><th>Mode</th><th>Players</th><th>Ended</th><th>Duration</th></tr></thead>
          <tbody>
            ${
              games.length
                ? games
                    .map(
                      (g) => `<tr>
                <td><b>${esc(g.roomName)}</b><div class="tiny">${esc(g.roomCode)}</div></td>
                <td>${esc(modeLabel(g.gameMode))}</td>
                <td>${g.playerCount}</td>
                <td class="tiny">${esc(fmtDate(g.endedAt))}</td>
                <td>${g.durationSec || 0}s</td>
              </tr>`
                    )
                    .join("")
                : `<tr><td colspan="5" class="empty">ยังไม่มีประวัติ</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  `;

  const save = root.querySelector("#gSave");
  if (save) {
    save.onclick = async () => {
      const next = {};
      for (const id of ["secret", "wheel"]) {
        const en = root.querySelector(`input[data-id="${id}"][data-field="enabled"]`);
        const name = root.querySelector(`input[data-id="${id}"][data-field="name"]`);
        next[id] = { enabled: !!(en && en.checked), name: (name && name.value) || id };
      }
      const r = await api("/api/v1/admin/games/catalog", {
        method: "PATCH",
        body: JSON.stringify({ catalog: next })
      });
      root.querySelector("#gMsg").textContent = r.res.ok ? "บันทึกแล้ว" : "บันทึกไม่สำเร็จ";
    };
  }
}
