import { api } from "/js/dashboard/api.js";
import { esc, hasPerm } from "./util.js";

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

  function paint() {
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
              ? `<button type="button" class="btn ghost sm" id="lvAdd">+ เพิ่มเลเวล</button>`
              : ""
          }
        </div>
        <p class="tiny muted">EXP = EXP รวมที่ต้องมีถึงถึงเลเวลนั้น (เลเวลแรกต้องเป็น 0)</p>
        <div class="level-admin-table" id="lvRows"></div>
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

    const rows = root.querySelector("#lvRows");
    rows.innerHTML = config.levels
      .map((row, i) => {
        return `<div class="level-admin-row" data-i="${i}">
          <label>Lv
            <input class="input" data-f="level" type="number" min="1" max="99" value="${Number(row.level) || i + 1}" ${canManage ? "" : "disabled"}>
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

    if (!canManage) return;

    function syncFromDom() {
      config.expPlay = Number(root.querySelector("#lvExpPlay").value) || 0;
      config.expWin = Number(root.querySelector("#lvExpWin").value) || 0;
      config.levels = [...rows.querySelectorAll(".level-admin-row")].map((el) => {
        const colorEl = el.querySelector('[data-f="color"]');
        const colorText = el.querySelector('[data-f="colorText"]');
        const color = (colorText && colorText.value) || (colorEl && colorEl.value) || "#94a3b8";
        return {
          level: Number(el.querySelector('[data-f="level"]').value) || 1,
          exp: Number(el.querySelector('[data-f="exp"]').value) || 0,
          title: el.querySelector('[data-f="title"]').value.trim() || "Level",
          color
        };
      });
    }

    rows.querySelectorAll('[data-f="color"]').forEach((inp) => {
      inp.oninput = () => {
        const text = inp.parentElement.querySelector('[data-f="colorText"]');
        if (text) text.value = inp.value;
      };
    });
    rows.querySelectorAll('[data-f="colorText"]').forEach((inp) => {
      inp.onchange = () => {
        const color = inp.parentElement.querySelector('[data-f="color"]');
        if (color && /^#[0-9a-fA-F]{6}$/.test(inp.value.trim())) color.value = inp.value.trim();
      };
    });
    rows.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = () => {
        syncFromDom();
        const i = Number(btn.getAttribute("data-del"));
        if (config.levels.length <= 1) return;
        config.levels.splice(i, 1);
        paint();
      };
    });
    root.querySelector("#lvAdd").onclick = () => {
      syncFromDom();
      const last = config.levels[config.levels.length - 1] || blankRow(1, 0);
      config.levels.push(
        blankRow((Number(last.level) || config.levels.length) + 1, (Number(last.exp) || 0) + 100)
      );
      paint();
    };
    root.querySelector("#lvSave").onclick = async () => {
      syncFromDom();
      const msg = root.querySelector("#lvMsg");
      msg.textContent = "กำลังบันทึก…";
      msg.classList.remove("ok");
      const r = await api("/api/v1/admin/levels", {
        method: "PUT",
        body: JSON.stringify({ config })
      });
      if (r.res.ok && r.data && r.data.config) {
        config = r.data.config;
        msg.textContent = "บันทึกแล้ว";
        msg.classList.add("ok");
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
