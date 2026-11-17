import { api } from "/js/dashboard/api.js";
import { hasPerm } from "./util.js";

export async function renderSettings(root, { user }) {
  root.innerHTML = `<div class="loading">Loading…</div>`;
  const { res, data } = await api("/api/v1/admin/settings", { method: "GET" });
  if (!res.ok) {
    root.innerHTML = `<div class="empty">โหลดไม่ได้</div>`;
    return;
  }
  const s = data.settings || {};
  const canManage = hasPerm(user, "settings.manage");
  root.innerHTML = `
    <div class="card">
      <h2>System settings</h2>
      <label class="field">
        <span>Maintenance message</span>
        <textarea class="input" id="sMaint" rows="3" ${canManage ? "" : "disabled"}>${String(s.maintenance_message || "")}</textarea>
      </label>
      <label class="field" style="margin-top:12px">
        <span>Max rooms display</span>
        <input class="input" id="sMax" type="number" min="1" max="200" value="${Number(s.max_rooms_display) || 50}" ${canManage ? "" : "disabled"}/>
      </label>
      ${canManage ? `<button type="button" class="btn sm" id="sSave" style="margin-top:14px">Save</button>` : ""}
      <p class="tiny" id="sMsg"></p>
    </div>
  `;
  const save = root.querySelector("#sSave");
  if (save) {
    save.onclick = async () => {
      const settings = {
        maintenance_message: root.querySelector("#sMaint").value,
        max_rooms_display: Number(root.querySelector("#sMax").value) || 50
      };
      const r = await api("/api/v1/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ settings })
      });
      root.querySelector("#sMsg").textContent = r.res.ok ? "บันทึกแล้ว" : "บันทึกไม่สำเร็จ";
    };
  }
}
