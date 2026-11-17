import { api } from "/js/dashboard/api.js";
import { esc, fmtDate } from "./util.js";

function statusLabel(s) {
  if (s === "open") return '<span class="pill ok">ใหม่</span>';
  if (s === "read") return '<span class="pill busy">อ่านแล้ว</span>';
  if (s === "closed") return '<span class="pill">ปิดแล้ว</span>';
  return `<span class="pill">${esc(s)}</span>`;
}

function isSafeImageData(src) {
  return typeof src === "string" && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(src);
}

export async function renderInbox(root, opts = {}) {
  const onOpenCount = typeof opts.onOpenCount === "function" ? opts.onOpenCount : null;

  root.innerHTML = `
    <section class="page-head">
      <div>
        <h2 style="margin:0">ข้อความติดต่อแอดมิน</h2>
        <p class="muted tiny" id="inboxOpenHint" style="margin:6px 0 0">กำลังโหลด…</p>
      </div>
      <select class="input" id="inboxStatus" style="max-width:160px">
        <option value="">ทั้งหมด</option>
        <option value="open">ใหม่</option>
        <option value="read">อ่านแล้ว</option>
        <option value="closed">ปิดแล้ว</option>
      </select>
    </section>
    <div id="inboxList" class="loading">Loading…</div>
  `;

  async function load() {
    const status = root.querySelector("#inboxStatus").value;
    const params = new URLSearchParams({ limit: "100" });
    if (status) params.set("status", status);
    const box = root.querySelector("#inboxList");
    const hint = root.querySelector("#inboxOpenHint");
    box.innerHTML = `<div class="loading">Loading…</div>`;
    const { res, data } = await api("/api/v1/admin/inbox?" + params.toString(), { method: "GET" });
    if (!res.ok) {
      box.innerHTML = `<div class="empty">โหลดไม่ได้</div>`;
      return;
    }
    const messages = data.messages || [];
    const openCount = data.openCount != null ? data.openCount : 0;
    if (onOpenCount) onOpenCount(openCount);
    if (hint) hint.textContent = `ข้อความใหม่รออ่าน: ${openCount}`;

    if (!messages.length) {
      box.innerHTML = `<div class="card empty">ยังไม่มีข้อความ</div>`;
      return;
    }

    box.innerHTML = `
      <div class="inbox-card-grid">
        ${messages
          .map((m) => {
            const who = m.user
              ? `${m.user.displayName || m.user.username} (@${m.user.username})`
              : "ผู้ใช้ถูกลบแล้ว";
            const img = isSafeImageData(m.imageData)
              ? `<img class="inbox-attach" src="${m.imageData}" alt="แนบรูป" loading="lazy">`
              : "";
            return `<article class="inbox-card${m.status === "open" ? " open-msg" : ""}" data-id="${esc(m.id)}">
              <div class="room-card-top">
                <div class="room-card-title">
                  <b>${esc(m.subject || "ติดต่อแอดมิน")}</b>
                  <div class="tiny">${esc(who)} · ${esc(fmtDate(m.createdAt))}</div>
                </div>
                ${statusLabel(m.status)}
              </div>
              <p class="inbox-body">${esc(m.message)}</p>
              ${img}
              ${
                m.adminReply
                  ? `<div class="inbox-reply-box">
                      <div class="tiny" style="color:#93c5fd;margin-bottom:4px">ตอบแล้ว · ${esc(fmtDate(m.repliedAt))}</div>
                      <div style="white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;line-height:1.45">${esc(m.adminReply)}</div>
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
          .join("")}
      </div>`;

    box.querySelectorAll(".inbox-attach").forEach((img) => {
      img.onclick = () => window.open(img.src, "_blank", "noopener");
    });

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
        if (msg) msg.textContent = "ส่งแล้ว";
        await load();
      };
    });
  }

  root.querySelector("#inboxStatus").onchange = load;
  await load();
}
