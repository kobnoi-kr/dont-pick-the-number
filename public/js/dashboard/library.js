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
        <p class="muted" style="margin:6px 0 0">เลือกเกม แล้วสร้างห้องหรือเข้าเล่น</p>
      </div>
    </section>
    <div class="lib-toolbar">
      <input id="libSearch" type="search" placeholder="ค้นหาเกม…" aria-label="ค้นหาเกม">
      <div class="filters" id="libFilters">
        <button type="button" data-cat="all" class="on">ทั้งหมด</button>
        <button type="button" data-cat="numbers">ตัวเลข</button>
        <button type="button" data-cat="wheel">วงล้อ</button>
        <button type="button" data-cat="popular">ยอดนิยม</button>
        <button type="button" data-cat="recent">เล่นล่าสุด</button>
      </div>
    </div>
    <div class="lib-grid" id="libGrid"></div>
    <div class="card hidden" id="libDetail"></div>
  `;

  const grid = root.querySelector("#libGrid");
  const detail = root.querySelector("#libDetail");
  let filter = "all";
  let q = "";

  function filtered() {
    const qq = q.trim().toLowerCase();
    return games.filter((g) => {
      if (filter === "numbers" && g.category !== "numbers") return false;
      if (filter === "wheel" && g.category !== "wheel") return false;
      if (filter === "popular" && !g.popular) return false;
      if (filter === "recent" && g.id !== lastMode) return false;
      if (!qq) return true;
      return [g.name, g.nameEn, g.description, g.categoryLabel]
        .join(" ")
        .toLowerCase()
        .includes(qq);
    });
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
        <div class="lib-thumb">${g.id === "wheel" ? "🎡" : "🔢"}</div>
        <div class="lib-body">
          <div class="lib-top">
            <h3>${esc(g.name)}</h3>
            <span class="pill">${esc(g.categoryLabel || g.category)}</span>
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
        if (openCreate) openCreate({ cat: id });
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
          if (openCreate) openCreate({ cat: g.id });
        };
        detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
      };
    });
  }

  root.querySelector("#libSearch").oninput = (e) => {
    q = e.target.value || "";
    paint();
  };
  root.querySelector("#libFilters").onclick = (e) => {
    const btn = e.target.closest("button[data-cat]");
    if (!btn) return;
    filter = btn.getAttribute("data-cat");
    root.querySelectorAll("#libFilters button").forEach((b) => b.classList.toggle("on", b === btn));
    paint();
  };
  paint();
}
