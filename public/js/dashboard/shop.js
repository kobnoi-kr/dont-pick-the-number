import { api } from "./api.js";
import { paintUser } from "./shell.js";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

const KIND_LABEL = { frame: "กรอบ", effect: "เอฟเฟกต์", service: "บริการ" };
const TIERS = [
  { id: "all", label: "ทั้งหมด" },
  { id: "common", label: "Common" },
  { id: "uncommon", label: "Uncommon" },
  { id: "rare", label: "Rare" },
  { id: "epic", label: "Epic" },
  { id: "legendary", label: "Legendary" }
];

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
  return `<img class="${cls}" src="${esc(url)}" alt="" decoding="async" onerror="this.remove()">`;
}

function thumb(item, letter) {
  const color = itemColor(item);
  const cls = usesSystemEffect(item) && item.cssClass ? " " + item.cssClass : "";
  const img = itemImage(item);
  const L = esc(letter || "N");
  if (item.kind === "frame") {
    return `<div class="dec-card-thumb${cls}${img ? " has-media" : ""}" style="--dec-accent:${esc(
      color
    )}">${mediaHtml(img, "frame")}<div class="dec-av-core"><span class="dec-av-letter">${L}</span></div></div>`;
  }
  return `<div class="dec-effect-shell"><div class="dec-av-core${cls}${img ? " has-media" : ""}" style="--dec-accent:${esc(
    color
  )}">${mediaHtml(img, "effect")}<span class="dec-av-letter">${L}</span></div></div>`;
}

function previewCard(item, user) {
  const name = (user && (user.displayName || user.username)) || "ผู้เล่น";
  const letter = String(name).slice(0, 1).toUpperCase();
  const color = itemColor(item);
  const cls = usesSystemEffect(item) && item.cssClass ? " " + item.cssClass : "";
  const img = itemImage(item);
  if (item.kind === "effect") {
    return `<div class="shop-preview-stage">
      <div class="dec-effect-shell dec-preview-av">
        <div class="dec-av-core${cls}${img ? " has-media" : ""}" style="--dec-accent:${esc(color)}">
          ${mediaHtml(img, "effect")}
          <span class="dec-av-letter">${esc(letter)}</span>
        </div>
      </div>
      <p class="tiny muted">พรีวิวเอฟเฟกต์บนโปรไฟล์</p>
    </div>`;
  }
  return `<div class="shop-preview-stage">
    <div class="dec-preview-card dec-profile-card${cls}${img ? " has-media" : ""}" style="--dec-accent:${esc(color)}">
      ${mediaHtml(img, "frame")}
      <div class="dec-preview-head">
        <div class="dec-effect-shell dec-preview-av">
          <div class="dec-av-core"><span class="dec-av-letter">${esc(letter)}</span></div>
        </div>
        <div class="dec-preview-id">
          <b class="dec-preview-name">${esc(name)}</b>
          <span class="dec-preview-user">@${esc((user && user.username) || "player")}</span>
        </div>
      </div>
      <p class="tiny muted" style="margin:12px 0 0">พรีวิวกรอบบนการ์ดโปรไฟล์</p>
    </div>
  </div>`;
}

export async function renderShop(root, { user, onSaved } = {}) {
  const guest = !user || user.accountType === "guest";
  let kindFilter = "all";
  let tierFilter = "all";
  let items = [];
  let services = [];
  let owned = new Set();
  let shopPts = (user && user.shopPts) || 0;
  let enabled = true;
  let rewards = null;
  let selectedId = "";

  root.innerHTML = `
    <section class="page-head">
      <div>
        <h2 style="margin:0">Shop</h2>
        <p class="muted" style="margin:6px 0 0">ซื้อกรอบ · เอฟเฟกต์ · เปลี่ยน username ด้วย pts</p>
      </div>
      <div class="shop-balance" id="shopBalance" title="คะแนน Shop">0 pts</div>
    </section>
    <p class="tiny muted" id="shopEarnHint" style="margin:-6px 0 12px">ได้ pts เมื่อชนะเกม · คนจริงในล็อบบี้เยอะ ได้เยอะขึ้น (ไม่นับบอท) · ซื้อของต้องบัญชีจริง</p>
    <p class="msg" id="shopMsg"></p>
    <div id="shopBody"><div class="loading">Loading…</div></div>
  `;

  const msgEl = root.querySelector("#shopMsg");
  function setMsg(text, ok) {
    msgEl.textContent = text || "";
    msgEl.classList.toggle("ok", !!ok);
  }

  function paintBalance() {
    const el = root.querySelector("#shopBalance");
    if (el) el.textContent = `${Number(shopPts) || 0} pts`;
  }

  function catalogAll() {
    return items.concat(services);
  }

  function filtered() {
    return catalogAll().filter((it) => {
      if (kindFilter !== "all" && it.kind !== kindFilter) return false;
      if (it.kind === "service") return true;
      if (tierFilter !== "all" && (it.tier || "common") !== tierFilter) return false;
      return true;
    });
  }

  function selectedItem() {
    return catalogAll().find((x) => x.id === selectedId) || filtered()[0] || null;
  }

  function serviceThumb() {
    return `<div class="dec-card-thumb shop-service-thumb" style="--dec-accent:#60a5fa"><div class="dec-av-core"><span class="dec-av-letter">@</span></div></div>`;
  }

  function paint() {
    const body = root.querySelector("#shopBody");
    if (!body) return;
    paintBalance();

    if (!enabled) {
      const isAdmin = !!(user && (user.role === "SUPER_ADMIN" || user.role === "ADMIN"));
      body.innerHTML = `<div class="card shop-soon">
        <h3 style="margin-top:0">Shop ปิดชั่วคราว</h3>
        <p class="muted" style="margin:0">แอดมินยังไม่เปิดขาย — กลับมาดูใหม่ภายหลัง</p>
        ${
          isAdmin
            ? `<p class="tiny" style="margin:12px 0 0">เปิดได้ที่ <a href="/admin#shop">Admin → Shop</a> แล้วกด「เปิด Shop ตอนนี้」หรือติ๊ก「เปิดระบบ Shop / ให้ pts」แล้วบันทึก</p>`
            : ""
        }
      </div>`;
      return;
    }

    const list = filtered();
    const sel = selectedItem();
    if (sel) selectedId = sel.id;

    body.innerHTML = `
      <div class="shop-layout">
        <div class="card shop-catalog-card">
          <div class="shop-filters">
            <div class="shop-tabs" role="tablist" aria-label="ประเภท">
              <button type="button" class="shop-tab${kindFilter === "all" ? " on" : ""}" data-kind="all">ทั้งหมด</button>
              <button type="button" class="shop-tab${kindFilter === "frame" ? " on" : ""}" data-kind="frame">กรอบ</button>
              <button type="button" class="shop-tab${kindFilter === "effect" ? " on" : ""}" data-kind="effect">เอฟเฟกต์</button>
              <button type="button" class="shop-tab${kindFilter === "service" ? " on" : ""}" data-kind="service">บริการ</button>
            </div>
            <div class="shop-tier-tabs" role="tablist" aria-label="Tier">
              ${TIERS.map(
                (t) =>
                  `<button type="button" class="shop-tier-tab tier-${t.id}${
                    tierFilter === t.id ? " on" : ""
                  }" data-tier="${t.id}">${esc(t.label)}</button>`
              ).join("")}
            </div>
          </div>
          ${
            list.length
              ? `<div class="shop-grid">${list
                  .map((it) => {
                    const isService = it.kind === "service";
                    const isOwned = !isService && owned.has(it.id);
                    const on = sel && sel.id === it.id;
                    const letter = ((user && (user.displayName || user.username)) || "N").slice(0, 1);
                    return `<button type="button" class="shop-card tier-${esc(it.tier || "common")}${
                      on ? " on" : ""
                    }${isOwned ? " owned" : ""}" data-pick="${esc(it.id)}">
                      ${
                        isService
                          ? serviceThumb()
                          : `<div class="shop-card-thumb">${thumb(it, letter)}</div>`
                      }
                      <span class="shop-tier-pill tier-${esc(it.tier || "common")}">${esc(
                        isService ? "บริการ" : it.tierLabel || it.tier || "Common"
                      )}</span>
                      <span class="tiny">${esc(KIND_LABEL[it.kind] || it.kind)}</span>
                      <b>${esc(it.name)}</b>
                      <span class="shop-price">${it.shopPrice != null ? it.shopPrice + " pts" : "—"}</span>
                      ${isOwned ? `<span class="shop-owned-tag">มีแล้ว</span>` : ""}
                    </button>`;
                  })
                  .join("")}</div>`
              : `<p class="empty">ยังไม่มีสินค้าในหมวดนี้</p>`
          }
          ${
            rewards
              ? rewards.mode === "formula"
                ? `<p class="tiny muted shop-reward-hint">ชนะได้ ${rewards.baseWin} pts + ${rewards.perHumanOpponent} pts ต่อผู้เล่นจริงในล็อบบี้ (ไม่นับบอท)</p>`
                : `<p class="tiny muted shop-reward-hint">ชนะแล้วสุ่มได้ ${rewards.randomMin ?? 20}–${rewards.randomMax ?? 100} pts</p>`
              : ""
          }
        </div>
        <div class="card shop-preview-card">
          <h3 style="margin-top:0">พรีวิว</h3>
          ${
            sel && sel.kind === "service" && sel.id === "service.username"
              ? `<div class="shop-preview-meta">
                   <span class="shop-tier-pill tier-rare">บริการ</span>
                   <b>${esc(sel.name)}</b>
                   <p class="muted tiny" style="margin:6px 0 0">${esc(sel.description || "")}</p>
                   <p class="tiny muted" style="margin:8px 0 0">ตอนนี้: <b>@${esc((user && user.username) || "—")}</b></p>
                   <p class="shop-preview-price">${sel.shopPrice != null ? sel.shopPrice + " pts" : "—"}</p>
                   ${
                     guest
                       ? `<p class="tiny muted">เข้าสู่ระบบด้วยบัญชีจริงเพื่อใช้บริการ</p>`
                       : `<label class="tiny" style="display:block;margin-top:10px">Username ใหม่
                            <input class="input" id="shopUsernameInput" maxlength="64" placeholder="เช่น kim_01" value="">
                          </label>
                          <p class="tiny muted" style="margin:6px 0 0">ใช้ a–z, 0–9, . _ - · ยาว 2–64 ตัว · เปลี่ยนแล้วไม่โรลแบค</p>
                          <div class="shop-preview-actions" style="margin-top:12px">
                            <button type="button" class="btn" id="shopRenameBtn">จ่าย ${sel.shopPrice} pts แล้วเปลี่ยน</button>
                          </div>`
                   }
                 </div>`
              : sel
                ? `${previewCard(sel, user)}
                 <div class="shop-preview-meta">
                   <span class="shop-tier-pill tier-${esc(sel.tier || "common")}">${esc(
                     sel.tierLabel || sel.tier || "Common"
                   )}</span>
                   <b>${esc(sel.name)}</b>
                   <p class="muted tiny" style="margin:6px 0 0">${esc(sel.description || "")}</p>
                   <p class="shop-preview-price">${sel.shopPrice != null ? sel.shopPrice + " pts" : "—"}</p>
                 </div>
                 <div class="shop-preview-actions">
                   ${
                     guest
                       ? `<p class="tiny muted">เข้าสู่ระบบด้วยบัญชีจริงเพื่อซื้อ</p>`
                       : owned.has(sel.id)
                         ? `<button type="button" class="btn" disabled>มีในคลังแล้ว</button>
                            <a class="btn ghost" href="#decorate">ไปตกแต่ง</a>`
                         : `<button type="button" class="btn" id="shopBuyBtn">ซื้อ ${
                             sel.shopPrice != null ? sel.shopPrice + " pts" : ""
                           }</button>`
                   }
                 </div>`
                : `<p class="empty">เลือกสินค้าเพื่อดูพรีวิว</p>`
          }
        </div>
      </div>
    `;

    body.querySelectorAll("[data-kind]").forEach((btn) => {
      btn.onclick = () => {
        kindFilter = btn.getAttribute("data-kind") || "all";
        paint();
      };
    });
    body.querySelectorAll("[data-tier]").forEach((btn) => {
      btn.onclick = () => {
        tierFilter = btn.getAttribute("data-tier") || "all";
        paint();
      };
    });
    body.querySelectorAll("[data-pick]").forEach((btn) => {
      btn.onclick = () => {
        selectedId = btn.getAttribute("data-pick") || "";
        paint();
      };
    });
    const buy = body.querySelector("#shopBuyBtn");
    if (buy && sel) {
      buy.onclick = async () => {
        if (!confirm(`ซื้อ「${sel.name}」ราคา ${sel.shopPrice} pts?`)) return;
        buy.disabled = true;
        const { res, data } = await api("/api/v1/shop/buy", {
          method: "POST",
          body: JSON.stringify({ cosmeticId: sel.id })
        });
        if (!res.ok) {
          const err = (data && data.error) || "";
          setMsg(
            err === "insufficient_pts"
              ? "pts ไม่พอ"
              : err === "already_owned"
                ? "มีของชิ้นนี้อยู่แล้ว"
                : err === "registered_required"
                  ? "ต้องเข้าสู่ระบบด้วยบัญชีจริง"
                  : err === "shop_disabled"
                    ? "Shop ปิดอยู่"
                    : "ซื้อไม่สำเร็จ",
            false
          );
          buy.disabled = false;
          return;
        }
        shopPts = data.shopPts != null ? data.shopPts : shopPts - (sel.shopPrice || 0);
        if (user) user.shopPts = shopPts;
        try {
          paintUser(user);
        } catch (_) {}
        owned.add(sel.id);
        setMsg("ซื้อสำเร็จ — ไปสวมใส่ได้ที่เมนู ตกแต่ง", true);
        paint();
      };
    }

    const renameBtn = body.querySelector("#shopRenameBtn");
    if (renameBtn && sel) {
      renameBtn.onclick = async () => {
        const input = body.querySelector("#shopUsernameInput");
        const next = String((input && input.value) || "").trim();
        if (!/^[a-zA-Z0-9._-]{2,64}$/.test(next)) {
          setMsg("Username ใช้ได้แค่ a–z 0–9 . _ - และยาว 2–64 ตัว", false);
          return;
        }
        if (!confirm(`จ่าย ${sel.shopPrice} pts เพื่อเปลี่ยนเป็น @${next}?`)) return;
        renameBtn.disabled = true;
        const { res, data } = await api("/api/v1/shop/username", {
          method: "POST",
          body: JSON.stringify({ username: next })
        });
        if (!res.ok) {
          const err = (data && data.error) || "";
          setMsg(
            err === "insufficient_pts"
              ? "pts ไม่พอ"
              : err === "username_taken"
                ? "Username นี้มีคนใช้แล้ว"
                : err === "same_username"
                  ? "เป็น username เดิมอยู่แล้ว"
                  : err === "invalid_username"
                    ? "Username ไม่ถูกต้อง"
                    : err === "shop_disabled"
                      ? "Shop ปิดอยู่"
                      : "เปลี่ยนไม่สำเร็จ",
            false
          );
          renameBtn.disabled = false;
          return;
        }
        shopPts = data.shopPts != null ? data.shopPts : shopPts - (sel.shopPrice || 0);
        if (data.user) {
          if (typeof onSaved === "function") onSaved(data.user);
          else {
            Object.assign(user || {}, data.user);
            try {
              paintUser(user);
            } catch (_) {}
          }
          if (user) {
            user.username = data.user.username;
            user.shopPts = shopPts;
          }
        } else if (user) {
          user.username = data.username || next;
          user.shopPts = shopPts;
          try {
            paintUser(user);
          } catch (_) {}
        }
        setMsg("เปลี่ยน username เป็น @" + (data.username || next) + " แล้ว (ถาวร)", true);
        paint();
      };
    }
  }

  const { res, data } = await api("/api/v1/shop/catalog", { method: "GET" });
  if (!res.ok) {
    root.querySelector("#shopBody").innerHTML = `<div class="empty">โหลด Shop ไม่ได้</div>`;
    return;
  }
  enabled = data.enabled !== false && !data.comingSoon;
  items = Array.isArray(data.items) ? data.items : [];
  services = Array.isArray(data.services) ? data.services : [];
  owned = new Set(Array.isArray(data.ownedIds) ? data.ownedIds : []);
  shopPts = data.shopPts != null ? data.shopPts : shopPts;
  if (user) user.shopPts = shopPts;
  rewards = data.rewards || null;
  const first = catalogAll()[0];
  if (first) selectedId = first.id;
  paint();
}
