import { api } from "/js/dashboard/api.js";
import { esc } from "./util.js";

function mb(n) {
  return Math.round((Number(n) || 0) / 1024 / 1024);
}

export async function renderSystem(root, { user }) {
  root.innerHTML = `<div class="loading">Loading…</div>`;
  const { res, data } = await api("/api/v1/admin/system", { method: "GET" });
  if (!res.ok) {
    root.innerHTML = `<div class="empty">โหลดไม่ได้</div>`;
    return;
  }
  const isSuper = (user.roles || []).includes("super_admin");
  const rooms = data.rooms || {};
  root.innerHTML = `
    <div class="stats-row">
      <div class="stat"><div class="label">Uptime</div><div class="value">${Math.floor((data.uptimeSec || 0) / 60)}m</div></div>
      <div class="stat"><div class="label">Node</div><div class="value" style="font-size:1rem">${esc(data.node)}</div></div>
      <div class="stat"><div class="label">Heap</div><div class="value">${mb(data.memory && data.memory.heapUsed)} MB</div></div>
      <div class="stat"><div class="label">Rooms</div><div class="value">${rooms.rooms || 0}</div><div class="tiny">${rooms.players || 0} players</div></div>
    </div>
    <div class="card" style="margin-top:16px">
      <h2>Danger zone</h2>
      <p class="muted">ลบ session ที่หมดอายุหรือถูก revoke แล้ว</p>
      <button type="button" class="btn danger sm" id="sysClear" ${isSuper ? "" : "disabled"}>Clear expired sessions</button>
      <p class="tiny" id="sysMsg">${isSuper ? "" : "ต้องเป็น super_admin"}</p>
    </div>
  `;
  const btn = root.querySelector("#sysClear");
  if (btn && isSuper) {
    btn.onclick = async () => {
      if (!confirm("ลบ expired/revoked sessions?")) return;
      const r = await api("/api/v1/admin/system/clear-sessions", { method: "POST", body: "{}" });
      root.querySelector("#sysMsg").textContent = r.res.ok
        ? `ลบแล้ว ${r.data.deleted || 0} รายการ`
        : "ล้มเหลว";
    };
  }
}
