import { api } from "/js/dashboard/api.js";
import { esc, hasPerm } from "./util.js";

const KIND_LABEL = { title: "ยศ", frame: "กรอบ", effect: "เอฟเฟกต์" };
const PROTECTED_IDS = new Set(["frame.basic", "effect.none", "title.level.1", "title.rookie"]);
const RANKING_TITLE_IDS = new Set([
  "title.weekly.1",
  "title.weekly.2",
  "title.weekly.3",
  "title.monthly.1",
  "title.monthly.2",
  "title.monthly.3"
]);

function itemColor(item) {
  if (!item) return "#94a3b8";
  if (item.meta && item.meta.color) return String(item.meta.color);
  if (item.cssClass === "title-weekly-1" || item.cssClass === "title-monthly-1") return "#fbbf24";
  if (item.cssClass === "title-weekly-2" || item.cssClass === "title-monthly-2") return "#cbd5e1";
  if (item.cssClass === "title-weekly-3" || item.cssClass === "title-monthly-3") return "#cd7f32";
  if (String(item.cssClass || "").startsWith("frame-")) return "#fbbf24";
  if (String(item.cssClass || "").startsWith("effect-")) return "#a78bfa";
  return "#94a3b8";
}

function thumb(item) {
  const color = itemColor(item);
  if (item.kind === "title") {
    return `<span class="dec-title-pill dec-title-pill-sm" style="--title-color:${esc(color)};border-color:${esc(
      color
    )};color:${esc(color)}">${esc(item.name)}</span>`;
  }
  const cls = item.cssClass ? " " + item.cssClass : "";
  if (item.kind === "frame") {
    return `<div class="dec-card-thumb${cls}" style="--dec-accent:${esc(
      color
    )}"><div class="dec-av-core"><span class="dec-av-letter">N</span></div></div>`;
  }
  return `<div class="dec-effect-shell"><div class="dec-av-core${cls}" style="--dec-accent:${esc(
    color
  )}"><span class="dec-av-letter">N</span></div></div>`;
}

export async function renderGift(root, { user }) {
  const canGift = hasPerm(user, "cosmetics.gift") || hasPerm(user, "users.ban");
  if (!canGift) {
    root.innerHTML = `<div class="empty">ไม่มีสิทธิ์ Gift ของตกแต่ง</div>`;
    return;
  }

  root.innerHTML = `<div class="loading">Loading…</div>`;
  const cat = await api("/api/v1/admin/cosmetics", { method: "GET" });
  if (!cat.res.ok) {
    root.innerHTML = `<div class="empty">โหลดแคตตาล็อกไม่ได้</div>`;
    return;
  }
  // กันมือใหม่ซ้ำ + ยศ Ranking ต้องได้จากแต้มสูงสุดเท่านั้น (Gift มอบไม่ได้)
  let items = (Array.isArray(cat.data && cat.data.items) ? cat.data.items : []).filter((it) => {
    if (it.id === "title.rookie") return false;
    if (RANKING_TITLE_IDS.has(it.id)) return false;
    return true;
  });

  let mode = "gift"; // gift | revoke
  let selectedUser = null;
  let selectedCosmeticId = "";
  let kindFilter = "all";
  let itemQuery = "";
  let itemSort = "level"; // level | name | kind | id
  let owned = [];
  let equipped = { titleId: null, frameId: null, effectId: null };
  let ownedLoading = false;
  let createMsg = "";
  let createMsgOk = false;

  function levelOf(it) {
    const n = it && it.meta && Number(it.meta.level);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function filterAndSort(list) {
    const q = itemQuery.trim().toLowerCase();
    let out = Array.isArray(list) ? list.slice() : [];
    if (q) {
      out = out.filter((it) => {
        const hay = [it.id, it.name, it.description, it.kind, KIND_LABEL[it.kind], levelOf(it)]
          .filter((x) => x != null && x !== "")
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    out.sort((a, b) => {
      if (itemSort === "name") {
        return String(a.name || "").localeCompare(String(b.name || ""), "th", { sensitivity: "base" });
      }
      if (itemSort === "kind") {
        const k = String(a.kind || "").localeCompare(String(b.kind || ""));
        if (k) return k;
        return String(a.name || "").localeCompare(String(b.name || ""), "th", { sensitivity: "base" });
      }
      if (itemSort === "id") {
        return String(a.id || "").localeCompare(String(b.id || ""));
      }
      // level (default): level titles by level, then name; non-level titles after / before by name
      const la = levelOf(a);
      const lb = levelOf(b);
      if (la != null && lb != null) return la - lb;
      if (la != null) return -1;
      if (lb != null) return 1;
      if (a.kind === "title" && b.kind !== "title") return -1;
      if (b.kind === "title" && a.kind !== "title") return 1;
      return String(a.name || "").localeCompare(String(b.name || ""), "th", { sensitivity: "base" });
    });
    return out;
  }

  async function loadOwned() {
    owned = [];
    equipped = { titleId: null, frameId: null, effectId: null };
    if (!selectedUser) return;
    ownedLoading = true;
    paint();
    const { res, data } = await api(
      "/api/v1/admin/cosmetics/owned?userId=" + encodeURIComponent(selectedUser.id),
      { method: "GET" }
    );
    ownedLoading = false;
    if (res.ok && data) {
      owned = Array.isArray(data.owned) ? data.owned : [];
      equipped = data.equipped || equipped;
    }
    paint();
  }

  function paint() {
    const catalogFiltered =
      kindFilter === "all" ? items : items.filter((it) => it.kind === kindFilter);
    const ownedFiltered =
      kindFilter === "all" ? owned : owned.filter((it) => it.kind === kindFilter);
    const list = filterAndSort(mode === "gift" ? catalogFiltered : ownedFiltered);
    const selected =
      mode === "gift"
        ? items.find((it) => it.id === selectedCosmeticId) || null
        : owned.find((it) => it.id === selectedCosmeticId) || null;
    const canAct =
      selectedUser &&
      selected &&
      (mode === "gift" || !PROTECTED_IDS.has(selected.id));

    root.innerHTML = `
      <section class="page-head">
        <div>
          <h2 style="margin:0">Gift</h2>
          <p class="muted" style="margin:6px 0 0">มอบหรือดึงยศ · กรอบ · เอฟเฟกต์ แบบ manual</p>
        </div>
      </section>

      <div class="gift-mode-tabs" id="giftMode">
        <button type="button" class="btn sm${mode === "gift" ? "" : " ghost"}" data-mode="gift">มอบของ</button>
        <button type="button" class="btn sm${mode === "revoke" ? "" : " ghost"}" data-mode="revoke">ดึงของกลับ</button>
      </div>

      <div class="card" style="margin-bottom:14px">
        <h3 style="margin-top:0">สร้างยศตกแต่งใหม่</h3>
        <p class="tiny muted" style="margin:0 0 10px">สร้างยศสำหรับ Gift — ไม่ขายใน Shop · ไม่ทับยศเลเวล / Ranking</p>
        <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
          <label>ชื่อยศ
            <input class="input" id="titleCreateName" maxlength="64" placeholder="เช่น Elite Patron">
          </label>
          <label>สี (hex)
            <input class="input" id="titleCreateColor" maxlength="7" value="#a78bfa" placeholder="#a78bfa">
          </label>
          <label>คำอธิบาย
            <input class="input" id="titleCreateDesc" maxlength="255" placeholder="สั้นๆ (ไม่บังคับ)">
          </label>
          <label>ID (ว่างได้)
            <input class="input" id="titleCreateId" maxlength="64" placeholder="title.elite.patron">
          </label>
        </div>
        <div id="titleCreatePreview" style="margin-top:10px"></div>
        <div class="row-actions" style="margin-top:12px">
          <button type="button" class="btn sm" id="titleCreateBtn">สร้างยศ</button>
          <p class="msg" id="titleCreateMsg" style="margin:0">${esc(createMsg)}</p>
        </div>
      </div>

      <div class="gift-layout">
        <div class="card">
          <h3 style="margin-top:0">1) หาผู้เล่น</h3>
          <div class="toolbar">
            <input class="input" id="giftQ" placeholder="ค้นหา username / ชื่อ / friend code" />
            <button type="button" class="btn sm" id="giftSearch">ค้นหา</button>
          </div>
          <div id="giftUserList" class="gift-user-list" style="margin-top:12px">
            ${
              selectedUser
                ? `<div class="gift-user-card on">
                     <b>${esc(selectedUser.displayName || selectedUser.username)}</b>
                     <span class="tiny muted">@${esc(selectedUser.username)}</span>
                     <span class="tiny">เลือกแล้ว</span>
                   </div>`
                : `<p class="tiny muted" style="margin:0">ยังไม่ได้เลือกผู้เล่น</p>`
            }
          </div>
        </div>

        <div class="card">
          <h3 style="margin-top:0">${mode === "gift" ? "2) เลือกของที่จะมอบ" : "2) เลือกของในคลังผู้เล่น"}</h3>
          <div class="gift-kind-tabs" id="giftKinds">
            ${["all", "title", "frame", "effect"]
              .map((k) => {
                const label = k === "all" ? "ทั้งหมด" : KIND_LABEL[k];
                return `<button type="button" class="btn ghost sm${kindFilter === k ? " on" : ""}" data-kind="${k}">${label}</button>`;
              })
              .join("")}
          </div>
          <div class="gift-item-toolbar">
            <input class="input" id="giftItemQ" type="search" placeholder="ค้นหายศ / ชื่อของ / id เช่น Elite, มือใหม่, title.level.10" value="${esc(itemQuery)}" />
            <label class="gift-sort-label">จัดเรียง
              <select class="input" id="giftItemSort">
                <option value="level"${itemSort === "level" ? " selected" : ""}>เลเวลยศ</option>
                <option value="name"${itemSort === "name" ? " selected" : ""}>ชื่อ A–Z</option>
                <option value="kind"${itemSort === "kind" ? " selected" : ""}>ประเภท</option>
                <option value="id"${itemSort === "id" ? " selected" : ""}>รหัสของ</option>
              </select>
            </label>
          </div>
          <p class="tiny muted" id="giftItemCount" style="margin:8px 0 0">${
            mode === "revoke" && !selectedUser
              ? ""
              : ownedLoading
                ? ""
                : `แสดง ${list.length} รายการ`
          }</p>
          <div class="gift-item-grid" id="giftItems">
            ${
              mode === "revoke" && !selectedUser
                ? `<div class="empty">เลือกผู้เล่นก่อนเพื่อดูคลัง</div>`
                : ownedLoading
                  ? `<div class="loading">Loading…</div>`
                  : list.length
                    ? list
                        .map((it) => {
                          const on = selectedCosmeticId === it.id;
                          const isEq =
                            (equipped.titleId && equipped.titleId === it.id) ||
                            (equipped.frameId && equipped.frameId === it.id) ||
                            (equipped.effectId && equipped.effectId === it.id);
                          const locked = mode === "revoke" && PROTECTED_IDS.has(it.id);
                          const lv = levelOf(it);
                          const kindLine = lv != null ? `ยศ · Lv.${lv}` : KIND_LABEL[it.kind] || it.kind;
                          return `<button type="button" class="gift-item-card${on ? " on" : ""}${
                            locked ? " locked" : ""
                          }" data-id="${esc(it.id)}" ${locked ? "disabled" : ""}>
                            <div class="gift-item-thumb">${thumb(it)}</div>
                            <span class="tiny">${esc(kindLine)}</span>
                            <b>${esc(it.name)}</b>
                            <span class="tiny muted">${esc(
                              mode === "revoke"
                                ? (it.source || "") + (isEq ? " · สวมอยู่" : "") + (locked ? " · ล็อก" : "")
                                : it.description || it.id
                            )}</span>
                          </button>`;
                        })
                        .join("")
                    : `<div class="empty">${
                        itemQuery.trim()
                          ? "ไม่พบของที่ตรงคำค้น"
                          : mode === "revoke"
                            ? "ผู้เล่นยังไม่มีของในคลัง"
                            : "ไม่มีของในหมวดนี้"
                      }</div>`
            }
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <h3 style="margin-top:0">${mode === "gift" ? "3) ส่งมอบ" : "3) ดึงของกลับ"}</h3>
        <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
          <div>
            <div class="tiny muted">ผู้เล่น</div>
            <b>${
              selectedUser
                ? esc((selectedUser.displayName || selectedUser.username) + " @" + selectedUser.username)
                : "—"
            }</b>
          </div>
          <div>
            <div class="tiny muted">ของที่เลือก</div>
            <b>${selected ? esc(KIND_LABEL[selected.kind] + " · " + selected.name) : "—"}</b>
          </div>
        </div>
        <label style="display:block;margin-top:12px">หมายเหตุถึงผู้เล่น (ถ้ามี)
          <input class="input" id="giftNote" maxlength="200" placeholder="${
            mode === "gift" ? "เช่น ชดเชยยศ Weekly ที่ระบบพลาด" : "เช่น ดึงของที่ให้ผิดคน"
          }">
        </label>
        ${
          mode === "gift"
            ? `<label class="check-row" style="margin-top:10px">
                 <input type="checkbox" id="giftAutoEquip">
                 <span>สวมให้อัตโนมัติหลังมอบ</span>
               </label>`
            : `<p class="tiny muted" style="margin:10px 0 0">ของเริ่มต้น (กรอบเรียบ / ไม่มีเอฟเฟกต์ / ยศเลเวล 1) ดึงไม่ได้</p>`
        }
        <div class="row-actions" style="margin-top:14px">
          <button type="button" class="btn${mode === "revoke" ? " danger" : ""}" id="giftSend" ${
            canAct ? "" : "disabled"
          }>${mode === "gift" ? "มอบของ" : "ดึงของกลับ"}</button>
          <p class="msg" id="giftMsg" style="margin:0"></p>
        </div>
      </div>
    `;

    const msg = root.querySelector("#giftMsg");
    function setMsg(text, ok) {
      msg.textContent = text || "";
      msg.classList.toggle("ok", !!ok);
    }

    const createMsgEl = root.querySelector("#titleCreateMsg");
    if (createMsgEl) {
      createMsgEl.textContent = createMsg || "";
      createMsgEl.classList.toggle("ok", !!createMsgOk);
    }

    function paintTitleCreatePreview() {
      const box = root.querySelector("#titleCreatePreview");
      const nameEl = root.querySelector("#titleCreateName");
      const colorEl = root.querySelector("#titleCreateColor");
      if (!box) return;
      const name = ((nameEl && nameEl.value) || "ชื่อยศ").trim().slice(0, 64) || "ชื่อยศ";
      let color = ((colorEl && colorEl.value) || "#a78bfa").trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) color = "#a78bfa";
      box.innerHTML = `<span class="dec-title-pill" style="--title-color:${esc(color)};border-color:${esc(
        color
      )};color:${esc(color)}">${esc(name)}</span>`;
    }
    paintTitleCreatePreview();
    const nameInput = root.querySelector("#titleCreateName");
    const colorInput = root.querySelector("#titleCreateColor");
    if (nameInput) nameInput.oninput = paintTitleCreatePreview;
    if (colorInput) colorInput.oninput = paintTitleCreatePreview;

    const createBtn = root.querySelector("#titleCreateBtn");
    if (createBtn) {
      createBtn.onclick = async () => {
        const name = (root.querySelector("#titleCreateName").value || "").trim();
        const color = (root.querySelector("#titleCreateColor").value || "").trim();
        const description = (root.querySelector("#titleCreateDesc").value || "").trim();
        const id = (root.querySelector("#titleCreateId").value || "").trim();
        if (!name) {
          createMsg = "ใส่ชื่อยศก่อน";
          createMsgOk = false;
          paint();
          return;
        }
        createBtn.disabled = true;
        const body = {
          kind: "title",
          name,
          color: color || "#a78bfa",
          description: description || undefined,
          id: id || undefined
        };
        const { res, data } = await api("/api/v1/admin/cosmetics", {
          method: "POST",
          body: JSON.stringify(body)
        });
        createBtn.disabled = false;
        if (!res.ok) {
          const err = (data && data.error) || "";
          createMsg =
            err === "cosmetic_exists"
              ? "ID ซ้ำ — เปลี่ยนชื่อหรือใส่ ID ใหม่"
              : err === "protected_title_id"
                ? "ID นี้สงวนไว้สำหรับยศเลเวล / Ranking"
                : err === "invalid_id"
                  ? "ID ไม่ถูกต้อง"
                  : "สร้างยศไม่สำเร็จ";
          createMsgOk = false;
          paint();
          return;
        }
        const item = data && data.item;
        if (item) {
          items = [item].concat(items.filter((x) => x.id !== item.id));
          selectedCosmeticId = item.id;
          kindFilter = "title";
          mode = "gift";
        }
        createMsg = "สร้างยศแล้ว: " + ((item && item.name) || name);
        createMsgOk = true;
        paint();
      };
    }

    root.querySelectorAll("#giftMode [data-mode]").forEach((btn) => {
      btn.onclick = () => {
        mode = btn.getAttribute("data-mode") || "gift";
        selectedCosmeticId = "";
        if (mode === "revoke" && selectedUser) loadOwned();
        else paint();
      };
    });

    root.querySelector("#giftSearch").onclick = async () => {
      const q = root.querySelector("#giftQ").value.trim();
      const box = root.querySelector("#giftUserList");
      if (!q) {
        setMsg("ใส่คำค้นหาก่อน", false);
        return;
      }
      box.innerHTML = `<div class="loading">Searching…</div>`;
      const params = new URLSearchParams({ q });
      const { res, data } = await api("/api/v1/admin/users?" + params.toString(), { method: "GET" });
      if (!res.ok) {
        box.innerHTML = `<div class="empty">ค้นหาไม่สำเร็จ</div>`;
        return;
      }
      const users = (data.users || []).filter((u) => u.accountType === "registered");
      if (!users.length) {
        box.innerHTML = `<div class="empty">ไม่พบผู้เล่น</div>`;
        return;
      }
      box.innerHTML = users
        .slice(0, 12)
        .map(
          (u) => `<button type="button" class="gift-user-card${
            selectedUser && selectedUser.id === u.id ? " on" : ""
          }" data-uid="${esc(u.id)}">
            <b>${esc(u.displayName || u.username)}</b>
            <span class="tiny muted">@${esc(u.username)}</span>
            <span class="tiny">${esc(u.status || "")}</span>
          </button>`
        )
        .join("");
      box.querySelectorAll("[data-uid]").forEach((btn) => {
        btn.onclick = () => {
          const id = btn.getAttribute("data-uid");
          selectedUser = users.find((u) => u.id === id) || null;
          selectedCosmeticId = "";
          if (mode === "revoke") loadOwned();
          else paint();
        };
      });
    };

    root.querySelectorAll("#giftKinds [data-kind]").forEach((btn) => {
      btn.onclick = () => {
        kindFilter = btn.getAttribute("data-kind") || "all";
        paint();
      };
    });

    const itemQ = root.querySelector("#giftItemQ");
    if (itemQ) {
      itemQ.oninput = () => {
        itemQuery = itemQ.value || "";
        // Refresh list without stealing focus mid-type
        const start = itemQ.selectionStart;
        const end = itemQ.selectionEnd;
        paint();
        const again = root.querySelector("#giftItemQ");
        if (again) {
          again.focus();
          try {
            again.setSelectionRange(start, end);
          } catch {
            /* ignore */
          }
        }
      };
    }
    const itemSortEl = root.querySelector("#giftItemSort");
    if (itemSortEl) {
      itemSortEl.onchange = () => {
        itemSort = itemSortEl.value || "level";
        paint();
      };
    }

    root.querySelectorAll("#giftItems [data-id]").forEach((btn) => {
      btn.onclick = () => {
        if (btn.disabled) return;
        selectedCosmeticId = btn.getAttribute("data-id") || "";
        paint();
      };
    });

    const sendBtn = root.querySelector("#giftSend");
    if (sendBtn) {
      sendBtn.onclick = async () => {
        if (!selectedUser || !selectedCosmeticId) return;
        if (mode === "revoke" && PROTECTED_IDS.has(selectedCosmeticId)) {
          setMsg("ของเริ่มต้นดึงไม่ได้", false);
          return;
        }
        sendBtn.disabled = true;
        setMsg(mode === "gift" ? "กำลังมอบ…" : "กำลังดึงกลับ…", true);
        const note = root.querySelector("#giftNote").value.trim();
        if (mode === "gift") {
          const autoEquip = root.querySelector("#giftAutoEquip").checked;
          const r = await api("/api/v1/admin/cosmetics/gift", {
            method: "POST",
            body: JSON.stringify({
              userId: selectedUser.id,
              cosmeticId: selectedCosmeticId,
              autoEquip,
              note
            })
          });
          sendBtn.disabled = false;
          if (!r.res.ok) {
            setMsg((r.data && r.data.error) || "มอบไม่สำเร็จ", false);
            return;
          }
          const name = r.data && r.data.cosmetic ? r.data.cosmetic.name : "ของ";
          const already = r.data && r.data.alreadyOwned ? " (มีอยู่แล้ว — ยืนยันให้)" : "";
          const eq = r.data && r.data.equipped ? " · สวมให้แล้ว" : "";
          setMsg("มอบ「" + name + "」ให้ @" + selectedUser.username + " แล้ว" + already + eq, true);
          return;
        }

        const r = await api("/api/v1/admin/cosmetics/revoke", {
          method: "POST",
          body: JSON.stringify({
            userId: selectedUser.id,
            cosmeticId: selectedCosmeticId,
            note
          })
        });
        sendBtn.disabled = false;
        if (!r.res.ok) {
          const err = (r.data && r.data.error) || "ดึงไม่สำเร็จ";
          setMsg(
            err === "protected_cosmetic" ? "ของเริ่มต้นดึงไม่ได้" : err === "not_owned" ? "ผู้เล่นไม่มีของนี้" : err,
            false
          );
          return;
        }
        const name = r.data && r.data.cosmetic ? r.data.cosmetic.name : "ของ";
        selectedCosmeticId = "";
        setMsg("ดึง「" + name + "」จาก @" + selectedUser.username + " แล้ว", true);
        await loadOwned();
      };
    }
  }

  paint();
}
