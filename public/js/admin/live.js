import { api, playUrl } from "/js/dashboard/api.js";
import { esc, modeLabel, hasPerm, confirmDialog } from "./util.js";

let timer = null;

export async function renderLive(root, { user }) {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  async function paint() {
    const { res, data } = await api("/api/v1/admin/rooms", { method: "GET" });
    if (!res.ok) {
      root.innerHTML = `<div class="empty">โหลด Live ไม่ได้</div>`;
      return;
    }
    const rooms = (data.rooms || []).filter((r) => r.phase !== "over");
    const canClose = hasPerm(user, "rooms.close");
    const canKick = hasPerm(user, "rooms.kick");
    root.innerHTML = `
      <div class="card">
        <div class="row-between">
          <h2 style="margin:0">Live Monitor <span class="tiny">(${rooms.length})</span></h2>
          <button type="button" class="btn ghost sm" id="liveRefresh">Refresh</button>
        </div>
        <div class="table-wrap" style="margin-top:12px">
          <table class="table">
            <thead><tr><th>Code</th><th>Title</th><th>Vis</th><th>Phase</th><th>Players</th><th>Mode</th><th></th></tr></thead>
            <tbody>
              ${
                rooms.length
                  ? rooms
                      .map((r) => {
                        const players = (r.players || [])
                          .map(
                            (p) =>
                              `<span class="chip">${esc(p.name)}${p.host ? " ★" : ""}${
                                canKick
                                  ? ` <button type="button" class="linkish" data-kick="${esc(r.code)}" data-pid="${esc(p.id)}">kick</button>`
                                  : ""
                              }</span>`
                          )
                          .join(" ");
                        return `<tr>
                  <td><code>${esc(r.code)}</code></td>
                  <td>${esc(r.title)}<div class="tiny" style="margin-top:4px">${players || "—"}</div></td>
                  <td>${esc(r.visibility)}</td>
                  <td>${esc(r.phase)}</td>
                  <td>${r.count}/${r.max}</td>
                  <td>${esc(modeLabel(r.cat))}</td>
                  <td class="actions-cell">
                    <a class="btn ghost sm" href="${playUrl({ code: r.code, watch: true })}" target="_blank">Watch</a>
                    ${canClose ? `<button type="button" class="btn danger sm" data-close="${esc(r.code)}">Close</button>` : ""}
                  </td>
                </tr>`;
                      })
                      .join("")
                  : `<tr><td colspan="7" class="empty">ไม่มีห้องออนไลน์</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
    const refresh = root.querySelector("#liveRefresh");
    if (refresh) refresh.onclick = () => paint();
    root.querySelectorAll("[data-close]").forEach((btn) => {
      btn.onclick = async () => {
        if (!(await confirmDialog("ปิดห้อง " + btn.getAttribute("data-close") + "?", { danger: true }))) return;
        await api(`/api/v1/admin/rooms/${encodeURIComponent(btn.getAttribute("data-close"))}/close`, {
          method: "POST",
          body: "{}"
        });
        paint();
      };
    });
    root.querySelectorAll("[data-kick]").forEach((btn) => {
      btn.onclick = async () => {
        const code = btn.getAttribute("data-kick");
        const playerId = btn.getAttribute("data-pid");
        await api(`/api/v1/admin/rooms/${encodeURIComponent(code)}/kick`, {
          method: "POST",
          body: JSON.stringify({ playerId })
        });
        paint();
      };
    });
  }

  await paint();
  timer = setInterval(paint, 4000);
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
}
