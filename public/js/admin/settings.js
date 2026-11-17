import { api } from "/js/dashboard/api.js";
import { esc, hasPerm } from "./util.js";

function isMaintOn(s) {
  const msg = String(s.maintenance_message || "").trim();
  if (Object.prototype.hasOwnProperty.call(s, "maintenance_enabled")) {
    const v = s.maintenance_enabled;
    const on = v === true || v === "true" || v === 1 || v === "1";
    return on && !!msg;
  }
  return !!msg;
}

export async function renderSettings(root, { user }) {
  async function load() {
    root.innerHTML = `<div class="loading">Loading…</div>`;
    const { res, data } = await api("/api/v1/admin/settings", { method: "GET" });
    if (!res.ok) {
      root.innerHTML = `<div class="empty">โหลดไม่ได้</div>`;
      return;
    }
    const s = data.settings || {};
    const canManage = hasPerm(user, "settings.manage");
    const msg = String(s.maintenance_message || "");
    const enabled = isMaintOn(s);

    root.innerHTML = `
      <div class="card">
        <h2>สถานะเซิร์ฟเวอร์</h2>
        <div class="row-between" style="align-items:center;gap:12px;flex-wrap:wrap;margin-top:4px">
          <div>
            <div class="status-pill ${enabled ? "warn" : "ok"}" style="font-size:0.95rem;padding:6px 12px">
              ${enabled ? "ปิดปรับปรุงอยู่" : "เซิร์ฟเปิดปกติ"}
            </div>
            <p class="tiny" style="margin:8px 0 0">
              ${
                enabled
                  ? "ผู้เล่นทั่วไปเข้าเล่นไม่ได้ — กดปุ่มเขียวเพื่อเปิดเซิร์ฟกลับ"
                  : "ผู้เล่นเข้าเล่นได้ตามปกติ — กดปุ่มส้มเพื่อปิดปรับปรุง"
              }
            </p>
          </div>
          ${
            canManage
              ? enabled
                ? `<button type="button" class="btn sm" id="sOpenServer" style="background:#16a34a;border-color:#16a34a">เปิดเซิร์ฟ</button>`
                : `<button type="button" class="btn sm" id="sCloseServer" style="background:#d97706;border-color:#d97706">ปิดเซิร์ฟ (Maintenance)</button>`
              : ""
          }
        </div>
        <p class="tiny" id="sToggleMsg" style="margin-top:10px"></p>
      </div>

      <div class="card" style="margin-top:16px">
        <h2>ข้อความปิดปรับปรุง</h2>
        <p class="muted" style="margin-top:0">ข้อความนี้จะโชว์ให้ผู้เล่นตอนเซิร์ฟปิด</p>
        <textarea class="input" id="sMaint" rows="3" ${canManage ? "" : "disabled"} placeholder="เช่น ระบบปิดปรับปรุงถึง 18:00">${esc(msg)}</textarea>
        ${canManage ? `<button type="button" class="btn ghost sm" id="sSaveMsg" style="margin-top:10px">บันทึกข้อความ</button>` : ""}
        <p class="tiny" id="sMsgMsg"></p>
      </div>

      <div class="card" style="margin-top:16px">
        <h2>Max rooms display</h2>
        <p class="muted" style="margin-top:0">จำนวนห้องสูงสุดที่โชว์ในลิสต์ล็อบบี้</p>
        <input class="input" id="sMax" type="number" min="1" max="200" value="${Number(s.max_rooms_display) || 50}" ${canManage ? "" : "disabled"}/>
        ${canManage ? `<button type="button" class="btn ghost sm" id="sSaveMax" style="margin-top:10px">บันทึก</button>` : ""}
        <p class="tiny" id="sMsgMax"></p>
      </div>
    `;

    async function patchSettings(settings, msgEl) {
      if (msgEl) msgEl.textContent = "กำลังบันทึก…";
      const r = await api("/api/v1/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ settings })
      });
      return r;
    }

    const openBtn = root.querySelector("#sOpenServer");
    if (openBtn) {
      openBtn.onclick = async () => {
        openBtn.disabled = true;
        const r = await patchSettings(
          { maintenance_enabled: false },
          root.querySelector("#sToggleMsg")
        );
        if (!r.res.ok) {
          root.querySelector("#sToggleMsg").textContent = "เปิดเซิร์ฟไม่สำเร็จ";
          openBtn.disabled = false;
          return;
        }
        root.querySelector("#sToggleMsg").textContent = "เปิดเซิร์ฟแล้ว — ผู้เล่นเข้าได้ตามปกติ";
        await load();
      };
    }

    const closeBtn = root.querySelector("#sCloseServer");
    if (closeBtn) {
      closeBtn.onclick = async () => {
        const message = root.querySelector("#sMaint").value.trim() || "ระบบปิดปรับปรุงชั่วคราว กรุณากลับมาใหม่ภายหลัง";
        closeBtn.disabled = true;
        const r = await patchSettings(
          { maintenance_enabled: true, maintenance_message: message },
          root.querySelector("#sToggleMsg")
        );
        if (!r.res.ok) {
          root.querySelector("#sToggleMsg").textContent = "ปิดเซิร์ฟไม่สำเร็จ";
          closeBtn.disabled = false;
          return;
        }
        root.querySelector("#sToggleMsg").textContent = "ปิดเซิร์ฟแล้ว — ผู้เล่นจะเห็นหน้าปิดปรับปรุง";
        await load();
      };
    }

    const saveMsg = root.querySelector("#sSaveMsg");
    if (saveMsg) {
      saveMsg.onclick = async () => {
        const message = root.querySelector("#sMaint").value.trim();
        const r = await patchSettings(
          { maintenance_message: message },
          root.querySelector("#sMsgMsg")
        );
        root.querySelector("#sMsgMsg").textContent = r.res.ok ? "บันทึกข้อความแล้ว" : "บันทึกไม่สำเร็จ";
      };
    }

    const saveMax = root.querySelector("#sSaveMax");
    if (saveMax) {
      saveMax.onclick = async () => {
        const r = await patchSettings(
          { max_rooms_display: Number(root.querySelector("#sMax").value) || 50 },
          root.querySelector("#sMsgMax")
        );
        root.querySelector("#sMsgMax").textContent = r.res.ok ? "บันทึกแล้ว" : "บันทึกไม่สำเร็จ";
      };
    }
  }

  await load();
}
