import { api } from "/js/dashboard/api.js";
import { esc, modeLabel } from "./util.js";

export async function renderAnalytics(root) {
  root.innerHTML = `<div class="loading">Loading analytics…</div>`;
  const { res, data } = await api("/api/v1/admin/analytics?range=14", { method: "GET" });
  if (!res.ok) {
    root.innerHTML = `<div class="empty">โหลด Analytics ไม่ได้</div>`;
    return;
  }
  const series = data.series || [];
  const maxG = Math.max(1, ...series.map((s) => s.games));
  const mix = data.modeMix || {};
  root.innerHTML = `
    <div class="stats-row">
      <div class="stat"><div class="label">Games (${data.range}d)</div><div class="value">${(data.totals && data.totals.games) || 0}</div></div>
      <div class="stat"><div class="label">New users</div><div class="value">${(data.totals && data.totals.newUsers) || 0}</div></div>
    </div>
    <div class="card" style="margin-top:16px">
      <h2>Games / day</h2>
      <div class="bar-chart">
        ${series
          .map(
            (s) => `<div class="bar-col" title="${esc(s.date)}: ${s.games} games">
            <div class="bar" style="height:${Math.round((s.games / maxG) * 100)}%"></div>
            <div class="bar-label">${esc(s.date.slice(5))}</div>
          </div>`
          )
          .join("")}
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h2>Mode mix</h2>
      <div class="stats-row">
        ${
          Object.keys(mix).length
            ? Object.entries(mix)
                .map(
                  ([k, v]) =>
                    `<div class="stat"><div class="label">${esc(modeLabel(k))}</div><div class="value">${v}</div></div>`
                )
                .join("")
            : `<div class="empty">ยังไม่มีข้อมูล</div>`
        }
      </div>
    </div>
  `;
}
