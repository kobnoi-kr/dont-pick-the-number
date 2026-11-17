import { api } from "/js/dashboard/api.js";
import { esc, fmtDate, statusPill, hasPerm } from "./util.js";

export async function renderUsers(root, { user }) {
  root.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <input class="input" id="uQ" placeholder="ค้นหาชื่อ / username / friend code" />
        <select class="input" id="uStatus">
          <option value="">ทุกสถานะ</option>
          <option value="active">active</option>
          <option value="suspended">suspended</option>
          <option value="banned">banned</option>
        </select>
        <select class="input" id="uRole">
          <option value="">ทุก role</option>
          <option value="player">player</option>
          <option value="moderator">moderator</option>
          <option value="admin">admin</option>
          <option value="super_admin">super_admin</option>
        </select>
        <button type="button" class="btn sm" id="uSearch">ค้นหา</button>
      </div>
      <div id="uList" class="loading" style="margin-top:12px">Loading…</div>
    </div>
    <div id="uDetail" class="card hidden" style="margin-top:16px"></div>
  `;

  async function load() {
    const q = root.querySelector("#uQ").value.trim();
    const status = root.querySelector("#uStatus").value;
    const role = root.querySelector("#uRole").value;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (role) params.set("role", role);
    const box = root.querySelector("#uList");
    box.innerHTML = `<div class="loading">Loading…</div>`;
    const { res, data } = await api("/api/v1/admin/users?" + params.toString(), { method: "GET" });
    if (!res.ok) {
      box.innerHTML = `<div class="empty">โหลดไม่ได้</div>`;
      return;
    }
    const users = data.users || [];
    box.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>User</th><th>Type</th><th>Status</th><th>Roles</th><th>Sessions</th><th>Joined</th></tr></thead>
          <tbody>
            ${
              users.length
                ? users
                    .map(
                      (u) => `<tr class="click-row" data-id="${esc(u.id)}">
                <td>
                  <b>${esc(u.displayName || u.username)}</b>
                  <div class="tiny">@${esc(u.username)}${u.email ? " · " + esc(u.email) : ""}</div>
                </td>
                <td>${esc(u.accountType)}</td>
                <td>${statusPill(u.status)}</td>
                <td>${esc((u.roles || []).join(", "))}</td>
                <td>${u.sessionCount != null ? u.sessionCount : "—"}</td>
                <td class="tiny">${esc(fmtDate(u.createdAt))}</td>
              </tr>`
                    )
                    .join("")
                : `<tr><td colspan="6" class="empty">ไม่พบผู้ใช้</td></tr>`
            }
          </tbody>
        </table>
      </div>`;
    box.querySelectorAll("[data-id]").forEach((row) => {
      row.onclick = () => openDetail(row.getAttribute("data-id"));
    });
  }

  async function openDetail(id) {
    const panel = root.querySelector("#uDetail");
    panel.classList.remove("hidden");
    panel.innerHTML = `<div class="loading">Loading…</div>`;
    const { res, data } = await api(`/api/v1/admin/users/${encodeURIComponent(id)}`, { method: "GET" });
    if (!res.ok) {
      panel.innerHTML = `<div class="empty">ไม่พบผู้ใช้</div>`;
      return;
    }
    const u = data.user;
    const canBan = hasPerm(user, "users.ban");
    const canUnban = hasPerm(user, "users.unban");
    const canDelete = hasPerm(user, "users.delete");
    const canRoles = hasPerm(user, "admins.manage");
    panel.innerHTML = `
      <div class="row-between">
        <div>
          <h2 style="margin:0">${esc(u.displayName || u.username)}</h2>
          <div class="tiny">@${esc(u.username)} · ${statusPill(u.status)} · ${(u.roles || []).map(esc).join(", ")}</div>
        </div>
        <button type="button" class="btn ghost sm" id="uClose">ปิด</button>
      </div>
      <div class="actions" style="margin-top:14px;display:flex;flex-wrap:wrap;gap:8px">
        ${canUnban ? `<button type="button" class="btn sm" data-status="active">Unban / Activate</button>` : ""}
        ${canBan ? `<button type="button" class="btn ghost sm" data-status="suspended">Suspend</button>` : ""}
        ${canBan ? `<button type="button" class="btn danger sm" data-status="banned">Ban</button>` : ""}
        ${canDelete ? `<button type="button" class="btn danger sm" data-status="deleted">Soft delete</button>` : ""}
        ${canBan ? `<button type="button" class="btn ghost sm" id="uRevoke">Revoke sessions</button>` : ""}
      </div>
      ${
        canRoles
          ? `<div style="margin-top:16px">
        <h3>Roles</h3>
        <div class="perm-checks" id="uRoles">
          ${["player", "moderator", "admin", "super_admin"]
            .map(
              (r) =>
                `<label><input type="checkbox" value="${r}" ${(u.roles || []).includes(r) ? "checked" : ""}/> ${r}</label>`
            )
            .join("")}
        </div>
        <button type="button" class="btn sm" id="uSaveRoles" style="margin-top:10px">Save roles</button>
      </div>`
          : ""
      }
    `;
    panel.querySelector("#uClose").onclick = () => panel.classList.add("hidden");
    panel.querySelectorAll("[data-status]").forEach((btn) => {
      btn.onclick = async () => {
        const status = btn.getAttribute("data-status");
        if (!confirm(`ตั้งสถานะเป็น ${status}?`)) return;
        await api(`/api/v1/admin/users/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status })
        });
        await openDetail(id);
        await load();
      };
    });
    const revoke = panel.querySelector("#uRevoke");
    if (revoke) {
      revoke.onclick = async () => {
        await api(`/api/v1/admin/users/${encodeURIComponent(id)}/sessions`, { method: "DELETE" });
        alert("Revoked sessions");
        await openDetail(id);
      };
    }
    const saveRoles = panel.querySelector("#uSaveRoles");
    if (saveRoles) {
      saveRoles.onclick = async () => {
        const roles = [...panel.querySelectorAll("#uRoles input:checked")].map((el) => el.value);
        const r = await api(`/api/v1/admin/users/${encodeURIComponent(id)}/roles`, {
          method: "PUT",
          body: JSON.stringify({ roles })
        });
        if (!r.res.ok) {
          alert((r.data && r.data.error) || "save failed");
          return;
        }
        await openDetail(id);
        await load();
      };
    }
  }

  root.querySelector("#uSearch").onclick = load;
  root.querySelector("#uQ").onkeydown = (e) => {
    if (e.key === "Enter") load();
  };
  await load();
}
