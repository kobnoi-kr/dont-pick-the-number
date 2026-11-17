import { api } from "/js/dashboard/api.js";
import { esc, fmtDate } from "./util.js";

const KINDS = [
  { id: "info", label: "เขียว · ประกาศทั่วไป" },
  { id: "warning", label: "เหลือง · เตือนทั่วไป" },
  { id: "danger", label: "แดง · ถึงบุคคล/ไอดี" },
  { id: "alert", label: "เหลืองแดง · เตือนถึงบุคคล/ไอดี" }
];

function kindLabel(kind) {
  return (KINDS.find((k) => k.id === kind) || KINDS[0]).label;
}

export async function renderAnnouncements(root) {
  async function load() {
    root.innerHTML = `<div class="loading">Loading…</div>`;
    const { res, data } = await api("/api/v1/admin/announcements", { method: "GET" });
    if (!res.ok) {
      root.innerHTML = `<div class="empty">โหลดไม่ได้</div>`;
      return;
    }
    const items = data.announcements || [];
    root.innerHTML = `
      <div class="card">
        <h2>สร้างประกาศ</h2>
        <input class="input" id="aTitle" placeholder="หัวข้อ" />
        <textarea class="input" id="aBody" rows="3" placeholder="เนื้อหา" style="margin-top:8px;width:100%"></textarea>
        <div class="kind-pills" id="aKinds" role="radiogroup" aria-label="ประเภทประกาศ">
          ${KINDS.map(
            (k, i) => `<label class="kind-pill${i === 0 ? " on" : ""}">
              <input type="radio" name="aKind" value="${k.id}" ${i === 0 ? "checked" : ""}/>
              <span class="kind-dot ${k.id}"></span> ${esc(k.label)}
            </label>`
          ).join("")}
        </div>
        <div id="aTargetWrap" class="hidden" style="margin-top:10px">
          <label class="field">
            <span>เป้าหมาย (user id / username / friend code คั่นด้วยคอมมาหรือขึ้นบรรทัดใหม่)</span>
            <textarea class="input" id="aTargets" rows="2" placeholder="เช่น NV-9VVC2W, Kim, uuid..."></textarea>
          </label>
        </div>
        <label style="display:flex;gap:8px;align-items:center;margin-top:10px">
          <input type="checkbox" id="aActive" /> Publish ทันที
        </label>
        <button type="button" class="btn sm" id="aCreate" style="margin-top:10px">Create</button>
        <p class="tiny" id="aMsg"></p>
      </div>
      <div class="card" style="margin-top:16px">
        <h2>รายการ</h2>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Title</th><th>Type</th><th>Active</th><th>Created</th><th></th></tr></thead>
            <tbody>
              ${
                items.length
                  ? items
                      .map((a) => {
                        const targets = Array.isArray(a.targetIds) ? a.targetIds : [];
                        return `<tr>
                  <td>
                    <b>${esc(a.title)}</b>
                    <div class="tiny">${esc(a.body).slice(0, 120)}</div>
                    ${
                      targets.length
                        ? `<div class="tiny">→ ${esc(targets.join(", "))}</div>`
                        : ""
                    }
                  </td>
                  <td><span class="kind-dot ${esc(a.kind || "info")}" style="display:inline-block;vertical-align:middle;margin-right:6px"></span>${esc(
                          kindLabel(a.kind || "info")
                        )}</td>
                  <td>${a.active ? "yes" : "no"}</td>
                  <td class="tiny">${esc(fmtDate(a.createdAt))}</td>
                  <td class="actions-cell">
                    <button type="button" class="btn ghost sm" data-toggle="${esc(a.id)}" data-active="${a.active ? "0" : "1"}">${a.active ? "Unpublish" : "Publish"}</button>
                    <button type="button" class="btn danger sm" data-del="${esc(a.id)}">Delete</button>
                  </td>
                </tr>`;
                      })
                      .join("")
                  : `<tr><td colspan="5" class="empty">ยังไม่มีประกาศ</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;

    function syncKindUi() {
      const kind = (root.querySelector('input[name="aKind"]:checked') || {}).value || "info";
      root.querySelectorAll(".kind-pill").forEach((el) => {
        const input = el.querySelector("input");
        el.classList.toggle("on", !!(input && input.checked));
      });
      const personal = kind === "danger" || kind === "alert";
      root.querySelector("#aTargetWrap").classList.toggle("hidden", !personal);
    }
    root.querySelectorAll('input[name="aKind"]').forEach((el) => {
      el.onchange = syncKindUi;
    });
    syncKindUi();

    root.querySelector("#aCreate").onclick = async () => {
      const title = root.querySelector("#aTitle").value.trim();
      const body = root.querySelector("#aBody").value.trim();
      const active = root.querySelector("#aActive").checked;
      const kind = (root.querySelector('input[name="aKind"]:checked') || {}).value || "info";
      const targets = root.querySelector("#aTargets").value;
      if (!title || !body) {
        root.querySelector("#aMsg").textContent = "กรอกหัวข้อและเนื้อหา";
        return;
      }
      if ((kind === "danger" || kind === "alert") && !targets.trim()) {
        root.querySelector("#aMsg").textContent = "กรอกเป้าหมาย (id / username / friend code)";
        return;
      }
      const r = await api("/api/v1/admin/announcements", {
        method: "POST",
        body: JSON.stringify({ title, body, active, kind, targets })
      });
      if (!r.res.ok) {
        root.querySelector("#aMsg").textContent =
          (r.data && r.data.error === "targets_required"
            ? "ต้องระบุเป้าหมาย"
            : "สร้างไม่สำเร็จ");
        return;
      }
      load();
    };
    root.querySelectorAll("[data-toggle]").forEach((btn) => {
      btn.onclick = async () => {
        await api(`/api/v1/admin/announcements/${encodeURIComponent(btn.getAttribute("data-toggle"))}`, {
          method: "PATCH",
          body: JSON.stringify({ active: btn.getAttribute("data-active") === "1" })
        });
        load();
      };
    });
    root.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm("ลบประกาศ?")) return;
        await api(`/api/v1/admin/announcements/${encodeURIComponent(btn.getAttribute("data-del"))}`, {
          method: "DELETE"
        });
        load();
      };
    });
  }
  await load();
}
