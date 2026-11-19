import { api } from "./api.js";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function kindLabel(kind) {
  const map = {
    win: "ได้รับจากชนะเกม",
    admin_grant: "แอดมินเพิ่มให้",
    buy_helper: "ซื้อไอเทม",
    buy_cosmetic: "ซื้อของตกแต่ง",
    buy_username: "เปลี่ยน username"
  };
  return map[kind] || kind || "อื่นๆ";
}

function formatWhen(iso) {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "—";
    return d.toLocaleString("th-TH", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  } catch {
    return "—";
  }
}

export async function renderPtsHistory(root, ctx) {
  const user = ctx && ctx.user;
  root.innerHTML = `
    <div class="page-head">
      <div>
        <h2 style="margin:0">ประวัติ pts</h2>
        <p class="muted" style="margin:6px 0 0">บันทึกการได้รับ · การซื้อ · และการเพิ่มจากแอดมิน</p>
      </div>
      <div class="shop-balance" id="ptsHistBalance" title="คะแนน Shop">0 pts</div>
    </div>
    <div id="ptsHistBody"><div class="loading">Loading…</div></div>`;

  const balEl = root.querySelector("#ptsHistBalance");
  const body = root.querySelector("#ptsHistBody");

  if (!user || user.accountType === "guest") {
    body.innerHTML = `<div class="empty">เข้าสู่ระบบด้วยบัญชีจริงเพื่อดูประวัติ pts</div>`;
    return;
  }

  const { res, data } = await api("/api/v1/shop/pts-history?limit=80", { method: "GET" });
  if (!res.ok) {
    body.innerHTML = `<div class="empty">โหลดประวัติไม่สำเร็จ</div>`;
    return;
  }

  const shopPts = data.shopPts != null ? data.shopPts : user.shopPts || 0;
  if (balEl) balEl.textContent = `${Number(shopPts) || 0} pts`;
  if (user) user.shopPts = shopPts;

  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (!rows.length) {
    body.innerHTML = `<div class="empty">ยังไม่มีประวัติ pts — ชนะเกมหรือซื้อของใน Shop เพื่อเริ่มบันทึก</div>`;
    return;
  }

  body.innerHTML = `
    <div class="card pts-hist-card">
      <ul class="pts-hist-list">
        ${rows
          .map((row) => {
            const gain = Number(row.delta) > 0;
            const delta = Number(row.delta) || 0;
            const sign = gain ? "+" : "";
            return `<li class="pts-hist-row ${gain ? "is-gain" : "is-spend"}">
              <div class="pts-hist-main">
                <b>${esc(row.title || kindLabel(row.kind))}</b>
                <span class="tiny muted">${esc(kindLabel(row.kind))} · ${esc(formatWhen(row.createdAt))}</span>
              </div>
              <div class="pts-hist-amt">
                <b class="pts-delta">${sign}${delta}</b>
                <span class="tiny muted">เหลือ ${Number(row.balance) || 0}</span>
              </div>
            </li>`;
          })
          .join("")}
      </ul>
    </div>`;
}
