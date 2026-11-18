import { api } from "/js/dashboard/api.js";
import { esc, hasPerm } from "./util.js";

const KIND_LABEL = { title: "ยศ", frame: "กรอบ", effect: "เอฟเฟกต์" };

function itemColor(item) {
  if (!item) return "#94a3b8";
  if (item.meta && item.meta.color) return String(item.meta.color);
  if (item.cssClass === "title-weekly-1" || item.cssClass === "title-monthly-1") return "#fbbf24";
  if (item.cssClass === "title-weekly-2" || item.cssClass === "title-monthly-2") return "#cbd5e1";
  if (item.cssClass === "title-weekly-3" || item.cssClass === "title-monthly-3") return "#cd7f32";
  if (String(item.cssClass || "").startsWith("frame-")) return "#fbbf24";
  if (String(item.cssClass || "").startsWith("effect-")) return "#a78bfa";
  return "#94a3b8";
}

function thumb(item) {
  const color = itemColor(item);
  if (item.kind === "title") {
    return `<span class="dec-title-pill dec-title-pill-sm" style="--title-color:${esc(color)};border-color:${esc(
      color
    )};color:${esc(color)}">${esc(item.name)}</span>`;
  }
  const cls = item.cssClass ? " " + item.cssClass : "";
  if (item.kind === "frame") {
    return `<div class="dec-frame-shell${cls}" style="--dec-accent:${esc(
      color
    )}"><div class="dec-av-core"><span class="dec-av-letter">N</span></div></div>`;
  }
  return `<div class="dec-effect-shell"><div class="dec-av-core${cls}" style="--dec-accent:${esc(
    color
  )}"><span class="dec-av-letter">N</span></div></div>`;
}

export async function renderGift(root, { user }) {
  const canGift = hasPerm(user, "cosmetics.gift") || hasPerm(user, "users.ban");
  if (!canGift) {
    root.innerHTML = `<div class="empty">ไม่มีสิทธิ์ Gift ของตกแต่ง</div>`;
    return;
  }

  root.innerHTML = `<div class="loading">Loading…</div>`;
  const cat = await api("/api/v1/admin/cosmetics", { method: "GET" });
  if (!cat.res.ok) {
    root.innerHTML = `<div class="empty">โหลดแคตตาล็อกไม่ได้</div>`;
    return;
  }
  const items = Array.isArray(cat.data && cat.data.items) ? cat.data.items : [];

  let selectedUser = null;
  let selectedCosmeticId = "";
  let kindFilter = "all";

  function paint() {
    const filtered =
      kindFilter === "all" ? items : items.filter((it) => it.kind === kindFilter);
    const selected = items.find((it) => it.id === selectedCosmeticId) || null;

    root.innerHTML = `
      <section class="page-head">
        <div>
          <h2 style="margin:0">Gift</h2>
          <p class="muted" style="margin:6px 0 0">มอบยศ · กรอบ · เอฟเฟกต์ ให้ผู้เล่นแบบ manual เวลา auto มีปัญหา</p>
        </div>
      </section>

      <div class="gift-layout">
        <div class="card">
          <h3 style="margin-top:0">1) หาผู้เล่น</h3>
          <div class="toolbar">
            <input class="input" id="giftQ" placeholder="ค้นหา username / ชื่อ / friend code" />
            <button type="button" class="btn sm" id="giftSearch">ค้นหา</button>
          </div>
          <div id="giftUserList" class="gift-user-list" style="margin-top:12px">
            ${
              selectedUser
                ? `<div class="gift-user-card on">
                     <b>${esc(selectedUser.displayName || selectedUser.username)}</b>
                     <span class="tiny muted">@${esc(selectedUser.username)}</span>
                     <span class="tiny">เลือกแล้ว</span>
                   </div>`
                : `<p class="tiny muted" style="margin:0">ยังไม่ได้เลือกผู้เล่น</p>`
            }
          </div>
        </div>

        <div class="card">
          <h3 style="margin-top:0">2) เลือกของ</h3>
          <div class="gift-kind-tabs" id="giftKinds">
            ${["all", "title", "frame", "effect"]
              .map((k) => {
                const label = k === "all" ? "ทั้งหมด" : KIND_LABEL[k];
                return `<button type="button" class="btn ghost sm${kindFilter === k ? " on" : ""}" data-kind="${k}">${label}</button>`;
              })
              .join("")}
          </div>
          <div class="gift-item-grid" id="giftItems">
            ${
              filtered.length
                ? filtered
                    .map((it) => {
                      const on = selectedCosmeticId === it.id;
                      return `<button type="button" class="gift-item-card${on ? " on" : ""}" data-id="${esc(it.id)}">
                        <div class="gift-item-thumb">${thumb(it)}</div>
                        <span class="tiny">${esc(KIND_LABEL[it.kind] || it.kind)}</span>
                        <b>${esc(it.name)}</b>
                        <span class="tiny muted">${esc(it.description || it.id)}</span>
                      </button>`;
                    })
                    .join("")
                : `<div class="empty">ไม่มีของในหมวดนี้</div>`
            }
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <h3 style="margin-top:0">3) ส่งมอบ</h3>
        <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
          <div>
            <div class="tiny muted">ผู้รับ</div>
            <b>${
              selectedUser
                ? esc((selectedUser.displayName || selectedUser.username) + " @" + selectedUser.username)
                : "—"
            }</b>
          </div>
          <div>
            <div class="tiny muted">ของที่เลือก</div>
            <b>${selected ? esc(KIND_LABEL[selected.kind] + " · " + selected.name) : "—"}</b>
          </div>
        </div>
        <label style="display:block;margin-top:12px">หมายเหตุถึงผู้เล่น (ถ้ามี)
          <input class="input" id="giftNote" maxlength="200" placeholder="เช่น ชดเชยยศ Weekly ที่ระบบพลาด">
        </label>
        <label class="check-row" style="margin-top:10px">
          <input type="checkbox" id="giftAutoEquip">
          <span>สวมให้อัตโนมัติหลังมอบ</span>
        </label>
        <div class="row-actions" style="margin-top:14px">
          <button type="button" class="btn" id="giftSend" ${selectedUser && selected ? "" : "disabled"}>มอบของ</button>
          <p class="msg" id="giftMsg" style="margin:0"></p>
        </div>
      </div>
    `;

    const msg = root.querySelector("#giftMsg");
    function setMsg(text, ok) {
      msg.textContent = text || "";
      msg.classList.toggle("ok", !!ok);
    }

    root.querySelector("#giftSearch").onclick = async () => {
      const q = root.querySelector("#giftQ").value.trim();
      const box = root.querySelector("#giftUserList");
      if (!q) {
        setMsg("ใส่คำค้นหาก่อน", false);
        return;
      }
      box.innerHTML = `<div class="loading">Searching…</div>`;
      const params = new URLSearchParams({ q });
      const { res, data } = await api("/api/v1/admin/users?" + params.toString(), { method: "GET" });
      if (!res.ok) {
        box.innerHTML = `<div class="empty">ค้นหาไม่สำเร็จ</div>`;
        return;
      }
      const users = (data.users || []).filter((u) => u.accountType === "registered");
      if (!users.length) {
        box.innerHTML = `<div class="empty">ไม่พบผู้เล่น</div>`;
        return;
      }
      box.innerHTML = users
        .slice(0, 12)
        .map(
          (u) => `<button type="button" class="gift-user-card${selectedUser && selectedUser.id === u.id ? " on" : ""}" data-uid="${esc(u.id)}">
            <b>${esc(u.displayName || u.username)}</b>
            <span class="tiny muted">@${esc(u.username)}</span>
            <span class="tiny">${esc(u.status || "")}</span>
          </button>`
        )
        .join("");
      box.querySelectorAll("[data-uid]").forEach((btn) => {
        btn.onclick = () => {
          const id = btn.getAttribute("data-uid");
          selectedUser = users.find((u) => u.id === id) || null;
          paint();
        };
      });
    };

    root.querySelectorAll("#giftKinds [data-kind]").forEach((btn) => {
      btn.onclick = () => {
        kindFilter = btn.getAttribute("data-kind") || "all";
        paint();
      };
    });

    root.querySelectorAll("#giftItems [data-id]").forEach((btn) => {
      btn.onclick = () => {
        selectedCosmeticId = btn.getAttribute("data-id") || "";
        paint();
      };
    });

    const sendBtn = root.querySelector("#giftSend");
    if (sendBtn) {
      sendBtn.onclick = async () => {
        if (!selectedUser || !selectedCosmeticId) return;
        sendBtn.disabled = true;
        setMsg("กำลังมอบ…", true);
        const note = root.querySelector("#giftNote").value.trim();
        const autoEquip = root.querySelector("#giftAutoEquip").checked;
        const r = await api("/api/v1/admin/cosmetics/gift", {
          method: "POST",
          body: JSON.stringify({
            userId: selectedUser.id,
            cosmeticId: selectedCosmeticId,
            autoEquip,
            note
          })
        });
        sendBtn.disabled = false;
        if (!r.res.ok) {
          setMsg((r.data && r.data.error) || "มอบไม่สำเร็จ", false);
          return;
        }
        const name = r.data && r.data.cosmetic ? r.data.cosmetic.name : "ของ";
        const owned = r.data && r.data.alreadyOwned ? " (มีอยู่แล้ว — ยืนยันให้)" : "";
        const eq = r.data && r.data.equipped ? " · สวมให้แล้ว" : "";
        setMsg("มอบ「" + name + "」ให้ @" + selectedUser.username + " แล้ว" + owned + eq, true);
      };
    }
  }

  paint();
}
