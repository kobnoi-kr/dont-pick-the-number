import { api } from "./api.js";

const PAGE_SIZE = 10;

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function pageOfLevel(tiers, level) {
  const idx = Math.max(
    0,
    (tiers || []).findIndex((t) => t.level === level)
  );
  return Math.floor(idx / PAGE_SIZE) + 1;
}

export async function renderLevel(root, { user } = {}) {
  const guest = !user || user.accountType === "guest";
  root.innerHTML = `
    <section class="page-head">
      <div>
        <h2 style="margin:0">Level</h2>
        <p class="muted" style="margin:6px 0 0">ดูเลเวล · ยศ · EXP ไปขั้นถัดไป</p>
      </div>
    </section>
    ${
      guest
        ? `<div class="card empty">เข้าสู่ระบบด้วยบัญชีจริงเพื่อเก็บ Level / EXP</div>`
        : `<div id="levelRoot"><div class="card"><div class="loading">Loading…</div></div></div>`
    }
  `;
  if (guest) return;

  const box = root.querySelector("#levelRoot");
  const { res, data } = await api("/api/v1/levels/me", { method: "GET" });
  if (!res.ok || !data || !data.progress) {
    box.innerHTML = `<div class="card empty">โหลด Level ไม่สำเร็จ</div>`;
    return;
  }
  const p = data.progress;
  const tiers = Array.isArray(p.tiers) ? p.tiers : [];
  const totalPages = Math.max(1, Math.ceil(tiers.length / PAGE_SIZE));
  let page = Math.min(totalPages, Math.max(1, pageOfLevel(tiers, p.level)));

  const nextLabel = p.maxed
    ? "ถึงเลเวลสูงสุดแล้ว"
    : `ไป Level ${p.nextLevel} · ${esc(p.nextTitle || "")}`;
  const barWidth = p.maxed ? 100 : Math.max(0, Math.min(100, Number(p.progressPct) || 0));
  const expText = p.maxed ? `${p.exp} EXP รวม` : `${p.currentExp} / ${p.nextExp} EXP`;

  function paintTiers() {
    const list = box.querySelector("#levelTierList");
    const pager = box.querySelector("#levelPager");
    if (!list) return;
    const start = (page - 1) * PAGE_SIZE;
    const slice = tiers.slice(start, start + PAGE_SIZE);
    list.innerHTML = slice
      .map((t) => {
        const on = t.level === p.level;
        return `<div class="level-tier${on ? " on" : ""}" style="--lv-color:${esc(t.color)}">
          <span class="level-tier-lv">Lv.${t.level}</span>
          <span class="level-tier-title" style="color:${esc(t.color)}">${esc(t.title)}</span>
          <span class="tiny muted">${t.exp} EXP</span>
        </div>`;
      })
      .join("");

    if (!pager) return;
    if (totalPages <= 1) {
      pager.classList.add("hidden");
      pager.innerHTML = "";
      return;
    }
    pager.classList.remove("hidden");
    const from = start + 1;
    const to = Math.min(tiers.length, start + PAGE_SIZE);
    pager.innerHTML = `
      <button type="button" class="btn ghost sm" id="lvPrev" ${page <= 1 ? "disabled" : ""}>ก่อนหน้า</button>
      <span class="tiny">หน้า ${page}/${totalPages} · Lv.${from}–${to}</span>
      <button type="button" class="btn ghost sm" id="lvNext" ${page >= totalPages ? "disabled" : ""}>ถัดไป</button>
    `;
    const prev = pager.querySelector("#lvPrev");
    const next = pager.querySelector("#lvNext");
    if (prev) {
      prev.onclick = () => {
        if (page <= 1) return;
        page -= 1;
        paintTiers();
      };
    }
    if (next) {
      next.onclick = () => {
        if (page >= totalPages) return;
        page += 1;
        paintTiers();
      };
    }
  }

  box.innerHTML = `
    <div class="card level-hero">
      <div class="level-hero-top">
        <div class="level-badge" style="--lv-color:${esc(p.color)}">
          <span class="tiny">LEVEL</span>
          <b>${p.level}</b>
        </div>
        <div class="level-hero-meta">
          <div class="level-title-pill" style="border-color:${esc(p.color)};color:${esc(p.color)}">${esc(p.title)}</div>
          <p class="muted" style="margin:8px 0 0">${nextLabel}</p>
        </div>
      </div>
      <div class="level-bar-wrap">
        <div class="level-bar-labels">
          <span>EXP</span>
          <span>${esc(expText)}</span>
        </div>
        <div class="level-bar" aria-hidden="true">
          <div class="level-bar-fill" style="width:${barWidth}%;background:${esc(p.color)}"></div>
        </div>
      </div>
      <p class="tiny muted" style="margin:12px 0 0">
        ได้ EXP จากการเล่นจบเกม · เล่น +${p.rewards.expPlay} · ชนะ +${p.rewards.expWin}
      </p>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="row-between" style="align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <h3 style="margin:0">ตารางยศ</h3>
        <span class="tiny muted">หน้าละ ${PAGE_SIZE} เลเวล</span>
      </div>
      <div class="level-tier-list" id="levelTierList"></div>
      <div class="level-pager" id="levelPager"></div>
    </div>
  `;
  paintTiers();
}
