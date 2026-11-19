import { api } from "./api.js";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function itemThumb(item) {
  const url = item && item.imageUrl ? String(item.imageUrl) : "";
  return url
    ? `<img class="inv-card-img" src="${esc(url)}" alt="${esc(item.name)}" decoding="async" loading="lazy">`
    : `<div class="inv-card-img inv-card-fallback" aria-hidden="true">?</div>`;
}

export async function renderInventory(root, { user } = {}) {
  const guest = !user || user.accountType === "guest";
  root.innerHTML = `
    <section class="page-head">
      <div>
        <h2 style="margin:0">กระเป๋า</h2>
        <p class="muted" style="margin:6px 0 0">ไอเทมช่วยเล่นที่คุณมี — ใช้ก่อนเริ่มเกมในล็อบบี้</p>
      </div>
      <a class="btn ghost sm" href="#shop">ไปร้านค้า</a>
    </section>
    ${
      guest
        ? `<div class="card empty">เข้าสู่ระบบด้วยบัญชีจริงเพื่อใช้กระเป๋าไอเทม</div>`
        : `<div id="invBody"><div class="loading">Loading…</div></div>`
    }
  `;
  if (guest) return;

  const body = root.querySelector("#invBody");
  const { res, data } = await api("/api/v1/inventory/me", { method: "GET" });
  if (!res.ok) {
    body.innerHTML = `<div class="card empty">โหลดกระเป๋าไม่ได้</div>`;
    return;
  }
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) {
    body.innerHTML = `<div class="card empty">ยังไม่มีไอเทม — ซื้อได้ที่ <a href="#shop">Shop</a></div>`;
    return;
  }
  body.innerHTML = `<div class="inv-grid">${items
    .map(
      (it) => `<article class="card inv-card">
        <div class="inv-card-thumb">${itemThumb(it)}<span class="inv-qty">×${Number(it.quantity) || 0}</span></div>
        <b>${esc(it.name)}</b>
        <p class="muted tiny" style="margin:6px 0 0">${esc(it.description || "")}</p>
      </article>`
    )
    .join("")}</div>`;
}
