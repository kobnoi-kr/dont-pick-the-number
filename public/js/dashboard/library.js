import { api, playUrl } from "./api.js";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const FALLBACK = [
  {
    id: "secret",
    name: "หาเลข",
    category: "numbers",
    categoryLabel: "ตัวเลข",
    maxPlayers: 12,
    description: "ห้ามโดนเลขลับ — ทายช่วงและหลบเลขที่ถูกสุ่มไว้",
    howTo: "ตั้งช่วงตัวเลข แล้วผลัดกันเลือกเลข ใครโดนเลขลับจะแพ้รอบนั้น",
    popular: true
  },
  {
    id: "wheel",
    name: "วงล้อ",
    category: "wheel",
    categoryLabel: "วงล้อ",
    maxPlayers: 12,
    description: "หมุนวงล้อสุ่มเลข ใครโดนเลขของตัวเองจะออกจากเกม",
    howTo: "หมุนวงล้อทีละครั้ง ถ้าวงล้อชี้เลขของคุณจะตกรอบ",
    popular: true
  },
  {
    id: "snake",
    name: "งูและบันได",
    category: "board",
    categoryLabel: "กระดาน",
    maxPlayers: 6,
    description: "ทอยลูกเต๋า ปีนบันได เลี่ยงงู — ใครถึงช่อง 100 ก่อนชนะ",
    howTo: "ผลัดกันทอยลูกเต๋า เดินตามกระดาน เจอบันไดขึ้น เจองูลง ต้องทอยพอดีถึง 100",
    popular: true
  }
];

export async function renderLibrary(root, { openCreate, favoriteMode } = {}) {
  const catRes = await api("/api/v1/games/catalog", { method: "GET" });
  const games = (catRes.data && catRes.data.games) || FALLBACK;
  const lastMode = favoriteMode || localStorage.getItem("nv-last-game") || "";

  root.innerHTML = `
    <section class="page-head">
      <div>
        <h2 style="margin:0">Game Library</h2>
        <p class="muted" style="margin:6px 0 0">เลือกเกม แล้วสร้างห้อง</p>
      </div>
    </section>
    <div class="lib-toolbar">
      <input id="libSearch" type="search" placeholder="ค้นหาเกม…" aria-label="ค้นหาเกม">
    </div>
    <div class="lib-grid" id="libGrid"></div>
    <div class="card hidden" id="libDetail"></div>
  `;

  const grid = root.querySelector("#libGrid");
  const detail = root.querySelector("#libDetail");
  let q = "";

  function filtered() {
    const qq = q.trim().toLowerCase();
    if (!qq) return games.slice();
    return games.filter((g) =>
      [g.name, g.nameEn, g.description, g.categoryLabel].join(" ").toLowerCase().includes(qq)
    );
  }

  function paint() {
    const list = filtered();
    if (!list.length) {
      grid.innerHTML = `<div class="empty">ไม่พบเกมที่ตรงเงื่อนไข</div>`;
      return;
    }
    grid.innerHTML = list
      .map(
        (g) => `
      <article class="lib-card" data-id="${esc(g.id)}">
        <div class="lib-thumb">${g.id === "wheel" ? "🎡" : g.id === "snake" ? "🐍" : "🔢"}</div>
        <div class="lib-body">
          <div class="lib-top">
            <h3>${esc(g.name)}</h3>
            ${g.id === lastMode ? `<span class="pill busy">เล่นล่าสุด</span>` : ""}
          </div>
          <p class="muted">${esc(g.description)}</p>
          <div class="tiny">ผู้เล่นสูงสุด ${g.maxPlayers || 12}</div>
          <div class="lib-actions">
            <button type="button" class="btn sm" data-play="${esc(g.id)}">เล่นเลย</button>
            <button type="button" class="btn ghost sm" data-info="${esc(g.id)}">รายละเอียด</button>
          </div>
        </div>
      </article>`
      )
      .join("");

    grid.querySelectorAll("[data-play]").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute("data-play");
        localStorage.setItem("nv-last-game", id);
        if (openCreate) openCreate({ cat: id, lockCat: true });
        else location.href = playUrl({ create: "public", setup: { cat: id } });
      };
    });
    grid.querySelectorAll("[data-info]").forEach((btn) => {
      btn.onclick = () => {
        const g = games.find((x) => x.id === btn.getAttribute("data-info"));
        if (!g) return;
        detail.classList.remove("hidden");
        detail.innerHTML = `
          <h2 style="margin-top:0">${esc(g.name)}</h2>
          <p class="muted">${esc(g.description)}</p>
          <h3>วิธีเล่น</h3>
          <p>${esc(g.howTo)}</p>
          <div class="lib-actions">
            <button type="button" class="btn" data-play2="${esc(g.id)}">สร้างห้องเกมนี้</button>
          </div>`;
        detail.querySelector("[data-play2]").onclick = () => {
          localStorage.setItem("nv-last-game", g.id);
          if (openCreate) openCreate({ cat: g.id, lockCat: true });
        };
        detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
      };
    });
  }

  root.querySelector("#libSearch").oninput = (e) => {
    q = e.target.value || "";
    paint();
  };
  paint();
}
