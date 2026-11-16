import { api } from "./api.js";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function when(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export async function refreshNotifications() {
  const { res, data } = await api("/api/v1/notifications", { method: "GET" });
  const list = document.getElementById("notifList");
  const empty = document.getElementById("notifEmpty");
  const dot = document.getElementById("notifDot");
  if (!list) return [];
  if (!res.ok) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    empty.textContent = "Notifications unavailable";
    if (dot) dot.classList.add("hidden");
    return [];
  }
  const items = (data && data.items) || [];
  const unread = items.filter((n) => !n.readAt).length;
  if (dot) dot.classList.toggle("hidden", unread === 0);
  if (!items.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    empty.textContent = "You're all caught up!";
    return items;
  }
  empty.classList.add("hidden");
  list.innerHTML = items.map((n) => `
    <li class="notif-item ${n.readAt ? "" : "unread"}" data-id="${esc(n.id)}">
      <div class="grow">
        <b>${esc(n.title)}</b>
        <div class="tiny">${esc(n.body || "")}</div>
        <div class="tiny">${when(n.createdAt)}</div>
      </div>
      <button type="button" class="btn ghost sm" data-del="${esc(n.id)}">✕</button>
    </li>`).join("");

  list.querySelectorAll(".notif-item").forEach((li) => {
    li.onclick = async (e) => {
      if (e.target.closest("[data-del]")) return;
      const id = li.getAttribute("data-id");
      await api("/api/v1/notifications/" + id, { method: "PATCH", body: JSON.stringify({ read: true }) });
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
  return items;
}

export function wireNotifications() {
  const btn = document.getElementById("notifBtn");
  const panel = document.getElementById("notifPanel");
  const markAll = document.getElementById("notifMarkAll");
  btn.onclick = async () => {
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) await refreshNotifications();
  };
  document.addEventListener("click", (e) => {
    if (panel.classList.contains("hidden")) return;
    if (panel.contains(e.target) || btn.contains(e.target)) return;
    panel.classList.add("hidden");
  });
  markAll.onclick = async () => {
    await api("/api/v1/notifications/read-all", { method: "POST", body: "{}" });
    refreshNotifications();
  };
  refreshNotifications();
}
