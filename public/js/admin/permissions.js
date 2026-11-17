import { api } from "/js/dashboard/api.js";
import { esc, hasPerm } from "./util.js";

export async function renderPermissions(root, { user }) {
  root.innerHTML = `<div class="loading">Loading…</div>`;
  const { res, data } = await api("/api/v1/admin/roles", { method: "GET" });
  if (!res.ok) {
    root.innerHTML = `<div class="empty">โหลดไม่ได้</div>`;
    return;
  }
  const roles = data.roles || [];
  const permissions = data.permissions || [];
  const canManage = hasPerm(user, "admins.manage");

  root.innerHTML = `
    <div class="card">
      <h2>Admin &amp; Permissions</h2>
      <p class="muted tiny">super_admin มีสิทธิ์ครบและแก้ matrix ไม่ได้</p>
      <div class="table-wrap" style="margin-top:12px;overflow:auto">
        <table class="table perm-matrix">
          <thead>
            <tr>
              <th>Permission</th>
              ${roles.map((r) => `<th>${esc(r.name)}<div class="tiny">${r.userCount} users</div></th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${permissions
              .map(
                (p) => `<tr>
              <td><code>${esc(p.name)}</code></td>
              ${roles
                .map((r) => {
                  const on = (r.permissions || []).includes(p.name);
                  const locked = r.name === "super_admin" || !canManage;
                  return `<td style="text-align:center">
                    <input type="checkbox" data-role="${esc(r.name)}" data-perm="${esc(p.name)}" ${on ? "checked" : ""} ${locked ? "disabled" : ""}/>
                  </td>`;
                })
                .join("")}
            </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
      ${canManage ? `<button type="button" class="btn sm" id="pSave" style="margin-top:12px">Save changes</button>` : ""}
      <p class="tiny" id="pMsg"></p>
    </div>
  `;

  const save = root.querySelector("#pSave");
  if (save) {
    save.onclick = async () => {
      const msg = root.querySelector("#pMsg");
      msg.textContent = "Saving…";
      for (const role of roles) {
        if (role.name === "super_admin") continue;
        const permissions = [...root.querySelectorAll(`input[data-role="${role.name}"]:checked`)].map(
          (el) => el.getAttribute("data-perm")
        );
        const r = await api(`/api/v1/admin/roles/${encodeURIComponent(role.name)}/permissions`, {
          method: "PUT",
          body: JSON.stringify({ permissions })
        });
        if (!r.res.ok) {
          msg.textContent = `Failed on ${role.name}: ${(r.data && r.data.error) || "error"}`;
          return;
        }
      }
      msg.textContent = "บันทึกแล้ว";
    };
  }
}
