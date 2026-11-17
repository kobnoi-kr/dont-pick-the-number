import { api } from "./api.js";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

const KIND_LABEL = { title: "ยศ", frame: "กรอบ", effect: "เอฟเฟกต์" };

export async function renderShop(root) {
  root.innerHTML = `
    <section class="page-head">
      <div>
        <h2 style="margin:0">Shop</h2>
        <p class="muted" style="margin:6px 0 0">ซื้อยศ · กรอบ · เอฟเฟกต์ (เปิดขายเร็วๆ นี้)</p>
      </div>
    </section>
    <div class="card shop-soon">
      <h3 style="margin-top:0">Coming soon</h3>
      <p class="muted" style="margin:0 0 14px">ระบบซื้อของกำลังเตรียม — ตอนนี้ดูแคตตาล็อกตัวอย่างได้</p>
      <div id="shopCatalog"><div class="loading">Loading…</div></div>
    </div>
  `;

  const box = root.querySelector("#shopCatalog");
  const { res, data } = await api("/api/v1/shop/catalog", { method: "GET" });
  if (!res.ok) {
    box.innerHTML = `<div class="empty">โหลดแคตตาล็อกไม่ได้</div>`;
    return;
  }
  const items = data.items || [];
  if (!items.length) {
    box.innerHTML = `<div class="empty">ยังไม่มีสินค้า</div>`;
    return;
  }
  box.innerHTML = `<div class="dec-grid">${items
    .map(
      (item) => `<div class="dec-item shop-item">
        <span class="tiny">${esc(KIND_LABEL[item.kind] || item.kind)}</span>
        <b>${esc(item.name)}</b>
        <span class="tiny muted">${esc(item.description || "")}</span>
        <span class="dec-wear">${item.shopPrice != null ? item.shopPrice + " pts" : "—"} · เร็วๆ นี้</span>
      </div>`
    )
    .join("")}</div>`;
}
