import { api } from "/js/dashboard/api.js";
import { esc, fmtDate } from "./util.js";

const USER_ACTIONS = [
  { value: "", label: "ทุก action" },
  { value: "login", label: "login" },
  { value: "room_create", label: "สร้างห้อง" },
  { value: "room_join", label: "เข้าห้อง" },
  { value: "ban", label: "ban" },
  { value: "match_end", label: "จบแมตช์" }
];

const ACTION_LABEL = {
  login: "Login",
  room_create: "สร้างห้อง",
  room_join: "เข้าห้อง",
  ban: "Ban",
  match_end: "จบแมตช์"
};

function metaText(meta) {
  if (!meta || typeof meta !== "object") return "—";
  try {
    return JSON.stringify(meta);
  } catch {
    return "—";
  }
}

function userLabel(u) {
  if (!u) return "—";
  const name = u.displayName || u.username || "—";
  const kind = u.accountType === "guest" ? "guest" : "user";
  return `${name} (${kind})`;
}

export async function renderLogs(root) {
  let tab = "user";

  root.innerHTML = `
    <div class="card">
      <div class="log-tabs" role="tablist">
        <button type="button" class="log-tab active" data-tab="user" role="tab">User activity</button>
        <button type="button" class="log-tab" data-tab="admin" role="tab">Admin actions</button>
      </div>
      <div id="logPanel" style="margin-top:12px"></div>
    </div>
  `;

  const panel = root.querySelector("#logPanel");

  async function loadUser() {
    const action = panel.querySelector("#uaAction")?.value || "";
    const q = (panel.querySelector("#uaQ")?.value || "").trim();
    const params = new URLSearchParams({ limit: "100" });
    if (action) params.set("action", action);
    if (q) params.set("q", q);
    const box = panel.querySelector("#uaList");
    if (box) box.innerHTML = `<div class="loading">Loading…</div>`;
    const { res, data } = await api("/api/v1/admin/activity-logs?" + params.toString(), { method: "GET" });
    if (!box) return;
    if (!res.ok) {
      box.innerHTML = `<div class="empty">โหลด user activity ไม่ได้</div>`;
      return;
    }
    const logs = data.logs || [];
    const total = data.total != null ? data.total : logs.length;
    box.innerHTML = `
      <p class="tiny" style="margin:0 0 8px;color:var(--nv-muted)">แสดง ${logs.length} จากทั้งหมด ${total} · เก็บตาม Settings (ค่าเริ่มต้น 30 วัน)</p>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>When</th><th>User</th><th>Action</th><th>IP</th><th>Meta</th></tr></thead>
          <tbody>
            ${
              logs.length
                ? logs
                    .map(
                      (l) => `<tr>
                <td class="tiny">${esc(fmtDate(l.createdAt))}</td>
                <td>${esc(userLabel(l.user))}</td>
                <td><code title="${esc(l.action)}">${esc(ACTION_LABEL[l.action] || l.action)}</code></td>
                <td class="tiny">${esc(l.ipAddress || "—")}</td>
                <td class="tiny">${esc(metaText(l.metadata))}</td>
              </tr>`
                    )
                    .join("")
                : `<tr><td colspan="5" class="empty">ยังไม่มี user activity</td></tr>`
            }
          </tbody>
        </table>
      </div>`;
  }

  async function loadAdmin() {
    const action = (panel.querySelector("#lAction")?.value || "").trim();
    const params = new URLSearchParams({ limit: "80" });
    if (action) params.set("action", action);
    const box = panel.querySelector("#lList");
    if (box) box.innerHTML = `<div class="loading">Loading…</div>`;
    const { res, data } = await api("/api/v1/admin/logs?" + params.toString(), { method: "GET" });
    if (!box) return;
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

  function paintUserTab() {
    panel.innerHTML = `
      <div class="toolbar">
        <select class="input" id="uaAction" style="max-width:160px">
          ${USER_ACTIONS.map((a) => `<option value="${esc(a.value)}">${esc(a.label)}</option>`).join("")}
        </select>
        <input class="input" id="uaQ" placeholder="ค้นหาชื่อ user / guest" />
        <button type="button" class="btn sm" id="uaSearch">ค้นหา</button>
      </div>
      <div id="uaList" class="loading" style="margin-top:12px">Loading…</div>
    `;
    panel.querySelector("#uaSearch").onclick = loadUser;
    panel.querySelector("#uaAction").onchange = loadUser;
    panel.querySelector("#uaQ").onkeydown = (e) => {
      if (e.key === "Enter") loadUser();
    };
    loadUser();
  }

  function paintAdminTab() {
    panel.innerHTML = `
      <div class="toolbar">
        <input class="input" id="lAction" placeholder="กรอง action เช่น user.ban" />
        <button type="button" class="btn sm" id="lSearch">ค้นหา</button>
      </div>
      <div id="lList" class="loading" style="margin-top:12px">Loading…</div>
    `;
    panel.querySelector("#lSearch").onclick = loadAdmin;
    loadAdmin();
  }

  function setTab(next) {
    tab = next;
    root.querySelectorAll(".log-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
    });
    if (tab === "user") paintUserTab();
    else paintAdminTab();
  }

  root.querySelectorAll(".log-tab").forEach((btn) => {
    btn.onclick = () => setTab(btn.getAttribute("data-tab"));
  });

  setTab("user");
}
