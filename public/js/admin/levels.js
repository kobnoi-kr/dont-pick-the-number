import { api } from "/js/dashboard/api.js";
import { esc, hasPerm, confirmDialog } from "./util.js";

const PAGE_SIZE = 10;

function blankRow(level, exp) {
  return { level, exp, title: "Level " + level, color: "#94a3b8" };
}

export async function renderLevels(root, { user }) {
  const canManage = hasPerm(user, "levels.manage") || hasPerm(user, "settings.manage");
  root.innerHTML = `<div class="loading">Loading…</div>`;
  const { res, data } = await api("/api/v1/admin/levels", { method: "GET" });
  if (!res.ok) {
    root.innerHTML = `<div class="empty">โหลดไม่ได้</div>`;
    return;
  }

  let config = data.config || { expWin: 40, expPlay: 15, levels: [] };
  if (!Array.isArray(config.levels) || !config.levels.length) {
    config.levels = [blankRow(1, 0)];
  }
  let page = 1;

  function pageCount() {
    return Math.max(1, Math.ceil((config.levels.length || 1) / PAGE_SIZE));
  }

  function clampPage() {
    page = Math.min(Math.max(1, page), pageCount());
  }

  function pageSlice() {
    clampPage();
    const start = (page - 1) * PAGE_SIZE;
    return { start, rows: config.levels.slice(start, start + PAGE_SIZE) };
  }

  function paint() {
    clampPage();
    const { start, rows: visible } = pageSlice();
    const total = config.levels.length;
    const pages = pageCount();
    const from = total ? start + 1 : 0;
    const to = Math.min(start + visible.length, total);

    root.innerHTML = `
      <section class="page-head">
        <div>
          <h2 style="margin:0">Level &amp; ยศ</h2>
          <p class="muted" style="margin:6px 0 0">ตั้งค่า EXP ที่ต้องใช้เพื่ออัพเลเวล และสี/ชื่อยศแต่ละขั้น</p>
        </div>
      </section>

      <div class="card">
        <h3 style="margin-top:0">EXP ต่อเกม</h3>
        <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
          <label>EXP เมื่อเล่นจบ
            <input class="input" id="lvExpPlay" type="number" min="0" max="100000" value="${Number(config.expPlay) || 0}" ${canManage ? "" : "disabled"}>
          </label>
          <label>EXP โบนัสเมื่อชนะ
            <input class="input" id="lvExpWin" type="number" min="0" max="100000" value="${Number(config.expWin) || 0}" ${canManage ? "" : "disabled"}>
          </label>
        </div>
        <p class="tiny muted" style="margin:8px 0 0">รวมต่อเกม = เล่นจบ + (ชนะถ้ามี)</p>
      </div>

      <div class="card" style="margin-top:14px">
        <div class="row-between" style="align-items:center;gap:10px;flex-wrap:wrap">
          <h3 style="margin:0">ตารางเลเวล / ยศ</h3>
          ${
            canManage
              ? `<div style="display:flex;gap:8px;flex-wrap:wrap">
                   <button type="button" class="btn ghost sm" id="lvPack100">ใช้ชุดยศ 100 ขั้น</button>
                   <button type="button" class="btn ghost sm" id="lvAdd">+ เพิ่มเลเวล</button>
                 </div>`
              : ""
          }
        </div>
        <p class="tiny muted">EXP = EXP รวมถึงเลเวลนั้น (เลเวลแรก = 0) · ยศทั่วไปใช้ชื่อ + I/II/III · Lv.100 = NUMVERSE Elite</p>
        <p class="tiny muted" id="lvPageMeta" style="margin:8px 0 0">แสดง ${from}–${to} จาก ${total} ชั้น · หน้า ${page}/${pages} (หน้าละ ${PAGE_SIZE})</p>
        <div class="level-admin-table" id="lvRows"></div>
        <div class="row-between level-admin-pager" style="margin-top:12px;align-items:center;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn ghost sm" id="lvPrev" ${page <= 1 ? "disabled" : ""}>← ก่อนหน้า</button>
          <span class="tiny muted">หน้า ${page} / ${pages}</span>
          <button type="button" class="btn ghost sm" id="lvNext" ${page >= pages ? "disabled" : ""}>ถัดไป →</button>
        </div>
      </div>

      ${
        canManage
          ? `<div class="row-actions" style="margin-top:14px">
               <button type="button" class="btn" id="lvSave">บันทึก</button>
               <p class="msg" id="lvMsg" style="margin:0"></p>
             </div>`
          : `<p class="tiny muted" style="margin-top:12px">ต้องมีสิทธิ์ settings.manage เพื่อแก้ไข</p>`
      }
    `;

    const rowsEl = root.querySelector("#lvRows");
    rowsEl.innerHTML = visible
      .map((row, localI) => {
        const i = start + localI;
        return `<div class="level-admin-row" data-i="${i}">
          <label>Lv
            <input class="input" data-f="level" type="number" min="1" max="100" value="${Number(row.level) || i + 1}" ${canManage ? "" : "disabled"}>
          </label>
          <label>EXP รวม
            <input class="input" data-f="exp" type="number" min="0" value="${Number(row.exp) || 0}" ${canManage ? "" : "disabled"}>
          </label>
          <label>ชื่อยศ
            <input class="input" data-f="title" maxlength="32" value="${esc(row.title || "")}" ${canManage ? "" : "disabled"}>
          </label>
          <label>สียศ
            <span class="level-color-wrap">
              <input data-f="color" type="color" value="${esc(row.color || "#94a3b8")}" ${canManage ? "" : "disabled"}>
              <input class="input" data-f="colorText" maxlength="7" value="${esc(row.color || "#94a3b8")}" ${canManage ? "" : "disabled"}>
            </span>
          </label>
          ${
            canManage
              ? `<button type="button" class="btn ghost sm danger-outline" data-del="${i}">ลบ</button>`
              : `<span></span>`
          }
        </div>`;
      })
      .join("");

    function syncVisibleFromDom() {
      const playEl = root.querySelector("#lvExpPlay");
      const winEl = root.querySelector("#lvExpWin");
      if (playEl) config.expPlay = Number(playEl.value) || 0;
      if (winEl) config.expWin = Number(winEl.value) || 0;
      rowsEl.querySelectorAll(".level-admin-row").forEach((el) => {
        const i = Number(el.getAttribute("data-i"));
        if (!Number.isInteger(i) || i < 0 || i >= config.levels.length) return;
        const colorEl = el.querySelector('[data-f="color"]');
        const colorText = el.querySelector('[data-f="colorText"]');
        const color = (colorText && colorText.value) || (colorEl && colorEl.value) || "#94a3b8";
        config.levels[i] = {
          level: Number(el.querySelector('[data-f="level"]').value) || 1,
          exp: Number(el.querySelector('[data-f="exp"]').value) || 0,
          title: el.querySelector('[data-f="title"]').value.trim() || "Level",
          color
        };
      });
    }

    root.querySelector("#lvPrev").onclick = () => {
      if (canManage) syncVisibleFromDom();
      if (page > 1) {
        page -= 1;
        paint();
      }
    };
    root.querySelector("#lvNext").onclick = () => {
      if (canManage) syncVisibleFromDom();
      if (page < pageCount()) {
        page += 1;
        paint();
      }
    };

    if (!canManage) return;

    rowsEl.querySelectorAll('[data-f="color"]').forEach((inp) => {
      inp.oninput = () => {
        const text = inp.parentElement.querySelector('[data-f="colorText"]');
        if (text) text.value = inp.value;
      };
    });
    rowsEl.querySelectorAll('[data-f="colorText"]').forEach((inp) => {
      inp.onchange = () => {
        const color = inp.parentElement.querySelector('[data-f="color"]');
        if (color && /^#[0-9a-fA-F]{6}$/.test(inp.value.trim())) color.value = inp.value.trim();
      };
    });
    rowsEl.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = () => {
        syncVisibleFromDom();
        const i = Number(btn.getAttribute("data-del"));
        if (config.levels.length <= 1) return;
        config.levels.splice(i, 1);
        clampPage();
        paint();
      };
    });
    const packBtn = root.querySelector("#lvPack100");
    if (packBtn) {
      packBtn.onclick = async () => {
        if (!(await confirmDialog("แทนที่ตารางยศด้วยชุดมาตรฐาน 100 ขั้น (I/II/III · Lv.100 = NUMVERSE Elite)?"))) return;
        const cfgRes = await api("/api/v1/levels/config", { method: "GET" });
        const ROMANS = ["I", "II", "III"];
        const BASES = [
          "มือใหม่","ผู้ฝึกหัด","นักสำรวจ","นักแข่ง","นักกลยุทธ์","นักล่าเลข","ผู้กล้า","นักรบ","มือโปร","อัศวิน",
          "จ้าวสนาม","นักล่าชัย","แชมป์","ผู้พิชิต","วีรบุรุษ","มาสเตอร์","ปรมาจารย์","ตำนาน","มายา","เทพเกม",
          "จักรพรรดิ","ทวยเทพ","มหาเทพ","อวตาร","นิรันดร์","จักรวาล","มิติ","อภิมหา","สุดยอด","แกรนด์มาสเตอร์",
          "สุดขอบฟ้า","เหนือชั้น","อมตะ"
        ];
        const COLORS = [
          "#94a3b8","#64748b","#60a5fa","#3b82f6","#22d3ee","#14b8a6","#34d399","#4ade80","#a3e635","#facc15",
          "#fbbf24","#fb923c","#f97316","#a78bfa","#8b5cf6","#c084fc","#e879f9","#f472b6","#fb7185","#f43f5e",
          "#ef4444","#f59e0b","#eab308","#84cc16","#10b981","#06b6d4","#0ea5e9","#6366f1","#8b5cf6","#d946ef",
          "#ec4899","#f43f5e","#e2e8f0"
        ];
        const expFor = (L) => (L <= 1 ? 0 : Math.round(50 * Math.pow(L - 1, 1.45)));
        const levels = [];
        for (let i = 0; i < BASES.length; i++) {
          for (let r = 0; r < 3; r++) {
            const level = i * 3 + r + 1;
            levels.push({ level, exp: expFor(level), title: BASES[i] + " " + ROMANS[r], color: COLORS[i % COLORS.length] });
          }
        }
        levels.push({ level: 100, exp: expFor(100), title: "NUMVERSE Elite", color: "#38bdf8" });
        syncVisibleFromDom();
        config.levels = levels;
        page = 1;
        void cfgRes;
        paint();
      };
    }
    root.querySelector("#lvAdd").onclick = () => {
      syncVisibleFromDom();
      const last = config.levels[config.levels.length - 1] || blankRow(1, 0);
      const nextLv = Math.min(100, (Number(last.level) || config.levels.length) + 1);
      if (config.levels.length >= 100 || nextLv > 100) return;
      config.levels.push(blankRow(nextLv, (Number(last.exp) || 0) + 100));
      page = pageCount();
      paint();
    };
    root.querySelector("#lvSave").onclick = async () => {
      syncVisibleFromDom();
      const msg = root.querySelector("#lvMsg");
      msg.textContent = "กำลังบันทึก…";
      msg.classList.remove("ok");
      const r = await api("/api/v1/admin/levels", {
        method: "PUT",
        body: JSON.stringify({ config })
      });
      if (r.res.ok && r.data && r.data.config) {
        config = r.data.config;
        clampPage();
        paint();
        const m = root.querySelector("#lvMsg");
        if (m) {
          m.textContent = "บันทึกแล้ว";
          m.classList.add("ok");
        }
      } else {
        msg.textContent = (r.data && r.data.error) || "บันทึกไม่สำเร็จ";
      }
    };
  }

  paint();
}
