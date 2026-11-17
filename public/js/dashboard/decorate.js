import { api } from "./api.js";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

const KIND_LABEL = { title: "ยศ", frame: "กรอบ", effect: "เอฟเฟกต์" };

function itemColor(item) {
  if (!item) return "#94a3b8";
  if (item.meta && item.meta.color) return String(item.meta.color);
  if (item.cssClass === "title-weekly-1" || item.cssClass === "title-monthly-1") return "#fbbf24";
  if (item.cssClass === "title-weekly-2" || item.cssClass === "title-monthly-2") return "#cbd5e1";
  if (item.cssClass === "title-weekly-3" || item.cssClass === "title-monthly-3") return "#cd7f32";
  if (item.cssClass === "frame-gold") return "#fbbf24";
  if (item.cssClass === "effect-sparkle") return "#a78bfa";
  return "#94a3b8";
}

function avHtml(user, letter) {
  if (user && user.avatarUrl) {
    return `<img class="dec-av-img" src="${esc(user.avatarUrl)}" alt="" referrerpolicy="no-referrer">`;
  }
  return `<span class="dec-av-letter">${esc(letter || "?")}</span>`;
}

function titlePillHtml(item, sizeClass) {
  const color = itemColor(item);
  const cls = [
    "dec-title-pill",
    sizeClass || "",
    item && item.cssClass ? item.cssClass : ""
  ]
    .filter(Boolean)
    .join(" ");
  return `<span class="${esc(cls)}" style="--title-color:${esc(color)};border-color:${esc(
    color
  )};color:${esc(color)}">${esc((item && item.name) || "—")}</span>`;
}

function thumbHtml(item, user) {
  const kind = item && item.kind;
  const color = itemColor(item);
  const letter = ((user && (user.displayName || user.username)) || "?").slice(0, 1).toUpperCase();
  if (kind === "title") {
    return titlePillHtml(item, "dec-title-pill-sm");
  }
  if (kind === "frame") {
    const cls = item && item.cssClass ? " " + item.cssClass : "";
    return `<div class="dec-thumb-av-wrap${cls}" style="--dec-accent:${esc(color)}">${avHtml(user, letter)}</div>`;
  }
  if (kind === "effect") {
    const cls = item && item.cssClass ? " " + item.cssClass : "";
    return `<div class="dec-thumb-av-wrap effect${cls}" style="--dec-accent:${esc(color)}">${avHtml(user, letter)}</div>`;
  }
  return `<span class="tiny">—</span>`;
}

function previewHtml(user, eq) {
  const name = (user && (user.displayName || user.username)) || "ผู้เล่น";
  const uname = user && user.username ? "@" + user.username : "@—";
  const letter = String(name).slice(0, 1).toUpperCase();
  const title = eq.title;
  const frame = eq.frame;
  const effect = eq.effect;
  const frameCls = frame && frame.cssClass ? " " + frame.cssClass : "";
  const effectCls = effect && effect.cssClass ? " " + effect.cssClass : "";
  return `
    <div class="dec-preview-card">
      <div class="dec-preview-head">
        <div class="dec-preview-av-wrap${frameCls}${effectCls}" style="--dec-accent:${esc(itemColor(frame))}">
          ${avHtml(user, letter)}
        </div>
        <div class="dec-preview-id">
          <b class="dec-preview-name">${esc(name)}</b>
          <span class="dec-preview-user">${esc(uname)}</span>
          <div class="nv-pills dec-preview-pills">
            ${titlePillHtml(title, "dec-title-pill-md")}
            ${frame ? `<span class="nv-pill">${esc(frame.name)}</span>` : ""}
            ${
              effect && effect.cssClass
                ? `<span class="nv-pill">${esc(effect.name)}</span>`
                : ""
            }
          </div>
        </div>
      </div>
      <p class="tiny muted" style="margin:12px 0 0">พรีวิวว่าคนอื่นจะเห็นโปรไฟล์คุณแบบนี้</p>
    </div>
  `;
}

export async function renderDecorate(root, { user } = {}) {
  const guest = !user || user.accountType === "guest";
  root.innerHTML = `
    <section class="page-head">
      <div>
        <h2 style="margin:0">ตกแต่งโปรไฟล์</h2>
        <p class="muted" style="margin:6px 0 0">ใส่ยศ · กรอบ · เอฟเฟกต์ — ยศเลเวลเก็บได้เรื่อยๆ ไม่ถูกลบ</p>
      </div>
    </section>
    ${
      guest
        ? `<div class="card empty">เข้าสู่ระบบด้วยบัญชีจริงเพื่อตกแต่งโปรไฟล์</div>`
        : `<p class="msg" id="decMsg"></p>
           <div class="dec-layout">
             <div class="card">
               <h3 style="margin-top:0">ที่สวมอยู่</h3>
               <div id="decEquipped" class="dec-equipped"><div class="loading">Loading…</div></div>
             </div>
             <div class="card">
               <h3 style="margin-top:0">พรีวิวโปรไฟล์</h3>
               <div id="decPreview"><div class="loading">Loading…</div></div>
             </div>
           </div>
           <div class="card" style="margin-top:14px">
             <h3 style="margin-top:0">คลังของฉัน</h3>
             <p class="tiny muted" style="margin:0 0 10px">กดการ์ดเพื่อสวมใส่ · ของที่ยศเลเวลปลดล็อกจะอยู่ที่นี่ถาวร</p>
             <div id="decOwned" class="dec-inv-grid"><div class="loading">Loading…</div></div>
           </div>`
    }
  `;
  if (guest) return;

  const msg = root.querySelector("#decMsg");
  function setMsg(text, ok) {
    msg.textContent = text || "";
    msg.classList.toggle("ok", !!ok);
  }

  let owned = [];
  let equipped = {};
  let busy = false;

  function paint() {
    const eqBox = root.querySelector("#decEquipped");
    const ownBox = root.querySelector("#decOwned");
    const preview = root.querySelector("#decPreview");
    const eq = equipped || {};
    if (preview) preview.innerHTML = previewHtml(user, eq);

    if (eqBox) {
      eqBox.innerHTML = ["title", "frame", "effect"]
        .map((kind) => {
          const item = eq[kind];
          return `<div class="dec-eq-row">
            <div class="dec-eq-visual">${thumbHtml(item, user)}</div>
            <div class="dec-eq-meta">
              <span class="tiny">${KIND_LABEL[kind]}</span>
              <b>${item ? esc(item.name) : "—"}</b>
            </div>
          </div>`;
        })
        .join("");
    }

    if (!ownBox) return;
    if (!owned.length) {
      ownBox.innerHTML = `<div class="empty">ยังไม่มีของตกแต่ง</div>`;
      return;
    }
    ownBox.innerHTML = owned
      .map((item) => {
        const isOn =
          (eq.title && eq.title.id === item.id) ||
          (eq.frame && eq.frame.id === item.id) ||
          (eq.effect && eq.effect.id === item.id);
        const srcLabel =
          item.source === "level"
            ? "ยศเลเวล"
            : item.source === "ranking_weekly" || item.source === "ranking_monthly"
              ? "Ranking"
              : item.source === "starter"
                ? "เริ่มต้น"
                : item.source || "";
        return `<button type="button" class="dec-inv-card${isOn ? " on" : ""}" data-id="${esc(item.id)}"${
          busy ? " disabled" : ""
        }>
          <div class="dec-inv-thumb">${thumbHtml(item, user)}</div>
          <span class="tiny">${esc(KIND_LABEL[item.kind] || item.kind)}</span>
          <b>${esc(item.name)}</b>
          <span class="tiny muted">${esc(srcLabel)}</span>
          <span class="dec-wear">${isOn ? "สวมอยู่" : "สวมใส่"}</span>
        </button>`;
      })
      .join("");

    ownBox.querySelectorAll("[data-id]").forEach((btn) => {
      btn.onclick = async () => {
        if (busy) return;
        const id = btn.getAttribute("data-id");
        const item = owned.find((x) => x.id === id);
        if (!item) return;

        const prev = {
          title: equipped.title || null,
          frame: equipped.frame || null,
          effect: equipped.effect || null
        };
        // Optimistic: update equipped + preview immediately.
        equipped = Object.assign({}, equipped, { [item.kind]: item });
        if (user) user.equipped = equipped;
        busy = true;
        paint();
        setMsg("กำลังสวมใส่…", true);

        const r = await api("/api/v1/cosmetics/equip", {
          method: "POST",
          body: JSON.stringify({ cosmeticId: id })
        });
        busy = false;
        if (r.res.ok && r.data) {
          owned = Array.isArray(r.data.owned) ? r.data.owned : owned;
          equipped = r.data.equipped || equipped;
          if (user) user.equipped = equipped;
          setMsg("สวมใส่แล้ว", true);
          paint();
          return;
        }
        equipped = prev;
        if (user) user.equipped = equipped;
        setMsg((r.data && r.data.error) || "ไม่สำเร็จ", false);
        paint();
      };
    });
  }

  async function load() {
    const { res, data } = await api("/api/v1/cosmetics/me", { method: "GET" });
    const eqBox = root.querySelector("#decEquipped");
    const ownBox = root.querySelector("#decOwned");
    const preview = root.querySelector("#decPreview");
    if (!res.ok) {
      if (eqBox) eqBox.innerHTML = `<div class="empty">โหลดไม่สำเร็จ</div>`;
      if (ownBox) ownBox.innerHTML = "";
      if (preview) preview.innerHTML = "";
      return;
    }
    owned = Array.isArray(data.owned) ? data.owned : [];
    equipped = data.equipped || {};
    if (user) user.equipped = equipped;
    paint();
  }

  await load();
}
