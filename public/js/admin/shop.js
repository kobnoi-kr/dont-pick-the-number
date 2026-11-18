import { api } from "/js/dashboard/api.js";
import { esc, hasPerm } from "./util.js";

const KIND_LABEL = { frame: "กรอบ", effect: "เอฟเฟกต์" };
const TIER_OPTS = [
  { value: "common", label: "Common" },
  { value: "uncommon", label: "Uncommon" },
  { value: "rare", label: "Rare" },
  { value: "epic", label: "Epic" },
  { value: "legendary", label: "Legendary" }
];
const MAX_IMAGE_BYTES = 1_400_000;

function itemTier(item) {
  if (!item) return "common";
  if (item.tier) return String(item.tier);
  if (item.meta && item.meta.tier) return String(item.meta.tier);
  return "common";
}

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

function usesSystemColor(item) {
  if (!item) return true;
  if (typeof item.useSystemColor === "boolean") return item.useSystemColor;
  if (item.meta && typeof item.meta.useSystemColor === "boolean") return item.meta.useSystemColor;
  return true;
}

function usesSystemEffect(item) {
  if (!item) return true;
  if (typeof item.useSystemEffect === "boolean") return item.useSystemEffect;
  if (item.meta && typeof item.meta.useSystemEffect === "boolean") return item.meta.useSystemEffect;
  return true;
}

function itemColor(item) {
  if (!item) return "#94a3b8";
  if (!usesSystemColor(item)) return "#94a3b8";
  if (item.meta && item.meta.color) return String(item.meta.color);
  if (String(item.cssClass || "").startsWith("frame-")) return "#fbbf24";
  if (String(item.cssClass || "").startsWith("effect-")) return "#a78bfa";
  return "#94a3b8";
}

function itemImage(item) {
  if (!item) return "";
  if (item.imageUrl) return String(item.imageUrl);
  if (item.meta && item.meta.imageUrl) return String(item.meta.imageUrl);
  return "";
}

function mediaHtml(url, kind) {
  if (!url) return "";
  const cls = kind === "frame" ? "cosmetic-frame-media" : "cosmetic-effect-media";
  return `<img class="${cls}" src="${esc(url)}" alt="" decoding="async" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<span class=\\'tiny muted\\'>รูปหาย — อัปโหลดใหม่</span>')">`;
}

function thumb(item) {
  const color = itemColor(item);
  const cls = usesSystemEffect(item) && item.cssClass ? " " + item.cssClass : "";
  const img = itemImage(item);
  if (item.kind === "frame") {
    return `<div class="dec-card-thumb${cls}${img ? " has-media" : ""}" style="--dec-accent:${esc(
      color
    )}">${mediaHtml(img, "frame")}<div class="dec-av-core"><span class="dec-av-letter">N</span></div></div>`;
  }
  return `<div class="dec-effect-shell"><div class="dec-av-core${cls}${img ? " has-media" : ""}" style="--dec-accent:${esc(
    color
  )}">${mediaHtml(img, "effect")}<span class="dec-av-letter">N</span></div></div>`;
}

function flagTogglesHtml(item) {
  const colorOn = usesSystemColor(item);
  const fxOn = usesSystemEffect(item);
  return `<div class="shop-flags">
    <label class="shop-flag"><input type="checkbox" data-flag-color ${colorOn ? "checked" : ""}> ใช้สีระบบ</label>
    <label class="shop-flag"><input type="checkbox" data-flag-effect ${fxOn ? "checked" : ""}> ใช้เอฟเฟกต์ระบบ</label>
  </div>`;
}

function canHardDelete(item) {
  return !!(item && item.adminCreated);
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
      return reject(new Error("invalid_file"));
    }
    if (file.size > MAX_IMAGE_BYTES) return reject(new Error("too_large"));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
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
  let pendingImage = "";
  let ptsCfg = {
    enabled: true,
    mode: "random",
    baseWin: 25,
    perHumanOpponent: 15,
    maxBonusHumans: 11,
    randomMin: 20,
    randomMax: 100
  };

  async function load() {
    const [shopRes, settingsRes] = await Promise.all([
      api("/api/v1/admin/cosmetics/shop", { method: "GET" }),
      api("/api/v1/admin/settings", { method: "GET" })
    ]);
    if (!shopRes.res.ok) {
      listed = [];
      catalog = [];
      msg = "โหลดแคตตาล็อกไม่ได้";
      msgOk = false;
      return;
    }
    listed = Array.isArray(shopRes.data.listed) ? shopRes.data.listed : [];
    catalog = Array.isArray(shopRes.data.catalog) ? shopRes.data.catalog : [];
    if (settingsRes.res.ok && settingsRes.data && settingsRes.data.settings) {
      const raw = settingsRes.data.settings.shop_pts;
      if (raw && typeof raw === "object") {
        ptsCfg = {
          enabled: raw.enabled !== false,
          mode: raw.mode === "formula" ? "formula" : "random",
          baseWin: Number(raw.baseWin) || 25,
          perHumanOpponent: Number(raw.perHumanOpponent) || 15,
          maxBonusHumans: Number(raw.maxBonusHumans) || 11,
          randomMin: Number(raw.randomMin) || 20,
          randomMax: Number(raw.randomMax) || 100
        };
      }
    }
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

  function paintMediaPreview() {
    const box = root.querySelector("#shopMediaPreview");
    if (!box) return;
    if (!pendingImage) {
      box.innerHTML = `<span class="tiny muted">ยังไม่มีรูป</span>`;
      return;
    }
    box.innerHTML = `<img src="${esc(pendingImage)}" alt="" style="max-width:96px;max-height:96px;border-radius:12px;object-fit:contain;background:rgba(0,0,0,.25)">`;
  }

  function paint() {
    const listedIds = new Set(listed.map((x) => x.id));
    const unlisted = catalog.filter((x) => !listedIds.has(x.id));
    const presets = PRESET_CSS[kind] || [];

    root.innerHTML = `
      <section class="page-head">
        <div>
          <h2 style="margin:0">Shop · กรอบ / เอฟเฟกต์</h2>
          <p class="muted" style="margin:6px 0 0">เพิ่มของลง Shop ได้ทั้งสไตล์ CSS และรูป/GIF — ของที่ตั้งราคาจะโชว์ในแคตตาล็อกผู้เล่น</p>
        </div>
        <div class="status-pill ${ptsCfg.enabled ? "ok" : "warn"}" style="font-size:0.95rem;padding:6px 12px">
          ${ptsCfg.enabled ? "Shop ผู้เล่นเปิดอยู่" : "Shop ผู้เล่นปิดอยู่"}
        </div>
      </section>

      ${
        ptsCfg.enabled
          ? ""
          : `<div class="card" style="margin-bottom:14px;border-color:rgba(251,191,36,.45);background:rgba(251,191,36,.08)">
              <h3 style="margin-top:0">Shop ยังไม่โชว์ให้ผู้เล่น</h3>
              <p class="muted" style="margin:0 0 12px">มีสินค้าในระบบแล้ว แต่สวิตช์เปิดขายยังปิด — กดปุ่มด้านล่างเพื่อเปิดที่ /app#shop</p>
              <button type="button" class="btn" id="shopOpenNowBtn">เปิด Shop ตอนนี้</button>
            </div>`
      }

      <div class="card">
        <h3 style="margin-top:0">ตั้งค่ารางวัล pts</h3>
        <p class="tiny muted" style="margin:0 0 10px">ชนะเกมได้ pts · ไม่นับบอท · เลือกโหมดสุ่มช่วง หรือสูตรตามจำนวนคนจริง</p>
        <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
          <label class="shop-flag" style="align-items:center">
            <input type="checkbox" id="ptsEnabled" ${ptsCfg.enabled ? "checked" : ""}>
            เปิดระบบ Shop / ให้ pts
          </label>
          <label>โหมดรางวัล
            <select class="input" id="ptsMode">
              <option value="random"${ptsCfg.mode !== "formula" ? " selected" : ""}>สุ่มช่วง</option>
              <option value="formula"${ptsCfg.mode === "formula" ? " selected" : ""}>สูตรตามคนจริง</option>
            </select>
          </label>
          <label>สุ่มต่ำสุด
            <input class="input" id="ptsRandomMin" type="number" min="0" max="100000" step="1" value="${ptsCfg.randomMin}">
          </label>
          <label>สุ่มสูงสุด
            <input class="input" id="ptsRandomMax" type="number" min="0" max="100000" step="1" value="${ptsCfg.randomMax}">
          </label>
          <label>pts พื้นฐานเมื่อชนะ
            <input class="input" id="ptsBase" type="number" min="0" max="100000" step="1" value="${ptsCfg.baseWin}">
          </label>
          <label>pts ต่อผู้เล่นจริงเพิ่ม
            <input class="input" id="ptsPer" type="number" min="0" max="100000" step="1" value="${ptsCfg.perHumanOpponent}">
          </label>
          <label>โบนัสสูงสุด (คน)
            <input class="input" id="ptsMaxHumans" type="number" min="0" max="32" step="1" value="${ptsCfg.maxBonusHumans}">
          </label>
        </div>
        <p class="tiny muted" style="margin:8px 0 0">โหมดสุ่มใช้แค่ต่ำสุด–สูงสุด · โหมดสูตรใช้ base / ต่อคน / เพดานคน</p>
        <div class="row-actions" style="margin-top:12px">
          <button type="button" class="btn sm" id="ptsSaveBtn">บันทึกตั้งค่า pts</button>
        </div>
        <hr style="border:0;border-top:1px solid var(--nv-border);margin:16px 0">
        <h4 style="margin:0 0 8px">เติม pts (ทดสอบ)</h4>
        <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
          <label>username / displayName / id
            <input class="input" id="ptsGrantUser" placeholder="เช่น Kim">
          </label>
          <label>จำนวน pts
            <input class="input" id="ptsGrantAmount" type="number" min="1" max="1000000" step="1" value="500">
          </label>
        </div>
        <div class="row-actions" style="margin-top:10px">
          <button type="button" class="btn ghost sm" id="ptsGrantBtn">เติม pts</button>
          <button type="button" class="btn ghost sm" id="ptsGrantSelfBtn">เติมให้ตัวเอง 500</button>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
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
          <label>Tier
            <select class="input" id="shopTier" name="tier">
              ${TIER_OPTS.map((t) => `<option value="${t.value}">${t.label}</option>`).join("")}
            </select>
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
          <label style="grid-column:1/-1">รูป / GIF
            <input class="input" id="shopImageFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
            <p class="tiny muted" style="margin:6px 0 0">รองรับ PNG · JPG · WEBP · GIF (สูงสุด ~1.4MB) — กรอบวางบนการ์ด · เอฟเฟกต์วางรอบรูปโปรไฟล์</p>
          </label>
          <div class="shop-flags" style="grid-column:1/-1">
            <label class="shop-flag"><input type="checkbox" id="shopUseColor" checked> ใช้สีระบบ</label>
            <label class="shop-flag"><input type="checkbox" id="shopUseEffect" checked> ใช้เอฟเฟกต์ระบบ</label>
          </div>
          <p class="tiny muted" style="grid-column:1/-1;margin:0">ปิดได้เมื่ออยากโชว์แค่รูป/GIF โดยไม่ติดขอบสีหรือแอนิเมชัน CSS ของระบบ</p>
          <div id="shopMediaPreview" style="grid-column:1/-1"></div>
        </form>
        <div class="row-actions" style="margin-top:12px">
          <button type="button" class="btn" id="shopCreateBtn">สร้างแล้วใส่ Shop</button>
          <button type="button" class="btn ghost" id="shopClearImage">ลบรูป</button>
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
                  <span class="tiny">${esc(KIND_LABEL[it.kind] || it.kind)} · ${esc(itemTier(it))}</span>
                  <b>${esc(it.name)}</b>
                  <span class="tiny muted">${esc(it.id)}</span>
                  ${itemImage(it) ? `<span class="tiny muted">มีรูป/GIF</span>` : ""}
                  <label class="tiny" style="display:flex;gap:6px;align-items:center;margin-top:6px">ราคา
                    <input class="input" data-price-input type="number" min="0" max="1000000" step="1" value="${
                      it.shopPrice != null ? it.shopPrice : 0
                    }" style="width:96px">
                  </label>
                  <label class="tiny" style="display:block;margin-top:6px">Tier
                    <select class="input" data-tier>
                      ${TIER_OPTS.map(
                        (t) =>
                          `<option value="${t.value}"${itemTier(it) === t.value ? " selected" : ""}>${t.label}</option>`
                      ).join("")}
                    </select>
                  </label>
                  ${flagTogglesHtml(it)}
                  <label class="tiny" style="display:block;margin-top:8px">เปลี่ยนรูป/GIF
                    <input class="input" data-image-file type="file" accept="image/png,image/jpeg,image/webp,image/gif">
                  </label>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
                    <button type="button" class="btn sm" data-save-item>บันทึก</button>
                    <button type="button" class="btn ghost sm" data-clear-image>ลบรูป</button>
                    <button type="button" class="btn ghost sm" data-unlist>เอาออกจาก Shop</button>
                    ${
                      canHardDelete(it)
                        ? `<button type="button" class="btn ghost sm danger-outline" data-delete>ลบถาวร</button>`
                        : ""
                    }
                  </div>
                </div>`
                )
                .join("")}</div>`
            : `<p class="empty" style="margin-top:10px">ยังไม่มีสินค้าใน Shop — สร้างใหม่หรือเพิ่มจากรายการด้านล่าง</p>`
        }
      </div>

      <div class="card" style="margin-top:14px">
        <h3 style="margin-top:0">ยังไม่ลง Shop (${unlisted.length})</h3>
        <p class="tiny muted">กรอบ/เอฟเฟกต์ที่มีในระบบแต่ยังไม่มีราคา · ของที่สร้างเองลบถาวรได้</p>
        ${
          unlisted.length
            ? `<div class="dec-grid" style="margin-top:12px">${unlisted
                .map(
                  (it) => `<div class="dec-item shop-item" data-id="${esc(it.id)}">
                  ${thumb(it)}
                  <span class="tiny">${esc(KIND_LABEL[it.kind] || it.kind)} · ${esc(itemTier(it))}</span>
                  <b>${esc(it.name)}</b>
                  <span class="tiny muted">${esc(it.description || it.id)}</span>
                  <label class="tiny" style="display:flex;gap:6px;align-items:center;margin-top:6px">ราคา
                    <input class="input" data-price-input type="number" min="0" max="1000000" step="1" value="100" style="width:96px">
                  </label>
                  <label class="tiny" style="display:block;margin-top:6px">Tier
                    <select class="input" data-tier>
                      ${TIER_OPTS.map(
                        (t) =>
                          `<option value="${t.value}"${itemTier(it) === t.value ? " selected" : ""}>${t.label}</option>`
                      ).join("")}
                    </select>
                  </label>
                  ${flagTogglesHtml(it)}
                  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
                    <button type="button" class="btn sm" data-list>ใส่ Shop</button>
                    <button type="button" class="btn ghost sm" data-save-flags>บันทึกตั้งค่า</button>
                    ${
                      canHardDelete(it)
                        ? `<button type="button" class="btn ghost sm danger-outline" data-delete>ลบถาวร</button>`
                        : ""
                    }
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
    paintMediaPreview();

    root.querySelector("#shopKind").onchange = (e) => {
      kind = e.target.value === "effect" ? "effect" : "frame";
      paint();
    };

    root.querySelector("#shopRefresh").onclick = async () => {
      await load();
      paint();
      setMsg("รีเฟรชแล้ว", true);
    };

    async function savePtsConfig(payload, okText) {
      const { res, data } = await api("/api/v1/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ settings: { shop_pts: payload } })
      });
      if (!res.ok) {
        setMsg(((data && data.error) || "บันทึกตั้งค่า pts ไม่สำเร็จ") + "", false);
        return false;
      }
      ptsCfg = payload;
      msg = okText || "บันทึกตั้งค่า pts แล้ว";
      msgOk = true;
      paint();
      return true;
    }

    function readPtsForm(enabledOverride) {
      const modeEl = root.querySelector("#ptsMode");
      return {
        enabled:
          enabledOverride != null
            ? !!enabledOverride
            : !!(root.querySelector("#ptsEnabled") && root.querySelector("#ptsEnabled").checked),
        mode: modeEl && modeEl.value === "formula" ? "formula" : "random",
        randomMin: Number(root.querySelector("#ptsRandomMin") && root.querySelector("#ptsRandomMin").value),
        randomMax: Number(root.querySelector("#ptsRandomMax") && root.querySelector("#ptsRandomMax").value),
        baseWin: Number(root.querySelector("#ptsBase") && root.querySelector("#ptsBase").value),
        perHumanOpponent: Number(root.querySelector("#ptsPer") && root.querySelector("#ptsPer").value),
        maxBonusHumans: Number(
          root.querySelector("#ptsMaxHumans") && root.querySelector("#ptsMaxHumans").value
        )
      };
    }

    const ptsSave = root.querySelector("#ptsSaveBtn");
    if (ptsSave) {
      ptsSave.onclick = async () => {
        await savePtsConfig(readPtsForm(), "บันทึกตั้งค่า pts แล้ว");
      };
    }
    const openNow = root.querySelector("#shopOpenNowBtn");
    if (openNow) {
      openNow.onclick = async () => {
        await savePtsConfig(readPtsForm(true), "เปิด Shop แล้ว — รีเฟรช /app#shop ได้เลย");
      };
    }

    async function grantPts(body) {
      const { res, data } = await api("/api/v1/admin/shop-pts/grant", {
        method: "POST",
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        setMsg(((data && data.error) || "เติม pts ไม่สำเร็จ") + "", false);
        return;
      }
      setMsg(
        "เติม +" +
          (data.gain || 0) +
          " pts ให้ " +
          ((data.user && (data.user.displayName || data.user.username)) || "ผู้ใช้") +
          " (คงเหลือ " +
          (data.balance != null ? data.balance : "?") +
          ")",
        true
      );
    }

    const grantBtn = root.querySelector("#ptsGrantBtn");
    if (grantBtn) {
      grantBtn.onclick = async () => {
        const q = (root.querySelector("#ptsGrantUser") && root.querySelector("#ptsGrantUser").value) || "";
        const amount = Number(root.querySelector("#ptsGrantAmount") && root.querySelector("#ptsGrantAmount").value);
        if (!String(q).trim()) {
          setMsg("ใส่ username / ชื่อ / id ก่อน", false);
          return;
        }
        await grantPts({ q: String(q).trim(), amount });
      };
    }
    const grantSelf = root.querySelector("#ptsGrantSelfBtn");
    if (grantSelf) {
      grantSelf.onclick = async () => {
        await grantPts({ self: true, amount: 500 });
      };
    }

    root.querySelector("#shopClearImage").onclick = () => {
      pendingImage = "";
      const file = root.querySelector("#shopImageFile");
      if (file) file.value = "";
      paintMediaPreview();
    };

    root.querySelector("#shopImageFile").onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        pendingImage = await readImageFile(file);
        paintMediaPreview();
        setMsg("เลือกรูปแล้ว — กดสร้างเพื่อบันทึก", true);
      } catch (err) {
        pendingImage = "";
        paintMediaPreview();
        setMsg(
          err && err.message === "too_large" ? "ไฟล์ใหญ่เกินไป (สูงสุด ~1.4MB)" : "อ่านรูปไม่สำเร็จ",
          false
        );
      }
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
      const useSystemColor = !!(root.querySelector("#shopUseColor") && root.querySelector("#shopUseColor").checked);
      const useSystemEffect = !!(root.querySelector("#shopUseEffect") && root.querySelector("#shopUseEffect").checked);
      const tier = (root.querySelector("#shopTier") && root.querySelector("#shopTier").value) || "common";
      const body = {
        kind,
        name,
        shopPrice: price,
        description: description || undefined,
        cssClass: cssClass || undefined,
        color: color || undefined,
        id: id || undefined,
        imageUrl: pendingImage || undefined,
        useSystemColor,
        useSystemEffect,
        tier
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
              : err === "invalid_image" || err === "body_too_large"
                ? "รูปไม่ถูกต้องหรือใหญ่เกินไป"
                : "สร้างไม่สำเร็จ (" + err + ")",
          false
        );
        return;
      }
      pendingImage = "";
      msg = "สร้างและใส่ Shop แล้ว: " + ((data.item && data.item.name) || name);
      msgOk = true;
      await load();
      paint();
    };

    async function patchItem(cosmeticId, patch, okText) {
      const { res, data } = await api("/api/v1/admin/cosmetics/shop", {
        method: "PATCH",
        body: JSON.stringify(Object.assign({ cosmeticId }, patch))
      });
      if (!res.ok) {
        setMsg(((data && data.error) || "บันทึกไม่สำเร็จ") + "", false);
        return false;
      }
      msg = okText || "บันทึกแล้ว";
      msgOk = true;
      await load();
      paint();
      return true;
    }

    function readFlags(card) {
      const tierEl = card && card.querySelector("[data-tier]");
      return {
        useSystemColor: !!(card && card.querySelector("[data-flag-color]") && card.querySelector("[data-flag-color]").checked),
        useSystemEffect: !!(card && card.querySelector("[data-flag-effect]") && card.querySelector("[data-flag-effect]").checked),
        tier: (tierEl && tierEl.value) || "common"
      };
    }

    root.querySelectorAll("[data-save-item]").forEach((btn) => {
      btn.onclick = async () => {
        const card = btn.closest("[data-id]");
        const cosmeticId = card && card.getAttribute("data-id");
        const input = card && card.querySelector("[data-price-input]");
        const shopPrice = Number(input && input.value);
        if (!cosmeticId || !Number.isFinite(shopPrice) || shopPrice < 0 || Math.floor(shopPrice) !== shopPrice) {
          setMsg("ราคาไม่ถูกต้อง", false);
          return;
        }
        await patchItem(cosmeticId, Object.assign({ shopPrice }, readFlags(card)), "บันทึกราคาและตั้งค่าแล้ว");
      };
    });

    root.querySelectorAll("[data-save-flags]").forEach((btn) => {
      btn.onclick = async () => {
        const card = btn.closest("[data-id]");
        const cosmeticId = card && card.getAttribute("data-id");
        if (!cosmeticId) return;
        await patchItem(cosmeticId, readFlags(card), "บันทึกตั้งค่าแล้ว");
      };
    });

    root.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.onclick = async () => {
        const card = btn.closest("[data-id]");
        const cosmeticId = card && card.getAttribute("data-id");
        if (!cosmeticId) return;
        if (!confirm("ลบถาวรรายการนี้? ผู้เล่นที่สวมอยู่จะถูกถอดออก และกู้คืนไม่ได้")) return;
        const { res, data } = await api("/api/v1/admin/cosmetics/shop", {
          method: "DELETE",
          body: JSON.stringify({ cosmeticId })
        });
        if (!res.ok) {
          const err = (data && data.error) || "";
          setMsg(
            err === "starter_cosmetic" || err === "protected_cosmetic"
              ? "ของระบบลบถาวรไม่ได้ — เอาออกจาก Shop ได้"
              : "ลบไม่สำเร็จ",
            false
          );
          return;
        }
        msg = "ลบถาวรแล้ว";
        msgOk = true;
        await load();
        paint();
      };
    });

    root.querySelectorAll("[data-image-file]").forEach((input) => {
      input.onchange = async () => {
        const card = input.closest("[data-id]");
        const cosmeticId = card && card.getAttribute("data-id");
        const file = input.files && input.files[0];
        if (!cosmeticId || !file) return;
        try {
          const imageUrl = await readImageFile(file);
          const { res, data } = await api("/api/v1/admin/cosmetics/shop", {
            method: "PATCH",
            body: JSON.stringify({ cosmeticId, imageUrl })
          });
          if (!res.ok) {
            setMsg(
              (data && data.error) === "body_too_large" || (data && data.error) === "invalid_image"
                ? "อัปโหลดรูปไม่สำเร็จ — ไฟล์ใหญ่หรือชนิดไม่รองรับ"
                : "อัปโหลดรูปไม่สำเร็จ",
              false
            );
            return;
          }
          msg = "อัปเดตรูปแล้ว";
          msgOk = true;
          await load();
          paint();
        } catch (err) {
          setMsg(
            err && err.message === "too_large" ? "ไฟล์ใหญ่เกินไป (สูงสุด ~1.4MB)" : "อ่านรูปไม่สำเร็จ",
            false
          );
        }
      };
    });

    root.querySelectorAll("[data-clear-image]").forEach((btn) => {
      btn.onclick = async () => {
        const card = btn.closest("[data-id]");
        const cosmeticId = card && card.getAttribute("data-id");
        if (!cosmeticId) return;
        const { res } = await api("/api/v1/admin/cosmetics/shop", {
          method: "PATCH",
          body: JSON.stringify({ cosmeticId, imageUrl: "" })
        });
        if (!res.ok) {
          setMsg("ลบรูปไม่สำเร็จ", false);
          return;
        }
        msg = "ลบรูปแล้ว";
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
        const { res, data } = await api("/api/v1/admin/cosmetics/shop", {
          method: "PATCH",
          body: JSON.stringify({ cosmeticId, shopPrice: null })
        });
        if (!res.ok) {
          setMsg(((data && data.error) || "เอาออกไม่สำเร็จ") + "", false);
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
        await patchItem(
          cosmeticId,
          Object.assign({ shopPrice }, readFlags(card)),
          "ใส่ Shop แล้ว"
        );
      };
    });
  }

  root.innerHTML = `<div class="loading">Loading…</div>`;
  await load();
  paint();
}
