import { api } from "/js/dashboard/api.js";
import { esc, fmtDate } from "./util.js";

function statusLabel(s) {
  if (s === "open") return '<span class="pill ok">ใหม่</span>';
  if (s === "read") return '<span class="pill busy">อ่านแล้ว</span>';
  if (s === "closed") return '<span class="pill">ปิดแล้ว</span>';
  return `<span class="pill">${esc(s)}</span>`;
}

export async function renderInbox(root) {
  root.innerHTML = `
    <div class="card">
      <div class="row-between" style="margin-bottom:12px">
        <div>
          <h2 style="margin:0">ข้อความติดต่อแอดมิน</h2>
          <p class="muted tiny" style="margin:6px 0 0">ตอบกลับแล้วผู้ใช้จะได้รับการแจ้งเตือน และคลิกอ่านแบบ popup ได้</p>
        </div>
        <select class="input" id="inboxStatus" style="max-width:160px">
          <option value="">ทั้งหมด</option>
          <option value="open">ใหม่</option>
          <option value="read">อ่านแล้ว</option>
          <option value="closed">ปิดแล้ว</option>
        </select>
      </div>
      <div id="inboxList" class="loading">Loading…</div>
    </div>
  `;

  async function load() {
    const status = root.querySelector("#inboxStatus").value;
    const params = new URLSearchParams({ limit: "100" });
    if (status) params.set("status", status);
    const box = root.querySelector("#inboxList");
    box.innerHTML = `<div class="loading">Loading…</div>`;
    const { res, data } = await api("/api/v1/admin/inbox?" + params.toString(), { method: "GET" });
    if (!res.ok) {
      box.innerHTML = `<div class="empty">โหลดไม่ได้</div>`;
      return;
    }
    const messages = data.messages || [];
    const openCount = data.openCount != null ? data.openCount : 0;
    box.innerHTML = `
      <p class="tiny" style="margin:0 0 10px;color:var(--nv-muted)">ข้อความใหม่รออ่าน: ${openCount}</p>
      <div class="room-card-list">
        ${
          messages.length
            ? messages
                .map((m) => {
                  const who = m.user
                    ? `${m.user.displayName || m.user.username} (@${m.user.username})`
                    : "ผู้ใช้ถูกลบแล้ว";
                  return `<article class="room-card" data-id="${esc(m.id)}">
              <div class="room-card-top">
                <div class="room-card-title">
                  <b>${esc(m.subject || "ติดต่อแอดมิน")}</b>
                  <div class="tiny">${esc(who)} · ${esc(fmtDate(m.createdAt))}</div>
                </div>
                ${statusLabel(m.status)}
              </div>
              <p style="margin:10px 0 0;white-space:pre-wrap;line-height:1.5;color:var(--nv-text-2);font-size:0.92rem">${esc(m.message)}</p>
              ${
                m.adminReply
                  ? `<div style="margin-top:10px;padding:10px;border-radius:12px;border:1px solid rgba(86,119,252,.3);background:rgba(86,119,252,.08)">
                      <div class="tiny" style="color:#93c5fd;margin-bottom:4px">ตอบแล้ว · ${esc(fmtDate(m.repliedAt))}</div>
                      <div style="white-space:pre-wrap;line-height:1.45">${esc(m.adminReply)}</div>
                    </div>`
                  : ""
              }
              <label class="tiny" style="display:block;margin-top:12px">ตอบกลับผู้ใช้
                <textarea class="input" data-reply rows="3" maxlength="2000" placeholder="พิมพ์คำตอบ…"></textarea>
              </label>
              <div class="room-card-actions">
                <button type="button" class="btn sm" data-send-reply>ส่งคำตอบ</button>
                ${m.status !== "read" ? `<button type="button" class="btn ghost sm" data-set="read">อ่านแล้ว</button>` : ""}
                ${m.status !== "open" ? `<button type="button" class="btn ghost sm" data-set="open">เปิดใหม่</button>` : ""}
                ${m.status !== "closed" ? `<button type="button" class="btn ghost sm" data-set="closed">ปิด</button>` : ""}
                <span class="tiny" data-msg></span>
              </div>
            </article>`;
                })
                .join("")
            : `<div class="empty">ยังไม่มีข้อความ</div>`
        }
      </div>`;

    box.querySelectorAll("[data-set]").forEach((btn) => {
      btn.onclick = async () => {
        const card = btn.closest("[data-id]");
        const id = card && card.getAttribute("data-id");
        if (!id) return;
        btn.disabled = true;
        await api(`/api/v1/admin/inbox/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status: btn.getAttribute("data-set") })
        });
        await load();
      };
    });

    box.querySelectorAll("[data-send-reply]").forEach((btn) => {
      btn.onclick = async () => {
        const card = btn.closest("[data-id]");
        const id = card && card.getAttribute("data-id");
        const ta = card && card.querySelector("[data-reply]");
        const msg = card && card.querySelector("[data-msg]");
        if (!id || !ta) return;
        const reply = (ta.value || "").trim();
        if (reply.length < 2) {
          if (msg) msg.textContent = "พิมพ์คำตอบก่อน";
          return;
        }
        btn.disabled = true;
        if (msg) msg.textContent = "กำลังส่ง…";
        const r = await api(`/api/v1/admin/inbox/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ reply })
        });
        btn.disabled = false;
        if (!r.res.ok) {
          if (msg) msg.textContent = "ส่งไม่สำเร็จ";
          return;
        }
        if (msg) msg.textContent = "ส่งแล้ว — ผู้ใช้จะเห็นในการแจ้งเตือน";
        await load();
      };
    });
  }

  root.querySelector("#inboxStatus").onchange = load;
  await load();
}
