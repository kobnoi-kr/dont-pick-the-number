import { api } from "./api.js";

const PAGE_SIZE = 24;

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function userRow(u, online) {
  const av = u.avatarUrl
    ? `<img class="friend-av" src="${esc(u.avatarUrl)}" alt="" width="32" height="32" referrerpolicy="no-referrer">`
    : `<span class="friend-av ph">${esc((u.displayName || "?").slice(0, 1).toUpperCase())}</span>`;
  const dot = online ? `<span class="live-dot" title="ออนไลน์"></span>` : "";
  return `<div class="friend-meta">${av}<div><div class="friend-name-line">${dot}<span>${esc(
    u.displayName
  )}</span></div>${
    u.friendCode ? `<div class="tiny">${esc(u.friendCode)}</div>` : ""
  }</div></div>`;
}

function makeBtn(label, cls) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn ghost sm" + (cls ? " " + cls : "");
  b.textContent = label;
  return b;
}

function itemUser(item) {
  return item && (item.user || item);
}

function matchQuery(item, q) {
  if (!q) return true;
  const u = itemUser(item);
  if (!u) return false;
  const hay = `${u.displayName || ""} ${u.friendCode || ""} ${u.username || ""}`.toLowerCase();
  return hay.includes(q);
}

const TABS = [
  { id: "friends", label: "เพื่อน" },
  { id: "incoming", label: "คำขอเข้า" },
  { id: "outgoing", label: "คำขอที่ส่ง" },
  { id: "blocked", label: "บล็อก" }
];

export async function renderFriends(root, { user } = {}) {
  const guest = !user || user.accountType === "guest";
  root.innerHTML = `
    <section class="page-head">
      <div>
        <h2 style="margin:0">เพื่อน</h2>
        <p class="muted" style="margin:6px 0 0">รหัสเพื่อน · คำขอ · เพื่อนออนไลน์</p>
      </div>
    </section>
    <p class="msg" id="friendMsg"></p>
    ${
      guest
        ? `<div class="card"><p class="muted" style="margin:0">ผูกบัญชี Google/Discord ก่อนถึงจะใช้ระบบเพื่อนได้</p>
           <p style="margin:12px 0 0"><button type="button" class="btn" data-go-profile>ไปที่โปรไฟล์</button></p></div>`
        : `<div class="friends-shell">
            <div class="card friends-tools">
              <div class="friends-tools-top">
                <div>
                  <span class="tiny muted">รหัสเพื่อนของคุณ</span>
                  <div class="friend-code-row">
                    <code id="myCode">—</code>
                    <button type="button" class="btn ghost sm" id="copyCode">คัดลอก</button>
                  </div>
                </div>
                <form id="codeForm" class="friends-add-form">
                  <label class="friends-field">เพิ่มด้วยรหัส
                    <input id="friendCodeInput" type="text" maxlength="16" placeholder="NV-XXXXXX" autocomplete="off">
                  </label>
                  <button class="btn" type="submit">ส่งคำขอ</button>
                </form>
              </div>
              <div class="friends-find">
                <label class="friends-field">ค้นหาคนมาเพิ่ม
                  <input id="searchInput" type="text" maxlength="64" placeholder="พิมพ์อย่างน้อย 2 ตัวอักษร" autocomplete="off">
                </label>
                <ul class="list friends-find-results" id="searchResults"></ul>
              </div>
            </div>

            <div class="card friends-main">
              <div class="friends-tabs" id="friendsTabs" role="tablist" aria-label="หมวดเพื่อน"></div>
              <div class="friends-list-bar">
                <input id="listFilter" class="input" type="search" maxlength="64" placeholder="กรองในรายการ…" autocomplete="off" aria-label="กรองในรายการ">
                <label class="friends-online-only" id="onlineOnlyWrap">
                  <input type="checkbox" id="onlineOnly">
                  <span>ออนไลน์เท่านั้น</span>
                </label>
                <span class="tiny muted" id="listMeta"></span>
              </div>
              <div class="friends-list-scroll">
                <ul class="list" id="friendsList"></ul>
                <p class="tiny empty-line" id="friendsListEmpty">ยังไม่มีรายการ</p>
              </div>
              <div class="friends-pager" id="friendsPager" hidden>
                <button type="button" class="btn ghost sm" id="pagePrev">ก่อนหน้า</button>
                <span class="tiny muted" id="pageLabel"></span>
                <button type="button" class="btn ghost sm" id="pageNext">ถัดไป</button>
              </div>
            </div>
          </div>`
    }
  `;

  const goProfile = root.querySelector("[data-go-profile]");
  if (goProfile) goProfile.onclick = () => { location.hash = "#profile"; };
  if (guest) return;

  const msgEl = root.querySelector("#friendMsg");
  function setMsg(text, ok) {
    msgEl.textContent = text || "";
    msgEl.classList.toggle("ok", !!ok);
  }

  let onlineIds = new Set();
  let cache = { friends: [], incoming: [], outgoing: [], blocked: [] };
  let tab = "friends";
  let listQuery = "";
  let onlineOnly = false;
  let page = 0;

  function counts() {
    const online = (cache.friends || []).filter((f) => {
      const u = itemUser(f);
      return u && onlineIds.has(u.id);
    }).length;
    return {
      friends: (cache.friends || []).length,
      online,
      incoming: (cache.incoming || []).length,
      outgoing: (cache.outgoing || []).length,
      blocked: (cache.blocked || []).length
    };
  }

  function sourceForTab() {
    if (tab === "incoming") return cache.incoming || [];
    if (tab === "outgoing") return cache.outgoing || [];
    if (tab === "blocked") return cache.blocked || [];
    return cache.friends || [];
  }

  function filteredItems() {
    const q = listQuery.trim().toLowerCase();
    let items = sourceForTab().filter((item) => matchQuery(item, q));
    if (tab === "friends" && onlineOnly) {
      items = items.filter((item) => {
        const u = itemUser(item);
        return u && onlineIds.has(u.id);
      });
    }
    return items;
  }

  function paintTabs() {
    const box = root.querySelector("#friendsTabs");
    if (!box) return;
    const c = counts();
    box.innerHTML = TABS.map((t) => {
      const n = c[t.id] || 0;
      const extra =
        t.id === "friends" && c.online
          ? `<em>${n}</em><span class="friends-tab-online">${c.online} ออนไลน์</span>`
          : `<em>${n}</em>`;
      const on = tab === t.id;
      return `<button type="button" class="friends-tab${on ? " on" : ""}${
        t.id === "incoming" && n ? " has-badge" : ""
      }" data-tab="${t.id}" role="tab" aria-selected="${on ? "true" : "false"}">${esc(
        t.label
      )} ${extra}</button>`;
    }).join("");
    box.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.onclick = () => {
        const next = btn.getAttribute("data-tab") || "friends";
        if (next === tab) return;
        tab = next;
        page = 0;
        paint();
      };
    });
  }

  function bindRowActions(acts, item) {
    if (tab === "incoming") {
      const a = makeBtn("รับ");
      a.onclick = async () => {
        const r = await api("/api/v1/friends/" + item.friendshipId + "/accept", {
          method: "POST",
          body: "{}"
        });
        setMsg(r.res.ok ? "เป็นเพื่อนแล้ว" : "รับไม่สำเร็จ", r.res.ok);
        refreshFriends();
      };
      const d = makeBtn("ปฏิเสธ");
      d.onclick = async () => {
        await api("/api/v1/friends/" + item.friendshipId + "/decline", {
          method: "POST",
          body: "{}"
        });
        refreshFriends();
      };
      acts.append(a, d);
      return;
    }
    if (tab === "outgoing") {
      const c = makeBtn("ยกเลิก");
      c.onclick = async () => {
        await api("/api/v1/friends/" + item.friendshipId, { method: "DELETE" });
        refreshFriends();
      };
      acts.appendChild(c);
      return;
    }
    if (tab === "blocked") {
      const u = makeBtn("อันบล็อก");
      u.onclick = async () => {
        const uid = item.user && item.user.id;
        if (!uid) return;
        const res = await api("/api/v1/friends/" + uid + "/block", { method: "DELETE" });
        setMsg(res.res.ok ? "ปลดบล็อกแล้ว" : "ปลดบล็อกไม่สำเร็จ", res.res.ok);
        refreshFriends();
      };
      acts.appendChild(u);
      return;
    }
    const r = makeBtn("ลบ", "danger-outline");
    r.onclick = async () => {
      if (!confirm("ลบเพื่อนคนนี้?")) return;
      await api("/api/v1/friends/" + item.friendshipId, { method: "DELETE" });
      refreshFriends();
    };
    const b = makeBtn("บล็อก", "danger-outline");
    b.onclick = async () => {
      if (!confirm("บล็อกเพื่อนคนนี้? จะเลิกเป็นเพื่อนด้วย")) return;
      const uid = item.user && item.user.id;
      if (!uid) return;
      const res = await api("/api/v1/friends/" + uid + "/block", {
        method: "POST",
        body: "{}"
      });
      setMsg(res.res.ok ? "บล็อกแล้ว" : "บล็อกไม่สำเร็จ", res.res.ok);
      refreshFriends();
    };
    acts.append(r, b);
  }

  function emptyCopy(total, filtered) {
    if (!total) {
      if (tab === "incoming") return "ไม่มีคำขอเข้า";
      if (tab === "outgoing") return "ยังไม่ได้ส่งคำขอ";
      if (tab === "blocked") return "ยังไม่มีรายการบล็อก";
      return "ยังไม่มีเพื่อน";
    }
    if (!filtered) {
      if (tab === "friends" && onlineOnly) return "ไม่มีเพื่อนออนไลน์ตามตัวกรอง";
      return "ไม่พบรายการที่ตรงกับตัวกรอง";
    }
    return "";
  }

  function paintList() {
    const el = root.querySelector("#friendsList");
    const empty = root.querySelector("#friendsListEmpty");
    const meta = root.querySelector("#listMeta");
    const pager = root.querySelector("#friendsPager");
    const pageLabel = root.querySelector("#pageLabel");
    const prev = root.querySelector("#pagePrev");
    const next = root.querySelector("#pageNext");
    const onlineWrap = root.querySelector("#onlineOnlyWrap");
    if (!el || !empty) return;

    if (onlineWrap) onlineWrap.hidden = tab !== "friends";

    const all = sourceForTab();
    const items = filteredItems();
    const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE) || 1);
    if (page >= pages) page = pages - 1;
    if (page < 0) page = 0;
    const start = page * PAGE_SIZE;
    const slice = items.slice(start, start + PAGE_SIZE);

    el.innerHTML = "";
    slice.forEach((item) => {
      const li = document.createElement("li");
      const u = itemUser(item);
      li.innerHTML = userRow(u || {}, !!(u && onlineIds.has(u.id)));
      const acts = document.createElement("div");
      acts.className = "row-actions";
      bindRowActions(acts, item);
      li.appendChild(acts);
      el.appendChild(li);
    });

    const emptyText = emptyCopy(all.length, items.length);
    empty.textContent = emptyText || "ยังไม่มีรายการ";
    empty.classList.toggle("hidden", !!slice.length);

    if (meta) {
      if (!items.length) meta.textContent = "";
      else if (items.length <= PAGE_SIZE) meta.textContent = `${items.length} รายการ`;
      else meta.textContent = `${start + 1}–${start + slice.length} จาก ${items.length}`;
    }

    const showPager = items.length > PAGE_SIZE;
    if (pager) pager.hidden = !showPager;
    if (pageLabel) pageLabel.textContent = `หน้า ${page + 1}/${pages}`;
    if (prev) {
      prev.disabled = page <= 0;
      prev.onclick = () => {
        if (page <= 0) return;
        page -= 1;
        paintList();
      };
    }
    if (next) {
      next.disabled = page >= pages - 1;
      next.onclick = () => {
        if (page >= pages - 1) return;
        page += 1;
        paintList();
      };
    }
  }

  function paint() {
    paintTabs();
    paintList();
  }

  async function sendRequest(body) {
    const { res, data } = await api("/api/v1/friends/request", {
      method: "POST",
      body: JSON.stringify(body)
    });
    const map = {
      user_not_found: "ไม่พบผู้ใช้นี้",
      cannot_friend_self: "เพิ่มตัวเองไม่ได้",
      already_friends: "เป็นเพื่อนกันอยู่แล้ว",
      request_pending: "มีคำขอค้างอยู่แล้ว",
      registered_required: "ต้องผูกบัญชีก่อน",
      user_blocked: "บล็อกอยู่ — ปลดบล็อกก่อน"
    };
    const err = data && data.error;
    setMsg(res.ok ? "ส่งคำขอแล้ว" : map[err] || err || "ล้มเหลว", res.ok);
    if (res.ok) {
      tab = "outgoing";
      page = 0;
      refreshFriends();
    }
  }

  async function refreshFriends() {
    const list = await api("/api/v1/friends", { method: "GET" });
    if (!list.res.ok) {
      setMsg(
        (list.data && list.data.error) === "registered_required"
          ? "ผูกบัญชีก่อนถึงจะใช้ระบบเพื่อนได้"
          : "โหลดเพื่อนไม่สำเร็จ",
        false
      );
      return;
    }
    const data = list.data;
    root.querySelector("#myCode").textContent = (data.me && data.me.friendCode) || "—";
    cache = {
      friends: data.friends || [],
      incoming: data.incoming || [],
      outgoing: data.outgoing || [],
      blocked: data.blocked || []
    };
    const onlineRes = await api("/api/v1/friends/online", { method: "GET" });
    onlineIds = new Set((onlineRes.data && onlineRes.data.online) || []);
    paint();
  }

  root.querySelector("#copyCode").onclick = async () => {
    const t = root.querySelector("#myCode").textContent.trim();
    if (!t || t === "—") return;
    try {
      await navigator.clipboard.writeText(t);
      setMsg("คัดลอกแล้ว", true);
    } catch {
      setMsg(t, true);
    }
  };
  root.querySelector("#codeForm").onsubmit = async (e) => {
    e.preventDefault();
    await sendRequest({ friendCode: root.querySelector("#friendCodeInput").value });
    root.querySelector("#friendCodeInput").value = "";
  };

  root.querySelector("#listFilter").oninput = (e) => {
    listQuery = e.target.value || "";
    page = 0;
    paintList();
  };
  root.querySelector("#onlineOnly").onchange = (e) => {
    onlineOnly = !!e.target.checked;
    page = 0;
    paintList();
  };

  let searchTimer = null;
  root.querySelector("#searchInput").oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const q = root.querySelector("#searchInput").value.trim();
      const box = root.querySelector("#searchResults");
      box.innerHTML = "";
      box.classList.toggle("has-results", false);
      if (q.length < 2) return;
      const r = await api("/api/v1/friends/search?q=" + encodeURIComponent(q), { method: "GET" });
      const users = (r.data && r.data.users) || [];
      box.classList.toggle("has-results", !!users.length);
      users.forEach((u) => {
        const li = document.createElement("li");
        li.innerHTML = userRow(u, false);
        const a = makeBtn("เพิ่ม");
        a.onclick = () => sendRequest({ userId: u.id });
        li.appendChild(a);
        box.appendChild(li);
      });
      if (!users.length) {
        const li = document.createElement("li");
        li.className = "friends-find-empty";
        li.textContent = "ไม่พบผู้ใช้";
        box.appendChild(li);
        box.classList.add("has-results");
      }
    }, 250);
  };

  await refreshFriends();
  if (root._friendsTimer) clearInterval(root._friendsTimer);
  root._friendsTimer = setInterval(refreshFriends, 15000);
}
