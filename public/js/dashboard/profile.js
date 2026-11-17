import { api } from "./api.js";
import { logout } from "./shell.js";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function isElevatedAdmin(user) {
  const roles = (user && user.roles) || [];
  return roles.includes("admin") || roles.includes("super_admin") || roles.includes("moderator");
}

function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error("invalid_file"));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode_failed"));
      img.onload = () => {
        const size = 96;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
        if (dataUrl.length > 24000) return reject(new Error("too_large"));
        resolve(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export async function renderProfile(root, { user, onSaved }) {
  const u = user || {};
  let pendingAvatar = undefined;
  const settingsRes = await api("/api/v1/settings", { method: "GET" });
  const s = (settingsRes.data && settingsRes.data.settings) || {
    language: "th",
    theme: "dark",
    preferences: {}
  };
  const pref = s.preferences || {};
  const providersRes = await api("/api/v1/account/providers", { method: "GET" });
  const providers = ((providersRes.data && providersRes.data.providers) || []).filter(
    (p) => p && (p.provider === "google" || p.provider === "discord")
  );
  const linked = new Set(providers.map((p) => p.provider));
  const sessRes = await api("/api/v1/account/sessions", { method: "GET" });
  const sessions = (sessRes.data && sessRes.data.sessions) || [];
  const guest = u.accountType === "guest";

  root.innerHTML = `
    <div class="content-grid">
      <div class="card">
        <h2>โปรไฟล์</h2>
        <p class="tiny">${esc((u.roles || []).join(" · ") || u.accountType || "guest")}</p>
        <div class="avatar-edit">
          <div id="pfAvatarPreview" class="avatar-preview-lg">${
            u.avatarUrl
              ? `<img src="${esc(u.avatarUrl)}" alt="" referrerpolicy="no-referrer">`
              : esc((u.displayName || "?").slice(0, 1).toUpperCase())
          }</div>
          <div class="row-actions">
            <label class="btn ghost sm">เลือกรูป
              <input id="pfAvatarFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
            </label>
            <button type="button" class="btn ghost sm" id="pfAvatarClear">ลบรูป</button>
          </div>
        </div>
        <form id="profileForm" class="form-grid">
          <label>Display Name<input id="pfName" maxlength="64" value="${esc(u.displayName || "")}" required></label>
          <label>Username<input value="${esc(u.username || "")}" disabled></label>
          <label>เพศ
            <select id="pfGender">
              <option value="" ${!u.gender ? "selected" : ""}>—</option>
              <option value="male" ${u.gender === "male" ? "selected" : ""}>ชาย</option>
              <option value="female" ${u.gender === "female" ? "selected" : ""}>หญิง</option>
              <option value="lgbtq" ${u.gender === "lgbtq" ? "selected" : ""}>LGBTQ+</option>
            </select>
          </label>
          <label>อายุ
            <input id="pfAge" type="number" min="1" max="120" inputmode="numeric" placeholder="—" value="${u.age != null ? esc(String(u.age)) : ""}">
          </label>
          <p class="tiny muted" style="margin:0">เพศและอายุไม่บังคับ — แสดงในล็อบบี้และโปรไฟล์การ์ด</p>
          <button class="btn" type="submit">บันทึกโปรไฟล์</button>
        </form>
        <p class="msg" id="pfMsg"></p>
        ${
          guest
            ? `<div class="guest-upgrade">
                <p class="muted">ผูกบัญชีเพื่อเก็บเพื่อนและสถิติ</p>
                <div class="oauth-row">
                  <a class="btn ghost sm" href="/api/v1/auth/google">Google</a>
                  <a class="btn ghost sm" href="/api/v1/auth/discord">Discord</a>
                </div>
              </div>`
            : ""
        }
      </div>

      <div class="panel-right">
        <div class="card">
          <h3>เชื่อมต่อบัญชี</h3>
          <ul class="list" id="pfProviders"></ul>
          <div class="row-actions" id="pfLinkRow" style="margin-top:10px"></div>
          ${
            isElevatedAdmin(u)
              ? `<a class="btn block" style="margin-top:10px" href="/admin">Admin Dashboard</a>`
              : ""
          }
        </div>
        <div class="card">
          <h3>ความเป็นส่วนตัว</h3>
          <form id="privForm" class="switch-stack">
            <label class="switch-row">
              <span>เปิดสถิติสาธารณะ</span>
              <input id="privStats" type="checkbox" class="switch-input" ${pref.publicStats !== false ? "checked" : ""}>
              <span class="switch-ui" aria-hidden="true"></span>
            </label>
            <label class="switch-row">
              <span>เปิดประวัติการเล่นสาธารณะ</span>
              <input id="privHistory" type="checkbox" class="switch-input" ${pref.publicHistory ? "checked" : ""}>
              <span class="switch-ui" aria-hidden="true"></span>
            </label>
            <label class="switch-row">
              <span>รับคำเชิญเข้าห้อง</span>
              <input id="privInvites" type="checkbox" class="switch-input" ${pref.allowInvites !== false ? "checked" : ""}>
              <span class="switch-ui" aria-hidden="true"></span>
            </label>
            <button class="btn ghost" type="submit">บันทึกความเป็นส่วนตัว</button>
          </form>
          <p class="msg" id="privMsg"></p>
        </div>
        <div class="card">
          <h3>Sessions</h3>
          <ul class="list session-list" id="pfSessions"></ul>
          <button type="button" class="btn ghost block" id="pfLogout" style="margin-top:10px">Logout</button>
          <button type="button" class="btn ghost block" id="pfLogoutAll" style="margin-top:8px">Logout ทุกอุปกรณ์</button>
          <button type="button" class="btn ghost block danger-outline" id="pfDelete" style="margin-top:8px">ลบบัญชี</button>
        </div>
      </div>
    </div>
    <div id="deleteModal" class="modal hidden" role="dialog" aria-modal="true">
      <div class="modal-card">
        <h3>ลบบัญชี?</h3>
        <p class="muted">การลบไม่สามารถย้อนกลับได้</p>
        <div class="modal-actions">
          <button type="button" class="btn ghost" id="deleteCancel">ยกเลิก</button>
          <button type="button" class="btn" id="deleteConfirm" style="background:#b91c1c">ยืนยันลบ</button>
        </div>
      </div>
    </div>
  `;

  function paintPreview(url) {
    const box = root.querySelector("#pfAvatarPreview");
    if (url) box.innerHTML = `<img src="${esc(url)}" alt="" referrerpolicy="no-referrer">`;
    else box.textContent = (root.querySelector("#pfName").value || "?").slice(0, 1).toUpperCase();
  }

  const provBox = root.querySelector("#pfProviders");
  providers.forEach((p) => {
    const li = document.createElement("li");
    li.className = "provider-row";
    li.innerHTML = `
      <div class="provider-meta grow">
        <div class="provider-name">${esc(p.provider)}</div>
        ${p.providerEmail ? `<div class="tiny provider-email">${esc(p.providerEmail)}</div>` : ""}
      </div>`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn ghost sm provider-unlink";
    btn.textContent = "ยกเลิกเชื่อม";
    btn.onclick = async () => {
      const r = await api("/api/v1/account/unlink/" + p.provider, { method: "DELETE" });
      const map = {
        last_provider: "ถอดไม่ได้ — นี่คือวิธีล็อกอินสุดท้าย",
        provider_not_linked: "ยังไม่ได้เชื่อม",
        cannot_unlink: "ถอดการเชื่อมไม่สำเร็จ"
      };
      const msg = root.querySelector("#pfMsg");
      msg.textContent = r.res.ok ? "ยกเลิกแล้ว" : map[r.data && r.data.error] || (r.data && r.data.error) || "ล้มเหลว";
      msg.classList.toggle("ok", r.res.ok);
      if (r.res.ok) renderProfile(root, { user, onSaved });
    };
    li.appendChild(btn);
    provBox.appendChild(li);
  });
  if (!providers.length) {
    provBox.innerHTML = `<li><span class="tiny">ยังไม่ได้เชื่อมบัญชี</span></li>`;
  }

  const linkRow = root.querySelector("#pfLinkRow");
  if (!guest) {
    if (!linked.has("google")) {
      linkRow.innerHTML += `<a class="btn ghost sm" href="/api/v1/auth/link/google">เชื่อม Google</a>`;
    }
    if (!linked.has("discord")) {
      linkRow.innerHTML += `<a class="btn ghost sm" href="/api/v1/auth/link/discord">เชื่อม Discord</a>`;
    }
  }

  const sessBox = root.querySelector("#pfSessions");
  function deviceLabel(ua) {
    const s = String(ua || "");
    if (/Edg\//i.test(s)) return "Microsoft Edge";
    if (/Chrome\//i.test(s) && !/Edg\//i.test(s)) return "Chrome";
    if (/Firefox\//i.test(s)) return "Firefox";
    if (/Safari\//i.test(s) && !/Chrome\//i.test(s)) return "Safari";
    return "เบราว์เซอร์";
  }
  function osLabel(ua) {
    const s = String(ua || "");
    if (/Windows/i.test(s)) return "Windows";
    if (/Android/i.test(s)) return "Android";
    if (/iPhone|iPad|iOS/i.test(s)) return "iOS";
    if (/Mac OS/i.test(s)) return "macOS";
    if (/Linux/i.test(s)) return "Linux";
    return "อุปกรณ์";
  }
  sessions.forEach((sItem) => {
    const li = document.createElement("li");
    li.className = "session-row" + (sItem.current ? " current" : "");
    const title = deviceLabel(sItem.userAgent) + " · " + osLabel(sItem.userAgent);
    li.innerHTML = `
      <div class="session-main grow">
        <div class="session-title-row">
          <span class="session-title">${esc(title)}</span>
          ${sItem.current ? `<span class="session-badge">เครื่องนี้</span>` : ""}
        </div>
        <div class="tiny session-sub">${esc(sItem.ipAddress || "—")} · ${esc(
          new Date(sItem.lastSeenAt).toLocaleString()
        )}</div>
      </div>`;
    if (!sItem.current) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn ghost sm";
      btn.textContent = "ยกเลิก";
      btn.onclick = async () => {
        await api("/api/v1/account/sessions/" + sItem.id, { method: "DELETE" });
        renderProfile(root, { user, onSaved });
      };
      li.appendChild(btn);
    }
    sessBox.appendChild(li);
  });
  if (!sessions.length) sessBox.innerHTML = `<li><span class="tiny">ไม่มี session</span></li>`;

  root.querySelector("#pfAvatarFile").onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      pendingAvatar = await resizeImageFile(file);
      paintPreview(pendingAvatar);
      const msg = root.querySelector("#pfMsg");
      msg.textContent = "เลือกรูปแล้ว — กดบันทึกโปรไฟล์";
      msg.classList.add("ok");
    } catch {
      const msg = root.querySelector("#pfMsg");
      msg.textContent = "อัปโหลดรูปไม่สำเร็จ";
      msg.classList.remove("ok");
    }
  };
  root.querySelector("#pfAvatarClear").onclick = () => {
    pendingAvatar = null;
    paintPreview("");
  };

  root.querySelector("#profileForm").onsubmit = async (e) => {
    e.preventDefault();
    const msg = root.querySelector("#pfMsg");
    const genderRaw = root.querySelector("#pfGender").value;
    const ageRaw = root.querySelector("#pfAge").value.trim();
    const body = {
      displayName: root.querySelector("#pfName").value.trim(),
      gender: genderRaw || null,
      age: ageRaw === "" ? null : Number(ageRaw)
    };
    if (pendingAvatar !== undefined) body.avatarUrl = pendingAvatar;
    const { res, data } = await api("/api/v1/account/profile", {
      method: "PATCH",
      body: JSON.stringify(body)
    });
    const errMap = {
      invalid_gender: "เพศไม่ถูกต้อง",
      invalid_age: "อายุต้องเป็นตัวเลข 1–120"
    };
    msg.textContent = res.ok
      ? "บันทึกแล้ว"
      : errMap[data && data.error] || (data && data.error) || "บันทึกไม่สำเร็จ";
    msg.classList.toggle("ok", res.ok);
    if (res.ok && onSaved && data && data.user) onSaved(data.user);
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
  root.querySelector("#pfLogoutAll").onclick = async () => {
    await api("/api/v1/auth/logout-all", { method: "POST", body: "{}" });
    location.href = "/login";
  };

  const modal = root.querySelector("#deleteModal");
  root.querySelector("#pfDelete").onclick = () => modal.classList.remove("hidden");
  root.querySelector("#deleteCancel").onclick = () => modal.classList.add("hidden");
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });
  root.querySelector("#deleteConfirm").onclick = async () => {
    const { res, data } = await api("/api/v1/account/delete", { method: "DELETE" });
    if (res.ok) {
      location.href = "/";
      return;
    }
    modal.classList.add("hidden");
    const msg = root.querySelector("#pfMsg");
    msg.textContent = (data && data.error) || "ลบบัญชีไม่สำเร็จ";
    msg.classList.remove("ok");
  };

  const q = new URLSearchParams(location.search);
  const linkedParam = q.get("linked");
  const err = q.get("error");
  if (linkedParam || err) {
    const msg = root.querySelector("#pfMsg");
    if (linkedParam) {
      msg.textContent = "เชื่อม " + linkedParam + " แล้ว";
      msg.classList.add("ok");
    } else {
      msg.textContent = err === "provider_already_linked" ? "บัญชีนี้ถูกผูกกับโปรไฟล์อื่นแล้ว" : err;
      msg.classList.remove("ok");
    }
    history.replaceState({}, "", location.pathname + location.hash);
  }
}
