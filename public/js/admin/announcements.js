import { api } from "/js/dashboard/api.js";
import { esc, fmtDate } from "./util.js";

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
        <label style="display:flex;gap:8px;align-items:center;margin-top:8px">
          <input type="checkbox" id="aActive" /> Publish ทันที
        </label>
        <button type="button" class="btn sm" id="aCreate" style="margin-top:10px">Create</button>
        <p class="tiny" id="aMsg"></p>
      </div>
      <div class="card" style="margin-top:16px">
        <h2>รายการ</h2>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Title</th><th>Active</th><th>Created</th><th></th></tr></thead>
            <tbody>
              ${
                items.length
                  ? items
                      .map(
                        (a) => `<tr>
                  <td><b>${esc(a.title)}</b><div class="tiny">${esc(a.body).slice(0, 120)}</div></td>
                  <td>${a.active ? "yes" : "no"}</td>
                  <td class="tiny">${esc(fmtDate(a.createdAt))}</td>
                  <td class="actions-cell">
                    <button type="button" class="btn ghost sm" data-toggle="${esc(a.id)}" data-active="${a.active ? "0" : "1"}">${a.active ? "Unpublish" : "Publish"}</button>
                    <button type="button" class="btn danger sm" data-del="${esc(a.id)}">Delete</button>
                  </td>
                </tr>`
                      )
                      .join("")
                  : `<tr><td colspan="4" class="empty">ยังไม่มีประกาศ</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
    root.querySelector("#aCreate").onclick = async () => {
      const title = root.querySelector("#aTitle").value.trim();
      const body = root.querySelector("#aBody").value.trim();
      const active = root.querySelector("#aActive").checked;
      if (!title || !body) {
        root.querySelector("#aMsg").textContent = "กรอกหัวข้อและเนื้อหา";
        return;
      }
      const r = await api("/api/v1/admin/announcements", {
        method: "POST",
        body: JSON.stringify({ title, body, active })
      });
      if (!r.res.ok) {
        root.querySelector("#aMsg").textContent = "สร้างไม่สำเร็จ";
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
