import { api } from "/js/dashboard/api.js";
import { esc, hasPerm } from "./util.js";

const GROUP_ORDER = ["dashboard", "users", "games", "rooms", "content", "system"];

export async function renderPermissions(root, { user }) {
  root.innerHTML = `<div class="loading">Loading…</div>`;
  const { res, data } = await api("/api/v1/admin/roles", { method: "GET" });
  if (!res.ok) {
    root.innerHTML = `<div class="empty">โหลดไม่ได้</div>`;
    return;
  }
  const roles = data.roles || [];
  const permissions = data.permissions || [];
  const groups = data.groups || {};
  const canManage = hasPerm(user, "admins.manage");

  const byGroup = new Map();
  for (const p of permissions) {
    const g = p.group || "system";
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(p);
  }
  const orderedGroups = [
    ...GROUP_ORDER.filter((g) => byGroup.has(g)),
    ...[...byGroup.keys()].filter((g) => !GROUP_ORDER.includes(g))
  ];

  root.innerHTML = `
    <section class="page-head">
      <div>
        <h2 style="margin:0">Admin &amp; Permissions</h2>
        <p class="muted" style="margin:6px 0 0">
          จัดสิทธิ์ตามบทบาท · super_admin มีสิทธิ์ครบและแก้ไม่ได้
        </p>
      </div>
      ${canManage ? `<button type="button" class="btn sm" id="pSave">Save changes</button>` : ""}
    </section>
    <p class="msg" id="pMsg"></p>
    <div class="perm-legend">
      ${roles
        .map(
          (r) =>
            `<span class="perm-legend-chip"><b>${esc(r.name)}</b><em>${r.userCount} users</em></span>`
        )
        .join("")}
    </div>
    <div class="perm-groups">
      ${orderedGroups
        .map((groupId) => {
          const rows = byGroup.get(groupId) || [];
          const groupLabel = groups[groupId] || (rows[0] && rows[0].groupLabel) || groupId;
          return `
          <div class="card perm-group-card">
            <h3 class="perm-group-title">${esc(groupLabel)}</h3>
            <div class="perm-rows">
              ${rows
                .map(
                  (p) => `
                <div class="perm-row">
                  <div class="perm-info">
                    <div class="perm-name">${esc(p.label || p.name)}</div>
                    <code class="perm-code">${esc(p.name)}</code>
                    <p class="perm-desc">${esc(p.description || "")}</p>
                  </div>
                  <div class="perm-checks-row">
                    ${roles
                      .map((r) => {
                        const on = (r.permissions || []).includes(p.name);
                        const locked = r.name === "super_admin" || !canManage;
                        return `<label class="perm-role-check${locked ? " locked" : ""}${on ? " on" : ""}" title="${esc(
                          r.name
                        )}">
                          <span class="perm-role-label">${esc(r.name.replace("_", " "))}</span>
                          <input type="checkbox" data-role="${esc(r.name)}" data-perm="${esc(p.name)}" ${
                          on ? "checked" : ""
                        } ${locked ? "disabled" : ""}/>
                        </label>`;
                      })
                      .join("")}
                  </div>
                </div>`
                )
                .join("")}
            </div>
          </div>`;
        })
        .join("")}
    </div>
  `;

  root.querySelectorAll(".perm-role-check input").forEach((inp) => {
    inp.onchange = () => {
      const lab = inp.closest(".perm-role-check");
      if (lab) lab.classList.toggle("on", inp.checked);
    };
  });

  const save = root.querySelector("#pSave");
  if (save) {
    save.onclick = async () => {
      const msg = root.querySelector("#pMsg");
      msg.textContent = "Saving…";
      msg.classList.remove("ok");
      for (const role of roles) {
        if (role.name === "super_admin") continue;
        const nextPerms = [...root.querySelectorAll(`input[data-role="${role.name}"]:checked`)].map(
          (el) => el.getAttribute("data-perm")
        );
        const r = await api(`/api/v1/admin/roles/${encodeURIComponent(role.name)}/permissions`, {
          method: "PUT",
          body: JSON.stringify({ permissions: nextPerms })
        });
        if (!r.res.ok) {
          msg.textContent = `Failed on ${role.name}: ${(r.data && r.data.error) || "error"}`;
          return;
        }
      }
      msg.textContent = "บันทึกแล้ว";
      msg.classList.add("ok");
    };
  }
}
