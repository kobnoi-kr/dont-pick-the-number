import { api } from "./api.js";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
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
  const nextLabel = p.maxed
    ? "ถึงเลเวลสูงสุดแล้ว"
    : `ไป Level ${p.nextLevel} · ${esc(p.nextTitle || "")}`;
  const barWidth = p.maxed ? 100 : Math.max(0, Math.min(100, Number(p.progressPct) || 0));
  const expText = p.maxed
    ? `${p.exp} EXP รวม`
    : `${p.currentExp} / ${p.nextExp} EXP`;

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
      <h3 style="margin-top:0">ตารางยศ</h3>
      <div class="level-tier-list">
        ${(p.tiers || [])
          .map((t) => {
            const on = t.level === p.level;
            return `<div class="level-tier${on ? " on" : ""}" style="--lv-color:${esc(t.color)}">
              <span class="level-tier-lv">Lv.${t.level}</span>
              <span class="level-tier-title" style="color:${esc(t.color)}">${esc(t.title)}</span>
              <span class="tiny muted">${t.exp} EXP</span>
            </div>`;
          })
          .join("")}
      </div>
    </div>
  `;
}
