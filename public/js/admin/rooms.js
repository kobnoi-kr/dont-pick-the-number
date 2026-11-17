import { api, playUrl } from "/js/dashboard/api.js";
import { esc, modeLabel, hasPerm } from "./util.js";

export async function renderRooms(root, { user }) {
  root.innerHTML = `<div class="loading">Loading rooms…</div>`;
  const { res, data } = await api("/api/v1/admin/rooms", { method: "GET" });
  if (!res.ok) {
    root.innerHTML = `<div class="empty">โหลดไม่ได้</div>`;
    return;
  }
  const rooms = data.rooms || [];
  const canClose = hasPerm(user, "rooms.close");
  root.innerHTML = `
    <div class="card">
      <div class="row-between">
        <h2 style="margin:0">Room Management <span class="tiny">(${rooms.length})</span></h2>
        <button type="button" class="btn ghost sm" id="rRefresh">Refresh</button>
      </div>
      <div class="table-wrap" style="margin-top:12px">
        <table class="table">
          <thead><tr><th>Code</th><th>Title</th><th>Host</th><th>Vis</th><th>Phase</th><th>Players</th><th>Mode</th><th></th></tr></thead>
          <tbody>
            ${
              rooms.length
                ? rooms
                    .map(
                      (r) => `<tr>
                <td><code>${esc(r.code)}</code></td>
                <td>${esc(r.title)}</td>
                <td>${esc(r.host)}</td>
                <td>${esc(r.visibility)}</td>
                <td>${esc(r.phase)}</td>
                <td>${r.count}/${r.max}</td>
                <td>${esc(modeLabel(r.cat))}</td>
                <td class="actions-cell">
                  <a class="btn ghost sm" href="${playUrl({ code: r.code, watch: true })}" target="_blank">Watch</a>
                  ${canClose ? `<button type="button" class="btn danger sm" data-close="${esc(r.code)}">Close</button>` : ""}
                </td>
              </tr>`
                    )
                    .join("")
                : `<tr><td colspan="8" class="empty">ไม่มีห้อง</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
  root.querySelector("#rRefresh").onclick = () => renderRooms(root, { user });
  root.querySelectorAll("[data-close]").forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm("ปิดห้อง " + btn.getAttribute("data-close") + "?")) return;
      await api(`/api/v1/admin/rooms/${encodeURIComponent(btn.getAttribute("data-close"))}/close`, {
        method: "POST",
        body: "{}"
      });
      renderRooms(root, { user });
    };
  });
}
