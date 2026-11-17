import { api } from "/js/dashboard/api.js";
import { esc, fmtDate, modeLabel } from "./util.js";

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
