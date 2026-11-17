import { api } from "./api.js";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

const KIND_LABEL = { title: "ยศ", frame: "กรอบ", effect: "เอฟเฟกต์" };

export async function renderDecorate(root, { user } = {}) {
  const guest = !user || user.accountType === "guest";
  root.innerHTML = `
    <section class="page-head">
      <div>
        <h2 style="margin:0">ตกแต่งโปรไฟล์</h2>
        <p class="muted" style="margin:6px 0 0">ใส่ยศ · กรอบ · เอฟเฟกต์ (ของที่ได้รับจาก Ranking / Shop)</p>
      </div>
    </section>
    ${
      guest
        ? `<div class="card empty">เข้าสู่ระบบด้วยบัญชีจริงเพื่อตกแต่งโปรไฟล์</div>`
        : `<p class="msg" id="decMsg"></p>
           <div class="content-grid">
             <div class="card">
               <h3 style="margin-top:0">ที่สวมอยู่</h3>
               <div id="decEquipped" class="dec-equipped"><div class="loading">Loading…</div></div>
             </div>
             <div class="card">
               <h3 style="margin-top:0">คลังของฉัน</h3>
               <div id="decOwned" class="dec-grid"><div class="loading">Loading…</div></div>
             </div>
           </div>`
    }
  `;
  if (guest) return;

  const msg = root.querySelector("#decMsg");
  function setMsg(text, ok) {
    msg.textContent = text || "";
    msg.classList.toggle("ok", !!ok);
  }

  async function load() {
    const { res, data } = await api("/api/v1/cosmetics/me", { method: "GET" });
    const eqBox = root.querySelector("#decEquipped");
    const ownBox = root.querySelector("#decOwned");
    if (!res.ok) {
      eqBox.innerHTML = `<div class="empty">โหลดไม่สำเร็จ</div>`;
      ownBox.innerHTML = "";
      return;
    }
    const eq = data.equipped || {};
    eqBox.innerHTML = ["title", "frame", "effect"]
      .map((kind) => {
        const item = eq[kind];
        return `<div class="dec-eq-row">
          <span class="tiny">${KIND_LABEL[kind]}</span>
          <b>${item ? esc(item.name) : "—"}</b>
        </div>`;
      })
      .join("");

    const owned = data.owned || [];
    if (!owned.length) {
      ownBox.innerHTML = `<div class="empty">ยังไม่มีของตกแต่ง</div>`;
      return;
    }
    ownBox.innerHTML = owned
      .map((item) => {
        const equipped =
          (eq.title && eq.title.id === item.id) ||
          (eq.frame && eq.frame.id === item.id) ||
          (eq.effect && eq.effect.id === item.id);
        return `<button type="button" class="dec-item${equipped ? " on" : ""}" data-id="${esc(item.id)}">
          <span class="tiny">${esc(KIND_LABEL[item.kind] || item.kind)}</span>
          <b>${esc(item.name)}</b>
          <span class="tiny muted">${esc(item.description || item.source || "")}</span>
          <span class="dec-wear">${equipped ? "สวมอยู่" : "สวมใส่"}</span>
        </button>`;
      })
      .join("");

    ownBox.querySelectorAll("[data-id]").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.getAttribute("data-id");
        const r = await api("/api/v1/cosmetics/equip", {
          method: "POST",
          body: JSON.stringify({ cosmeticId: id })
        });
        setMsg(r.res.ok ? "สวมใส่แล้ว" : (r.data && r.data.error) || "ไม่สำเร็จ", r.res.ok);
        if (r.res.ok) load();
      };
    });
  }

  await load();
}
