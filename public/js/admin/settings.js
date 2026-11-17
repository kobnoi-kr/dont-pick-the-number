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
  const msg = String(s.maintenance_message || "");
  const enabled =
    s.maintenance_enabled === true ||
    s.maintenance_enabled === "true" ||
    (!Object.prototype.hasOwnProperty.call(s, "maintenance_enabled") && !!msg.trim());

  root.innerHTML = `
    <div class="card">
      <h2>System settings</h2>
      <p class="muted" style="margin-top:0">
        เปิดโหมดปิดปรับปรุงแล้ว ผู้เล่นทั่วไปจะเห็นหน้าต่างนี้และสร้าง/เข้าห้องไม่ได้ — แอดมินยังเข้าได้ตามปกติ
      </p>
      <label style="display:flex;gap:8px;align-items:center;margin-top:8px">
        <input type="checkbox" id="sMaintOn" ${enabled ? "checked" : ""} ${canManage ? "" : "disabled"}/>
        <span>เปิดโหมดปิดปรับปรุง (Maintenance)</span>
      </label>
      <label class="field" style="margin-top:12px">
        <span>ข้อความที่แสดงให้ผู้เล่น</span>
        <textarea class="input" id="sMaint" rows="3" ${canManage ? "" : "disabled"} placeholder="เช่น ระบบปิดปรับปรุงถึง 18:00">${msg}</textarea>
      </label>
      <label class="field" style="margin-top:12px">
        <span>Max rooms display — จำนวนห้องสูงสุดที่โชว์ในลิสต์ล็อบบี้</span>
        <input class="input" id="sMax" type="number" min="1" max="200" value="${Number(s.max_rooms_display) || 50}" ${canManage ? "" : "disabled"}/>
      </label>
      ${canManage ? `<button type="button" class="btn sm" id="sSave" style="margin-top:14px">Save</button>` : ""}
      <p class="tiny" id="sMsg"></p>
    </div>
  `;
  const save = root.querySelector("#sSave");
  if (save) {
    save.onclick = async () => {
      const on = root.querySelector("#sMaintOn").checked;
      const message = root.querySelector("#sMaint").value.trim();
      if (on && !message) {
        root.querySelector("#sMsg").textContent = "เปิด Maintenance ต้องใส่ข้อความด้วย";
        return;
      }
      const settings = {
        maintenance_enabled: on,
        maintenance_message: message,
        max_rooms_display: Number(root.querySelector("#sMax").value) || 50
      };
      root.querySelector("#sMsg").textContent = "กำลังบันทึก…";
      const r = await api("/api/v1/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ settings })
      });
      root.querySelector("#sMsg").textContent = r.res.ok
        ? on
          ? "บันทึกแล้ว — ผู้เล่นจะเห็นหน้าปิดปรับปรุง"
          : "บันทึกแล้ว — เปิดเว็บปกติ"
        : "บันทึกไม่สำเร็จ";
    };
  }
}
