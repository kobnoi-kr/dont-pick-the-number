import { api } from "./api.js";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function userRow(u, online) {
  const av = u.avatarUrl
    ? `<img class="friend-av" src="${esc(u.avatarUrl)}" alt="" width="32" height="32" referrerpolicy="no-referrer">`
    : `<span class="friend-av ph">${esc((u.displayName || "?").slice(0, 1).toUpperCase())}</span>`;
  const dot = online ? `<span class="live-dot" title="ออนไลน์"></span>` : "";
  return `<div class="friend-meta">${av}<div><div class="friend-name-line">${dot}<span>${esc(u.displayName)}</span></div>${
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
        : `<div class="content-grid friends-layout">
            <div class="card">
              <h3 style="margin-top:0">รหัสเพื่อนของคุณ</h3>
              <div class="friend-code-row">
                <code id="myCode">—</code>
                <button type="button" class="btn ghost sm" id="copyCode">คัดลอก</button>
              </div>
              <form id="codeForm" class="form-grid">
                <label>เพิ่มด้วยรหัส
                  <input id="friendCodeInput" type="text" maxlength="16" placeholder="NV-XXXXXX" autocomplete="off">
                </label>
                <button class="btn" type="submit">ส่งคำขอ</button>
              </form>
              <div class="form-grid" style="margin-top:4px">
                <label>ค้นหาจากชื่อ
                  <input id="searchInput" type="text" maxlength="64" placeholder="พิมพ์อย่างน้อย 2 ตัวอักษร" autocomplete="off">
                </label>
              </div>
              <ul class="list" id="searchResults"></ul>
            </div>
            <div class="panel-right">
              <div class="card">
                <h3 style="margin-top:0">เพื่อนออนไลน์</h3>
                <ul class="list" id="onlineFriends"></ul>
                <p class="tiny empty-line" id="onlineEmpty">ยังไม่มีเพื่อนออนไลน์</p>
              </div>
              <div class="card">
                <h3 style="margin-top:0">คำขอเข้า</h3>
                <ul class="list" id="incoming"></ul>
                <p class="tiny empty-line" id="incomingEmpty">ไม่มีคำขอ</p>
              </div>
              <div class="card">
                <h3 style="margin-top:0">คำขอที่ส่ง</h3>
                <ul class="list" id="outgoing"></ul>
                <p class="tiny empty-line" id="outgoingEmpty">ยังไม่ได้ส่งคำขอ</p>
              </div>
              <div class="card">
                <h3 style="margin-top:0">เพื่อนทั้งหมด</h3>
                <ul class="list" id="friendsAll"></ul>
                <p class="tiny empty-line" id="friendsEmpty">ยังไม่มีเพื่อน</p>
              </div>
              <div class="card">
                <h3 style="margin-top:0">บล็อกแล้ว</h3>
                <ul class="list" id="blockedList"></ul>
                <p class="tiny empty-line" id="blockedEmpty">ยังไม่มีรายการบล็อก</p>
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

  function fillList(elId, emptyId, items, makeActs) {
    const el = root.querySelector("#" + elId);
    const empty = root.querySelector("#" + emptyId);
    el.innerHTML = "";
    empty.classList.toggle("hidden", !!items.length);
    items.forEach((item) => {
      const li = document.createElement("li");
      const u = item.user || item;
      li.innerHTML = userRow(u, onlineIds.has(u.id));
      if (makeActs) {
        const acts = document.createElement("div");
        acts.className = "row-actions";
        makeActs(acts, item);
        li.appendChild(acts);
      }
      el.appendChild(li);
    });
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
    if (res.ok) refreshFriends();
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
    const friendsCache = (data.friends || []).map((f) => f.user).filter(Boolean);
    const onlineRes = await api("/api/v1/friends/online", { method: "GET" });
    onlineIds = new Set((onlineRes.data && onlineRes.data.online) || []);

    fillList(
      "onlineFriends",
      "onlineEmpty",
      friendsCache.filter((u) => onlineIds.has(u.id)).map((u) => ({ user: u }))
    );
    fillList("incoming", "incomingEmpty", data.incoming || [], (acts, item) => {
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
    });
    fillList("outgoing", "outgoingEmpty", data.outgoing || [], (acts, item) => {
      const c = makeBtn("ยกเลิก");
      c.onclick = async () => {
        await api("/api/v1/friends/" + item.friendshipId, { method: "DELETE" });
        refreshFriends();
      };
      acts.appendChild(c);
    });
    fillList("friendsAll", "friendsEmpty", data.friends || [], (acts, item) => {
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
    });
    fillList("blockedList", "blockedEmpty", data.blocked || [], (acts, item) => {
      const u = makeBtn("อันบล็อก");
      u.onclick = async () => {
        const uid = item.user && item.user.id;
        if (!uid) return;
        const res = await api("/api/v1/friends/" + uid + "/block", { method: "DELETE" });
        setMsg(res.res.ok ? "ปลดบล็อกแล้ว" : "ปลดบล็อกไม่สำเร็จ", res.res.ok);
        refreshFriends();
      };
      acts.appendChild(u);
    });
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

  let searchTimer = null;
  root.querySelector("#searchInput").oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const q = root.querySelector("#searchInput").value.trim();
      const box = root.querySelector("#searchResults");
      box.innerHTML = "";
      if (q.length < 2) return;
      const r = await api("/api/v1/friends/search?q=" + encodeURIComponent(q), { method: "GET" });
      (r.data && r.data.users || []).forEach((u) => {
        const li = document.createElement("li");
        li.innerHTML = userRow(u, false);
        const a = makeBtn("เพิ่ม");
        a.onclick = () => sendRequest({ userId: u.id });
        li.appendChild(a);
        box.appendChild(li);
      });
    }, 250);
  };

  await refreshFriends();
  if (root._friendsTimer) clearInterval(root._friendsTimer);
  root._friendsTimer = setInterval(refreshFriends, 15000);
}
