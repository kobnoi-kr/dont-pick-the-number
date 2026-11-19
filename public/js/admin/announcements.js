import { api } from "/js/dashboard/api.js";
import { esc, fmtDate, confirmDialog } from "./util.js";

const KINDS = [
  { id: "info", label: "เขียว · ประกาศทั่วไป" },
  { id: "warning", label: "เหลือง · เตือนทั่วไป" },
  { id: "danger", label: "แดง · ถึงบุคคล/ไอดี" },
  { id: "alert", label: "เหลืองแดง · เตือนถึงบุคคล/ไอดี" }
];

function kindLabel(kind) {
  return (KINDS.find((k) => k.id === kind) || KINDS[0]).label;
}

function statusOf(a) {
  const now = Date.now();
  if (!a.active) return { label: "ฉบับร่าง", cls: "muted" };
  if (a.startsAt && new Date(a.startsAt).getTime() > now) {
    return { label: "รอเวลา", cls: "warn" };
  }
  if (a.endsAt && new Date(a.endsAt).getTime() < now) {
    return { label: "หมดอายุ", cls: "muted" };
  }
  if (a.publishedAt) return { label: "กำลังแสดง", cls: "ok" };
  return { label: "รอส่ง", cls: "warn" };
}

function toLocalInputValue(d = new Date()) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 16);
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
        <p class="muted" style="margin-top:0">
          ประกาศจะเด้ง popup บนแดชบอร์ดผู้เล่นแบบ realtime และเก็บไว้ในช่องแจ้งเตือน 🔔
        </p>
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
        <div class="mode-pills" role="radiogroup" aria-label="เวลาประกาศ" style="margin-top:12px">
          <label class="kind-pill on">
            <input type="radio" name="aMode" value="now" checked/>
            ประกาศทันที
          </label>
          <label class="kind-pill">
            <input type="radio" name="aMode" value="schedule"/>
            ตั้งเวลาล่วงหน้า
          </label>
          <label class="kind-pill">
            <input type="radio" name="aMode" value="draft"/>
            บันทึกฉบับร่าง
          </label>
        </div>
        <div id="aScheduleWrap" class="hidden" style="margin-top:10px">
          <div class="toolbar" style="flex-wrap:wrap;gap:10px">
            <label class="field" style="flex:1;min-width:180px">
              <span>เริ่มแสดง</span>
              <input class="input" type="datetime-local" id="aStarts" />
            </label>
            <label class="field" style="flex:1;min-width:180px">
              <span>หมดอายุ (ไม่บังคับ)</span>
              <input class="input" type="datetime-local" id="aEnds" />
            </label>
          </div>
        </div>
        <button type="button" class="btn sm" id="aCreate" style="margin-top:12px">สร้างประกาศ</button>
        <p class="tiny" id="aMsg"></p>
      </div>
      <div class="card" style="margin-top:16px">
        <h2>รายการ</h2>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Title</th><th>Type</th><th>สถานะ</th><th>เวลา</th><th></th></tr></thead>
            <tbody>
              ${
                items.length
                  ? items
                      .map((a) => {
                        const targets = Array.isArray(a.targetIds) ? a.targetIds : [];
                        const st = statusOf(a);
                        const when =
                          a.startsAt && new Date(a.startsAt).getTime() > Date.now()
                            ? `เริ่ม ${fmtDate(a.startsAt)}`
                            : a.publishedAt
                              ? `ส่งแล้ว ${fmtDate(a.publishedAt)}`
                              : fmtDate(a.createdAt);
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
                  <td><span class="status-pill ${st.cls}">${esc(st.label)}</span></td>
                  <td class="tiny">${esc(when)}</td>
                  <td class="actions-cell">
                    <button type="button" class="btn ghost sm" data-toggle="${esc(a.id)}" data-active="${a.active ? "0" : "1"}">${a.active ? "ปิด" : "เปิด/ส่ง"}</button>
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

    const startsEl = root.querySelector("#aStarts");
    if (startsEl) {
      const soon = new Date(Date.now() + 5 * 60 * 1000);
      startsEl.value = toLocalInputValue(soon);
    }

    function syncKindUi() {
      const kind = (root.querySelector('input[name="aKind"]:checked') || {}).value || "info";
      root.querySelectorAll("#aKinds .kind-pill").forEach((el) => {
        const input = el.querySelector("input");
        el.classList.toggle("on", !!(input && input.checked));
      });
      const personal = kind === "danger" || kind === "alert";
      root.querySelector("#aTargetWrap").classList.toggle("hidden", !personal);
    }
    function syncModeUi() {
      const mode = (root.querySelector('input[name="aMode"]:checked') || {}).value || "now";
      root.querySelectorAll(".mode-pills .kind-pill").forEach((el) => {
        const input = el.querySelector("input");
        el.classList.toggle("on", !!(input && input.checked));
      });
      root.querySelector("#aScheduleWrap").classList.toggle("hidden", mode !== "schedule");
      const btn = root.querySelector("#aCreate");
      if (btn) {
        btn.textContent =
          mode === "now" ? "ประกาศทันที" : mode === "schedule" ? "ตั้งเวลาประกาศ" : "บันทึกฉบับร่าง";
      }
    }
    root.querySelectorAll('input[name="aKind"]').forEach((el) => {
      el.onchange = syncKindUi;
    });
    root.querySelectorAll('input[name="aMode"]').forEach((el) => {
      el.onchange = syncModeUi;
    });
    syncKindUi();
    syncModeUi();

    root.querySelector("#aCreate").onclick = async () => {
      const title = root.querySelector("#aTitle").value.trim();
      const body = root.querySelector("#aBody").value.trim();
      const kind = (root.querySelector('input[name="aKind"]:checked') || {}).value || "info";
      const mode = (root.querySelector('input[name="aMode"]:checked') || {}).value || "now";
      const targets = root.querySelector("#aTargets").value;
      const startsRaw = root.querySelector("#aStarts").value;
      const endsRaw = root.querySelector("#aEnds").value;
      if (!title || !body) {
        root.querySelector("#aMsg").textContent = "กรอกหัวข้อและเนื้อหา";
        return;
      }
      if ((kind === "danger" || kind === "alert") && !targets.trim()) {
        root.querySelector("#aMsg").textContent = "กรอกเป้าหมาย (id / username / friend code)";
        return;
      }
      if (mode === "schedule" && !startsRaw) {
        root.querySelector("#aMsg").textContent = "เลือกเวลาเริ่มแสดง";
        return;
      }
      const payload = {
        title,
        body,
        kind,
        targets,
        mode,
        startsAt: startsRaw ? new Date(startsRaw).toISOString() : null,
        endsAt: endsRaw ? new Date(endsRaw).toISOString() : null
      };
      root.querySelector("#aMsg").textContent = "กำลังส่ง…";
      const r = await api("/api/v1/admin/announcements", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (!r.res.ok) {
        const err = r.data && r.data.error;
        root.querySelector("#aMsg").textContent =
          err === "targets_required"
            ? "ต้องระบุเป้าหมาย"
            : err === "starts_at_required"
              ? "เวลาเริ่มต้องเป็นอนาคต"
              : "สร้างไม่สำเร็จ";
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
        if (!(await confirmDialog("ลบประกาศ?", { danger: true }))) return;
        await api(`/api/v1/admin/announcements/${encodeURIComponent(btn.getAttribute("data-del"))}`, {
          method: "DELETE"
        });
        load();
      };
    });
  }
  await load();
}
