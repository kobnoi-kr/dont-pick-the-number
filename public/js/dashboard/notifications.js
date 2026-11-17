import { api } from "./api.js";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function when(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function notifMeta(n) {
  const type = String(n.type || "");
  const kind = n.payload && n.payload.kind ? String(n.payload.kind) : "";
  if (type === "announcement") {
    if (kind === "warning") return { label: "เตือน", cls: "notif-warning" };
    if (kind === "danger") return { label: "ถึงคุณ", cls: "notif-danger" };
    if (kind === "alert") return { label: "เตือนถึงคุณ", cls: "notif-alert" };
    return { label: "ประกาศ", cls: "notif-info" };
  }
  if (type === "room_invitation") return { label: "เชิญห้อง", cls: "notif-invite" };
  if (type === "game_finished") return { label: "จบเกม", cls: "notif-game" };
  if (type === "friend_request" || type === "friend") return { label: "เพื่อน", cls: "notif-friend" };
  return { label: "แจ้งเตือน", cls: "notif-default" };
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

export async function refreshNotifications() {
  const { res, data } = await api("/api/v1/notifications", { method: "GET" });
  const list = document.getElementById("notifList");
  const empty = document.getElementById("notifEmpty");
  const dot = document.getElementById("notifDot");
  const toolbar = document.querySelector(".notif-toolbar");
  if (!list) return [];
  if (!res.ok) {
    list.innerHTML = "";
    if (empty) {
      empty.classList.remove("hidden");
      empty.textContent = "โหลดการแจ้งเตือนไม่สำเร็จ";
    }
    if (dot) dot.classList.add("hidden");
    if (toolbar) toolbar.classList.add("hidden");
    syncSelectionUi();
    return [];
  }
  const items = (data && data.items) || [];
  const unread = items.filter((n) => !n.readAt).length;
  if (dot) dot.classList.toggle("hidden", unread === 0);
  if (toolbar) toolbar.classList.toggle("hidden", !items.length);
  if (!items.length) {
    list.innerHTML = "";
    if (empty) {
      empty.classList.remove("hidden");
      empty.textContent = "ยังไม่มีการแจ้งเตือน";
    }
    const selectAll = document.getElementById("notifSelectAll");
    if (selectAll) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
    }
    syncSelectionUi();
    return items;
  }
  if (empty) empty.classList.add("hidden");
  list.innerHTML = items
    .map((n) => {
      const meta = notifMeta(n);
      return `
    <li class="notif-item ${n.readAt ? "" : "unread"} ${meta.cls}" data-id="${esc(n.id)}">
      <label class="notif-check" onclick="event.stopPropagation()">
        <input type="checkbox" data-pick="${esc(n.id)}" aria-label="เลือกข้อความ">
      </label>
      <div class="notif-accent" aria-hidden="true"></div>
      <div class="grow">
        <div class="tiny notif-kicker">${esc(meta.label)}</div>
        <b>${esc(n.title)}</b>
        <div class="tiny">${esc(n.body || "")}</div>
        <div class="tiny">${when(n.createdAt)}</div>
      </div>
      <button type="button" class="btn ghost sm" data-del="${esc(n.id)}" aria-label="ลบ">✕</button>
    </li>`;
    })
    .join("");

  list.querySelectorAll(".notif-item").forEach((li) => {
    li.onclick = async (e) => {
      if (e.target.closest("[data-del]") || e.target.closest(".notif-check")) return;
      const id = li.getAttribute("data-id");
      await api("/api/v1/notifications/" + id, {
        method: "PATCH",
        body: JSON.stringify({ read: true })
      });
      refreshNotifications();
    };
  });
  list.querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      await api("/api/v1/notifications/" + btn.getAttribute("data-del"), { method: "DELETE" });
      refreshNotifications();
    };
  });
  list.querySelectorAll("input[data-pick]").forEach((box) => {
    box.onchange = () => syncSelectionUi();
  });
  syncSelectionUi();
  return items;
}

export function wireNotifications() {
  const btn = document.getElementById("notifBtn");
  const panel = document.getElementById("notifPanel");
  const markAll = document.getElementById("notifMarkAll");
  const deleteAll = document.getElementById("notifDeleteAll");
  const deleteSelected = document.getElementById("notifDeleteSelected");
  const selectAll = document.getElementById("notifSelectAll");
  if (!btn || !panel) return;

  btn.onclick = async () => {
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) await refreshNotifications();
  };
  document.addEventListener("click", (e) => {
    if (panel.classList.contains("hidden")) return;
    if (panel.contains(e.target) || btn.contains(e.target)) return;
    panel.classList.add("hidden");
  });

  if (markAll) {
    markAll.onclick = async () => {
      await api("/api/v1/notifications/read-all", { method: "POST", body: "{}" });
      refreshNotifications();
    };
  }

  if (deleteAll) {
    deleteAll.onclick = async () => {
      if (!confirm("ลบการแจ้งเตือนทั้งหมด?")) return;
      await api("/api/v1/notifications/delete-all", { method: "POST", body: "{}" });
      refreshNotifications();
    };
  }

  if (deleteSelected) {
    deleteSelected.onclick = async () => {
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
    selectAll.onchange = () => {
      const on = selectAll.checked;
      document.querySelectorAll("#notifList input[data-pick]").forEach((box) => {
        box.checked = on;
      });
      syncSelectionUi();
    };
  }

  refreshNotifications();
}
