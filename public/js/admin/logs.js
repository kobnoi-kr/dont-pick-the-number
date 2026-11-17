import { api } from "/js/dashboard/api.js";
import { esc, fmtDate } from "./util.js";

export async function renderLogs(root) {
  root.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <input class="input" id="lAction" placeholder="กรอง action เช่น user.ban" />
        <button type="button" class="btn sm" id="lSearch">ค้นหา</button>
      </div>
      <div id="lList" class="loading" style="margin-top:12px">Loading…</div>
    </div>
  `;

  async function load() {
    const action = root.querySelector("#lAction").value.trim();
    const params = new URLSearchParams({ limit: "80" });
    if (action) params.set("action", action);
    const box = root.querySelector("#lList");
    box.innerHTML = `<div class="loading">Loading…</div>`;
    const { res, data } = await api("/api/v1/admin/logs?" + params.toString(), { method: "GET" });
    if (!res.ok) {
      box.innerHTML = `<div class="empty">โหลดไม่ได้</div>`;
      return;
    }
    const logs = data.logs || [];
    box.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th><th>Meta</th></tr></thead>
          <tbody>
            ${
              logs.length
                ? logs
                    .map(
                      (l) => `<tr>
                <td class="tiny">${esc(fmtDate(l.createdAt))}</td>
                <td>${esc((l.admin && (l.admin.displayName || l.admin.username)) || "—")}</td>
                <td><code>${esc(l.action)}</code></td>
                <td class="tiny">${esc(l.targetId || "—")}</td>
                <td class="tiny">${esc(l.metadata ? JSON.stringify(l.metadata) : "—")}</td>
              </tr>`
                    )
                    .join("")
                : `<tr><td colspan="5" class="empty">ไม่มี log</td></tr>`
            }
          </tbody>
        </table>
      </div>`;
  }

  root.querySelector("#lSearch").onclick = load;
  await load();
}
