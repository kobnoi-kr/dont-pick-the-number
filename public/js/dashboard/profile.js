import { api } from "./api.js";
import { logout } from "./shell.js";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function isElevatedAdmin(user) {
  const roles = (user && user.roles) || [];
  return roles.includes("admin") || roles.includes("super_admin");
}

export async function renderProfile(root, { user, onSaved }) {
  const u = user || {};
  const settingsRes = await api("/api/v1/settings", { method: "GET" });
  const s = (settingsRes.data && settingsRes.data.settings) || {
    language: "th",
    theme: "dark",
    preferences: {}
  };
  const pref = s.preferences || {};
  const providers = await api("/api/v1/account/providers", { method: "GET" });
  const linked = ((providers.data && providers.data.providers) || []).map((p) => p.provider);

  root.innerHTML = `
    <div class="content-grid">
      <div class="card">
        <h2>โปรไฟล์</h2>
        <div style="display:flex;gap:14px;align-items:center;margin:12px 0">
          ${
            u.avatarUrl
              ? `<img src="${esc(u.avatarUrl)}" width="72" height="72" style="border-radius:50%;object-fit:cover;border:1px solid var(--nv-border)" referrerpolicy="no-referrer">`
              : `<span class="avatar-fallback" style="width:72px;height:72px;font-size:1.4rem">${esc((u.displayName || "?").slice(0, 1))}</span>`
          }
          <div>
            <div style="font-weight:800;font-size:1.2rem">${esc(u.displayName || u.username || "Player")}</div>
            <div class="tiny">@${esc(u.username || "—")} · ${esc(u.accountType || "guest")}</div>
          </div>
        </div>
        <form id="profileForm" class="form-grid">
          <label>Display Name<input id="pfName" maxlength="64" value="${esc(u.displayName || "")}" required></label>
          <label>Username<input value="${esc(u.username || "")}" disabled></label>
          <label>Avatar URL<input id="pfAvatar" value="${esc(u.avatarUrl || "")}" placeholder="https://..."></label>
          <button class="btn" type="submit">บันทึกโปรไฟล์</button>
        </form>
        <p class="msg" id="pfMsg"></p>
      </div>

      <div class="panel-right">
        <div class="card">
          <h3>เชื่อมต่อบัญชี</h3>
          <p class="tiny">Google: ${linked.includes("google") ? "เชื่อมแล้ว" : "ยังไม่เชื่อม"}</p>
          <p class="tiny">Discord: ${linked.includes("discord") ? "เชื่อมแล้ว" : "ยังไม่เชื่อม"}</p>
          <a class="btn ghost block" style="margin-top:10px" href="/account.html">จัดการ Google / Discord / Sessions</a>
          ${
            isElevatedAdmin(u)
              ? `<a class="btn block" style="margin-top:10px" href="/admin.html">Admin Dashboard</a>`
              : ""
          }
        </div>
        <div class="card">
          <h3>ความเป็นส่วนตัว</h3>
          <form id="privForm" class="form-grid">
            <label><input id="privStats" type="checkbox" ${pref.publicStats !== false ? "checked" : ""}> เปิดสถิติสาธารณะ</label>
            <label><input id="privHistory" type="checkbox" ${pref.publicHistory ? "checked" : ""}> เปิดประวัติการเล่นสาธารณะ</label>
            <label><input id="privInvites" type="checkbox" ${pref.allowInvites !== false ? "checked" : ""}> รับคำเชิญเข้าห้อง</label>
            <button class="btn ghost" type="submit">บันทึกความเป็นส่วนตัว</button>
          </form>
          <p class="msg" id="privMsg"></p>
        </div>
        <div class="card">
          <h3>บัญชี</h3>
          <button type="button" class="btn ghost block" id="pfLogout">Logout</button>
          <a class="btn ghost block danger-outline" style="margin-top:8px" href="/account.html">ลบบัญชี / ตั้งค่าเพิ่มเติม</a>
        </div>
      </div>
    </div>`;

  root.querySelector("#profileForm").onsubmit = async (e) => {
    e.preventDefault();
    const msg = root.querySelector("#pfMsg");
    const body = JSON.stringify({
      displayName: root.querySelector("#pfName").value.trim(),
      avatarUrl: root.querySelector("#pfAvatar").value.trim() || null
    });
    const { res, data } = await api("/api/v1/account/profile", { method: "PATCH", body });
    if (!res.ok) {
      msg.textContent = (data && data.error) || "save_failed";
      msg.classList.remove("ok");
      return;
    }
    msg.textContent = "บันทึกแล้ว";
    msg.classList.add("ok");
    if (onSaved && data && data.user) onSaved(data.user);
  };

  root.querySelector("#privForm").onsubmit = async (e) => {
    e.preventDefault();
    const msg = root.querySelector("#privMsg");
    const { res, data } = await api("/api/v1/settings", {
      method: "PATCH",
      body: JSON.stringify({
        preferences: {
          publicStats: root.querySelector("#privStats").checked,
          publicHistory: root.querySelector("#privHistory").checked,
          allowInvites: root.querySelector("#privInvites").checked
        }
      })
    });
    msg.textContent = res.ok ? "บันทึกแล้ว" : (data && data.error) || "failed";
    msg.classList.toggle("ok", res.ok);
  };

  root.querySelector("#pfLogout").onclick = () => logout();
}
