import { api } from "./api.js";

const CATS = [
  { id: "all", label: "ทั้งหมด" },
  { id: "announce", label: "ประกาศ" },
  { id: "invite", label: "เชิญห้อง" },
  { id: "game", label: "เกม" },
  { id: "friend", label: "เพื่อน" },
  { id: "other", label: "อื่นๆ" }
];

let cacheItems = [];
let activeCat = "all";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function when(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return "เมื่อสักครู่";
    if (diff < 3_600_000) return Math.floor(diff / 60_000) + " นาทีที่แล้ว";
    if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + " ชม.ที่แล้ว";
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function catOf(n) {
  const type = String(n.type || "");
  if (type === "announcement") return "announce";
  if (type === "room_invitation") return "invite";
  if (type === "game_finished") return "game";
  if (type === "friend_request" || type === "friend") return "friend";
  return "other";
}

function notifMeta(n) {
  const type = String(n.type || "");
  const kind = n.payload && n.payload.kind ? String(n.payload.kind) : "";
  if (type === "announcement") {
    if (kind === "warning") return { label: "เตือน", cls: "notif-warning", icon: "!" };
    if (kind === "danger") return { label: "ถึงคุณ", cls: "notif-danger", icon: "!" };
    if (kind === "alert") return { label: "เตือนถึงคุณ", cls: "notif-alert", icon: "!!" };
    return { label: "ประกาศ", cls: "notif-info", icon: "📢" };
  }
  if (type === "room_invitation") return { label: "เชิญห้อง", cls: "notif-invite", icon: "🎮" };
  if (type === "game_finished") return { label: "จบเกม", cls: "notif-game", icon: "🏁" };
  if (type === "friend_request" || type === "friend") return { label: "เพื่อน", cls: "notif-friend", icon: "👥" };
  return { label: "แจ้งเตือน", cls: "notif-default", icon: "🔔" };
}

function filteredItems() {
  if (activeCat === "all") return cacheItems;
  return cacheItems.filter((n) => catOf(n) === activeCat);
}

function selectedIds() {
  return [...document.querySelectorAll("#notifList input[data-pick]:checked")].map((el) =>
    el.getAttribute("data-pick")
  );
}

function syncSelectionUi() {
  const ids = selectedIds();
  const delSel = document.getElementById("notifDeleteSelected");
  const selectAll = document.getElementById("notifSelectAll");
  const boxes = [...document.querySelectorAll("#notifList input[data-pick]")];
  if (delSel) {
    delSel.classList.toggle("hidden", ids.length === 0);
    delSel.disabled = ids.length === 0;
    delSel.textContent = ids.length ? `ลบที่เลือก (${ids.length})` : "ลบที่เลือก";
  }
  if (selectAll) {
    selectAll.checked = boxes.length > 0 && ids.length === boxes.length;
    selectAll.indeterminate = ids.length > 0 && ids.length < boxes.length;
  }
}

function paintCats() {
  const wrap = document.getElementById("notifCats");
  if (!wrap) return;
  const counts = Object.fromEntries(CATS.map((c) => [c.id, 0]));
  counts.all = cacheItems.length;
  for (const n of cacheItems) counts[catOf(n)] = (counts[catOf(n)] || 0) + 1;

  wrap.innerHTML = CATS.map((c) => {
    const count = counts[c.id] || 0;
    const on = activeCat === c.id;
    return `<button type="button" class="notif-cat${on ? " on" : ""}" data-cat="${c.id}" role="tab" aria-selected="${on ? "true" : "false"}">
      <span>${esc(c.label)}</span>
      <em>${count}</em>
    </button>`;
  }).join("");

  wrap.querySelectorAll("[data-cat]").forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const next = btn.getAttribute("data-cat") || "all";
      if (next === activeCat) return;
      activeCat = next;
      paintCats();
      renderList();
    };
  });
}

function renderList() {
  const list = document.getElementById("notifList");
  const empty = document.getElementById("notifEmpty");
  const toolbar = document.getElementById("notifToolbar");
  const sub = document.getElementById("notifSub");
  if (!list) return;

  const items = filteredItems();
  if (sub) {
    const catLabel = (CATS.find((c) => c.id === activeCat) || CATS[0]).label;
    sub.textContent = `${catLabel} · ${items.length} รายการ`;
  }
  if (toolbar) toolbar.classList.toggle("hidden", !items.length);

  if (!items.length) {
    list.innerHTML = "";
    if (empty) {
      empty.classList.remove("hidden");
      empty.textContent =
        cacheItems.length && activeCat !== "all"
          ? "ไม่มีรายการในหมวดนี้"
          : "ยังไม่มีการแจ้งเตือน";
    }
    syncSelectionUi();
    return;
  }
  if (empty) empty.classList.add("hidden");

  list.innerHTML = items
    .map((n) => {
      const meta = notifMeta(n);
      return `
    <li class="notif-item ${n.readAt ? "is-read" : "unread"} ${meta.cls}" data-id="${esc(n.id)}" data-cat="${catOf(n)}">
      <label class="notif-check">
        <input type="checkbox" data-pick="${esc(n.id)}" aria-label="เลือกข้อความ">
      </label>
      <div class="notif-icon" aria-hidden="true">${meta.icon}</div>
      <div class="grow">
        <div class="notif-top">
          <span class="notif-pill">${esc(meta.label)}</span>
          <span class="notif-time">${esc(when(n.createdAt))}</span>
        </div>
        <b class="notif-item-title">${esc(n.title)}</b>
        <div class="notif-body">${esc(n.body || "")}</div>
      </div>
      <button type="button" class="notif-x" data-del="${esc(n.id)}" aria-label="ลบ">×</button>
    </li>`;
    })
    .join("");

  list.querySelectorAll(".notif-item").forEach((li) => {
    li.onclick = async (e) => {
      e.stopPropagation();
      if (e.target.closest("[data-del]") || e.target.closest(".notif-check")) return;
      const id = li.getAttribute("data-id");
      await api("/api/v1/notifications/" + id, {
        method: "PATCH",
        body: JSON.stringify({ read: true })
      });
      // Soft update: keep panel open and preserve category/scroll.
      const row = cacheItems.find((n) => n.id === id);
      if (row) row.readAt = new Date().toISOString();
      paintCats();
      renderList();
      const dot = document.getElementById("notifDot");
      if (dot) dot.classList.toggle("hidden", !cacheItems.some((n) => !n.readAt));
    };
  });
  list.querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute("data-del");
      await api("/api/v1/notifications/" + id, { method: "DELETE" });
      cacheItems = cacheItems.filter((n) => n.id !== id);
      paintCats();
      renderList();
      const dot = document.getElementById("notifDot");
      if (dot) dot.classList.toggle("hidden", !cacheItems.some((n) => !n.readAt));
    };
  });
  list.querySelectorAll("input[data-pick]").forEach((box) => {
    box.onclick = (e) => e.stopPropagation();
    box.onchange = (e) => {
      e.stopPropagation();
      syncSelectionUi();
    };
  });
  list.querySelectorAll(".notif-check").forEach((lab) => {
    lab.onclick = (e) => e.stopPropagation();
  });
  syncSelectionUi();
}

export async function refreshNotifications() {
  const { res, data } = await api("/api/v1/notifications", { method: "GET" });
  const list = document.getElementById("notifList");
  const empty = document.getElementById("notifEmpty");
  const dot = document.getElementById("notifDot");
  if (!list) return [];

  if (!res.ok) {
    cacheItems = [];
    list.innerHTML = "";
    paintCats();
    if (empty) {
      empty.classList.remove("hidden");
      empty.textContent = "โหลดการแจ้งเตือนไม่สำเร็จ";
    }
    if (dot) dot.classList.add("hidden");
    syncSelectionUi();
    return [];
  }

  cacheItems = (data && data.items) || [];
  const unread = cacheItems.filter((n) => !n.readAt).length;
  if (dot) dot.classList.toggle("hidden", unread === 0);
  paintCats();
  renderList();
  return cacheItems;
}

export function wireNotifications() {
  const btn = document.getElementById("notifBtn");
  const panel = document.getElementById("notifPanel");
  const markAll = document.getElementById("notifMarkAll");
  const deleteAll = document.getElementById("notifDeleteAll");
  const deleteSelected = document.getElementById("notifDeleteSelected");
  const selectAll = document.getElementById("notifSelectAll");
  if (!btn || !panel) return;

  paintCats();

  // Keep panel open while interacting; re-render used to detach click targets
  // and the document outside-click handler then closed the panel.
  panel.addEventListener("click", (e) => e.stopPropagation());
  panel.addEventListener("mousedown", (e) => e.stopPropagation());

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const willOpen = panel.classList.contains("hidden");
    panel.classList.toggle("hidden", !willOpen);
    if (willOpen) await refreshNotifications();
  });

  document.addEventListener("click", (e) => {
    if (panel.classList.contains("hidden")) return;
    if (btn.contains(e.target) || panel.contains(e.target)) return;
    // Detached nodes (after re-render) are not "contained" — ignore those.
    if (e.target && e.target.isConnected === false) return;
    panel.classList.add("hidden");
  });

  if (markAll) {
    markAll.onclick = async (e) => {
      e.stopPropagation();
      await api("/api/v1/notifications/read-all", { method: "POST", body: "{}" });
      refreshNotifications();
    };
  }

  if (deleteAll) {
    deleteAll.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm("ลบการแจ้งเตือนทั้งหมด?")) return;
      await api("/api/v1/notifications/delete-all", { method: "POST", body: "{}" });
      activeCat = "all";
      refreshNotifications();
    };
  }

  if (deleteSelected) {
    deleteSelected.onclick = async (e) => {
      e.stopPropagation();
      const ids = selectedIds();
      if (!ids.length) return;
      if (!confirm(`ลบข้อความที่เลือก ${ids.length} รายการ?`)) return;
      await api("/api/v1/notifications/delete-many", {
        method: "POST",
        body: JSON.stringify({ ids })
      });
      refreshNotifications();
    };
  }

  if (selectAll) {
    selectAll.onchange = (e) => {
      e.stopPropagation();
      const on = selectAll.checked;
      document.querySelectorAll("#notifList input[data-pick]").forEach((box) => {
        box.checked = on;
      });
      syncSelectionUi();
    };
  }

  refreshNotifications();
}
