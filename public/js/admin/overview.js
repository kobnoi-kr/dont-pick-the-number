import { api } from "/js/dashboard/api.js";
import { esc, fmtDate, modeLabel } from "./util.js";

function dbMeterHtml(db) {
  if (!db) {
    return `<div class="card db-meter"><h2>Database</h2><p class="empty">ไม่มีข้อมูล</p></div>`;
  }
  if (db.ok === false) {
    return `<div class="card db-meter"><h2>Database</h2><p class="empty">อ่านขนาด DB ไม่ได้ · ${esc(db.error || "")}</p></div>`;
  }
  const pct = Math.max(0, Math.min(100, Number(db.pct) || 0));
  const level = db.level || "ok";
  const tables = Array.isArray(db.tables) ? db.tables : [];
  const maxT = tables.reduce((m, t) => Math.max(m, Number(t.bytes) || 0), 0) || 1;
  return `
    <div class="card db-meter">
      <div class="db-meter-head">
        <h2>Database storage</h2>
        <span class="db-meter-badge level-${esc(level)}">${esc(db.usedPretty || "—")} / ${esc(db.limitPretty || "—")}</span>
      </div>
      <div class="db-meter-track" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Database usage">
        <div class="db-meter-fill level-${esc(level)}" style="width:${pct}%"></div>
      </div>
      <div class="db-meter-meta">
        <span>${pct}% ของขีดจำกัด</span>
        <span class="tiny">${level === "critical" ? "ใกล้เต็ม — ควร cleanup / ลด retention" : level === "warn" ? "เริ่มสูงขึ้น" : "ปกติ"}</span>
      </div>
      ${
        tables.length
          ? `<div class="db-table-bars">
              ${tables
                .map((t) => {
                  const w = Math.max(2, Math.round(((Number(t.bytes) || 0) / maxT) * 100));
                  return `<div class="db-table-row">
                    <code class="db-table-name">${esc(t.name)}</code>
                    <div class="db-table-track"><div class="db-table-fill" style="width:${w}%"></div></div>
                    <span class="db-table-size tiny">${esc(t.pretty)}</span>
                  </div>`;
                })
                .join("")}
            </div>`
          : ""
      }
    </div>
  `;
}

export async function renderOverview(root) {
  root.innerHTML = `<div class="loading">Loading overview…</div>`;
  const { res, data } = await api("/api/v1/admin/overview", { method: "GET" });
  if (!res.ok) {
    root.innerHTML = `<div class="empty">โหลด Overview ไม่ได้</div>`;
    return;
  }
  const k = data.kpis || {};
  const rooms = data.liveRooms || [];
  const logs = data.recentLogs || [];
  root.innerHTML = `
    <div class="stats-row">
      <div class="stat"><div class="label">Users</div><div class="value">${k.usersTotal || 0}</div><div class="tiny">${k.usersActive || 0} active</div></div>
      <div class="stat"><div class="label">Sessions</div><div class="value">${k.sessionsActive || 0}</div></div>
      <div class="stat"><div class="label">Live rooms</div><div class="value">${k.liveRooms || 0}</div><div class="tiny">${k.livePlayers || 0} players</div></div>
      <div class="stat"><div class="label">Games today</div><div class="value">${k.gamesToday || 0}</div></div>
    </div>
    ${dbMeterHtml(data.db)}
    <div class="content-grid">
      <div class="card">
        <h2>Live rooms</h2>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Code</th><th>Title</th><th>Phase</th><th>Players</th><th>Mode</th></tr></thead>
            <tbody>
              ${
                rooms.length
                  ? rooms
                      .map(
                        (r) => `<tr>
                  <td><code>${esc(r.code)}</code></td>
                  <td>${esc(r.title)}</td>
                  <td>${esc(r.phase)}</td>
                  <td>${r.count}/${r.max}</td>
                  <td>${esc(modeLabel(r.cat))}</td>
                </tr>`
                      )
                      .join("")
                  : `<tr><td colspan="5" class="empty">ไม่มีห้อง</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <h2>Recent admin actions</h2>
        <ul class="list">
          ${
            logs.length
              ? logs
                  .map(
                    (l) => `<li>
                <b>${esc(l.action)}</b>
                <div class="tiny">${esc((l.admin && (l.admin.displayName || l.admin.username)) || "—")} · ${esc(fmtDate(l.createdAt))}</div>
              </li>`
                  )
                  .join("")
              : `<li class="empty">ยังไม่มี log</li>`
          }
        </ul>
      </div>
    </div>
  `;
}
