import { api } from "/js/dashboard/api.js";
import { esc, hasPerm } from "./util.js";

const KIND_LABEL = { frame: "กรอบ", effect: "เอฟเฟกต์" };

const PRESET_CSS = {
  frame: [
    { value: "frame-gold", label: "ทอง" },
    { value: "frame-neon", label: "นีออน" },
    { value: "frame-ice", label: "น้ำแข็ง" },
    { value: "frame-crimson", label: "แดงโลหิต" }
  ],
  effect: [
    { value: "effect-sparkle", label: "ประกาย" },
    { value: "effect-pulse", label: "ชีพจร" },
    { value: "effect-ring", label: "วงแหวน" },
    { value: "effect-flame", label: "เปลวไฟ" }
  ]
};

function itemColor(item) {
  if (!item) return "#94a3b8";
  if (item.meta && item.meta.color) return String(item.meta.color);
  if (String(item.cssClass || "").startsWith("frame-")) return "#fbbf24";
  if (String(item.cssClass || "").startsWith("effect-")) return "#a78bfa";
  return "#94a3b8";
}

function thumb(item) {
  const color = itemColor(item);
  const cls = item.cssClass ? " " + item.cssClass : "";
  if (item.kind === "frame") {
    return `<div class="dec-card-thumb${cls}" style="--dec-accent:${esc(
      color
    )}"><div class="dec-av-core"><span class="dec-av-letter">N</span></div></div>`;
  }
  return `<div class="dec-effect-shell"><div class="dec-av-core${cls}" style="--dec-accent:${esc(
    color
  )}"><span class="dec-av-letter">N</span></div></div>`;
}

export async function renderShopAdmin(root, { user }) {
  const canManage =
    hasPerm(user, "cosmetics.gift") ||
    hasPerm(user, "users.ban") ||
    hasPerm(user, "settings.view");
  if (!canManage) {
    root.innerHTML = `<div class="empty">ไม่มีสิทธิ์จัดการ Shop</div>`;
    return;
  }

  let listed = [];
  let catalog = [];
  let kind = "frame";
  let msg = "";
  let msgOk = false;

  async function load() {
    const { res, data } = await api("/api/v1/admin/cosmetics/shop", { method: "GET" });
    if (!res.ok) {
      listed = [];
      catalog = [];
      msg = "โหลดแคตตาล็อกไม่ได้";
      msgOk = false;
      return;
    }
    listed = Array.isArray(data.listed) ? data.listed : [];
    catalog = Array.isArray(data.catalog) ? data.catalog : [];
  }

  function setMsg(text, ok) {
    msg = text || "";
    msgOk = !!ok;
    const el = root.querySelector("#shopAdminMsg");
    if (el) {
      el.textContent = msg;
      el.className = "msg" + (msgOk ? " ok" : "");
    }
  }

  function paint() {
    const listedIds = new Set(listed.map((x) => x.id));
    const unlisted = catalog.filter((x) => !listedIds.has(x.id));
    const presets = PRESET_CSS[kind] || [];

    root.innerHTML = `
      <section class="page-head">
        <div>
          <h2 style="margin:0">Shop · กรอบ / เอฟเฟกต์</h2>
          <p class="muted" style="margin:6px 0 0">เพิ่มของลง Shop หรือตั้งราคาให้รายการที่มีอยู่ — ของที่ตั้งราคาจะโชว์ในแคตตาล็อกผู้เล่น</p>
        </div>
      </section>

      <div class="card">
        <h3 style="margin-top:0">สร้างกรอบ / เอฟเฟกต์ใหม่</h3>
        <form id="shopCreateForm" class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
          <label>ประเภท
            <select class="input" id="shopKind" name="kind">
              <option value="frame" ${kind === "frame" ? "selected" : ""}>กรอบ</option>
              <option value="effect" ${kind === "effect" ? "selected" : ""}>เอฟเฟกต์</option>
            </select>
          </label>
          <label>ชื่อ
            <input class="input" id="shopName" name="name" maxlength="64" required placeholder="เช่น กรอบมุก">
          </label>
          <label>ราคา Shop (pts)
            <input class="input" id="shopPrice" name="shopPrice" type="number" min="0" max="1000000" step="1" value="100" required>
          </label>
          <label>สี (hex)
            <input class="input" id="shopColor" name="color" maxlength="7" placeholder="#fbbf24" value="#fbbf24">
          </label>
          <label>สไตล์ (cssClass)
            <select class="input" id="shopCss" name="cssClass">
              ${presets
                .map((p) => `<option value="${esc(p.value)}">${esc(p.label)} (${esc(p.value)})</option>`)
                .join("")}
              <option value="">กำหนดอัตโนมัติ</option>
            </select>
          </label>
          <label style="grid-column:1/-1">คำอธิบาย
            <input class="input" id="shopDesc" name="description" maxlength="255" placeholder="สั้นๆ">
          </label>
          <label>ID (ว่างได้)
            <input class="input" id="shopId" name="id" maxlength="64" placeholder="frame.my-item">
          </label>
        </form>
        <div class="row-actions" style="margin-top:12px">
          <button type="button" class="btn" id="shopCreateBtn">สร้างแล้วใส่ Shop</button>
          <p class="msg" id="shopAdminMsg" style="margin:0">${esc(msg)}</p>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <div class="row-between" style="align-items:center;gap:10px;flex-wrap:wrap">
          <h3 style="margin:0">ใน Shop ตอนนี้ (${listed.length})</h3>
          <button type="button" class="btn ghost sm" id="shopRefresh">รีเฟรช</button>
        </div>
        ${
          listed.length
            ? `<div class="dec-grid" style="margin-top:12px">${listed
                .map(
                  (it) => `<div class="dec-item shop-item" data-id="${esc(it.id)}">
                  ${thumb(it)}
                  <span class="tiny">${esc(KIND_LABEL[it.kind] || it.kind)}</span>
                  <b>${esc(it.name)}</b>
                  <span class="tiny muted">${esc(it.id)}</span>
                  <label class="tiny" style="display:flex;gap:6px;align-items:center;margin-top:6px">ราคา
                    <input class="input" data-price-input type="number" min="0" max="1000000" step="1" value="${
                      it.shopPrice != null ? it.shopPrice : 0
                    }" style="width:96px">
                  </label>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
                    <button type="button" class="btn sm" data-save-price>บันทึกราคา</button>
                    <button type="button" class="btn ghost sm" data-unlist>เอาออกจาก Shop</button>
                  </div>
                </div>`
                )
                .join("")}</div>`
            : `<p class="empty" style="margin-top:10px">ยังไม่มีสินค้าใน Shop — สร้างใหม่หรือเพิ่มจากรายการด้านล่าง</p>`
        }
      </div>

      <div class="card" style="margin-top:14px">
        <h3 style="margin-top:0">ยังไม่ลง Shop (${unlisted.length})</h3>
        <p class="tiny muted">กรอบ/เอฟเฟกต์ที่มีในระบบแต่ยังไม่มีราคา</p>
        ${
          unlisted.length
            ? `<div class="dec-grid" style="margin-top:12px">${unlisted
                .map(
                  (it) => `<div class="dec-item shop-item" data-id="${esc(it.id)}">
                  ${thumb(it)}
                  <span class="tiny">${esc(KIND_LABEL[it.kind] || it.kind)}</span>
                  <b>${esc(it.name)}</b>
                  <span class="tiny muted">${esc(it.description || it.id)}</span>
                  <label class="tiny" style="display:flex;gap:6px;align-items:center;margin-top:6px">ราคา
                    <input class="input" data-price-input type="number" min="0" max="1000000" step="1" value="100" style="width:96px">
                  </label>
                  <div style="margin-top:8px">
                    <button type="button" class="btn sm" data-list>ใส่ Shop</button>
                  </div>
                </div>`
                )
                .join("")}</div>`
            : `<p class="empty" style="margin-top:10px">ทุกรายการอยู่ใน Shop แล้ว</p>`
        }
      </div>
    `;

    const msgEl = root.querySelector("#shopAdminMsg");
    if (msgEl && msg) {
      msgEl.className = "msg" + (msgOk ? " ok" : "");
    }

    root.querySelector("#shopKind").onchange = (e) => {
      kind = e.target.value === "effect" ? "effect" : "frame";
      paint();
    };

    root.querySelector("#shopRefresh").onclick = async () => {
      await load();
      paint();
      setMsg("รีเฟรชแล้ว", true);
    };

    root.querySelector("#shopCreateBtn").onclick = async () => {
      const name = root.querySelector("#shopName").value.trim();
      const price = Number(root.querySelector("#shopPrice").value);
      const color = root.querySelector("#shopColor").value.trim();
      const cssClass = root.querySelector("#shopCss").value.trim();
      const description = root.querySelector("#shopDesc").value.trim();
      const id = root.querySelector("#shopId").value.trim();
      if (!name) {
        setMsg("ใส่ชื่อก่อน", false);
        return;
      }
      if (!Number.isFinite(price) || price < 0 || Math.floor(price) !== price) {
        setMsg("ราคาไม่ถูกต้อง", false);
        return;
      }
      const body = {
        kind,
        name,
        shopPrice: price,
        description: description || undefined,
        cssClass: cssClass || undefined,
        color: color || undefined,
        id: id || undefined
      };
      const { res, data } = await api("/api/v1/admin/cosmetics", {
        method: "POST",
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const err = (data && data.error) || "create_failed";
        setMsg(
          err === "cosmetic_exists"
            ? "ID ซ้ำ — เปลี่ยนชื่อหรือใส่ ID ใหม่"
            : err === "invalid_id"
              ? "ID ไม่ถูกต้อง"
              : "สร้างไม่สำเร็จ (" + err + ")",
          false
        );
        return;
      }
      msg = "สร้างและใส่ Shop แล้ว: " + ((data.item && data.item.name) || name);
      msgOk = true;
      await load();
      paint();
    };

    root.querySelectorAll("[data-save-price]").forEach((btn) => {
      btn.onclick = async () => {
        const card = btn.closest("[data-id]");
        const cosmeticId = card && card.getAttribute("data-id");
        const input = card && card.querySelector("[data-price-input]");
        const shopPrice = Number(input && input.value);
        if (!cosmeticId || !Number.isFinite(shopPrice) || shopPrice < 0 || Math.floor(shopPrice) !== shopPrice) {
          setMsg("ราคาไม่ถูกต้อง", false);
          return;
        }
        const { res, data } = await api("/api/v1/admin/cosmetics/shop", {
          method: "PATCH",
          body: JSON.stringify({ cosmeticId, shopPrice })
        });
        if (!res.ok) {
          setMsg("บันทึกราคาไม่สำเร็จ", false);
          return;
        }
        msg = "อัปเดตราคาแล้ว";
        msgOk = true;
        await load();
        paint();
      };
    });

    root.querySelectorAll("[data-unlist]").forEach((btn) => {
      btn.onclick = async () => {
        const card = btn.closest("[data-id]");
        const cosmeticId = card && card.getAttribute("data-id");
        if (!cosmeticId) return;
        if (!confirm("เอาออกจาก Shop? (ของยังอยู่ในระบบ แค่ไม่โชว์ราคา)")) return;
        const { res } = await api("/api/v1/admin/cosmetics/shop", {
          method: "PATCH",
          body: JSON.stringify({ cosmeticId, shopPrice: null })
        });
        if (!res.ok) {
          setMsg("เอาออกไม่สำเร็จ", false);
          return;
        }
        msg = "เอาออกจาก Shop แล้ว";
        msgOk = true;
        await load();
        paint();
      };
    });

    root.querySelectorAll("[data-list]").forEach((btn) => {
      btn.onclick = async () => {
        const card = btn.closest("[data-id]");
        const cosmeticId = card && card.getAttribute("data-id");
        const input = card && card.querySelector("[data-price-input]");
        const shopPrice = Number(input && input.value);
        if (!cosmeticId || !Number.isFinite(shopPrice) || shopPrice < 0 || Math.floor(shopPrice) !== shopPrice) {
          setMsg("ราคาไม่ถูกต้อง", false);
          return;
        }
        const { res } = await api("/api/v1/admin/cosmetics/shop", {
          method: "PATCH",
          body: JSON.stringify({ cosmeticId, shopPrice })
        });
        if (!res.ok) {
          setMsg("ใส่ Shop ไม่สำเร็จ", false);
          return;
        }
        msg = "ใส่ Shop แล้ว";
        msgOk = true;
        await load();
        paint();
      };
    });
  }

  root.innerHTML = `<div class="loading">Loading…</div>`;
  await load();
  paint();
}
