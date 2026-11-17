import { api } from "./api.js";

const SEEN_KEY = "nv-ann-seen";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function readSeen() {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    return Array.isArray(raw) ? raw.map(String) : [];
  } catch {
    return [];
  }
}

function markSeen(id) {
  const seen = readSeen();
  if (!seen.includes(id)) {
    seen.push(id);
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen.slice(-80)));
  }
}

function kindMeta(kind) {
  if (kind === "warning") return { label: "เตือน", cls: "toast-warning" };
  if (kind === "danger") return { label: "ถึงคุณ", cls: "toast-danger" };
  if (kind === "alert") return { label: "เตือนถึงคุณ", cls: "toast-alert" };
  return { label: "ประกาศ", cls: "toast-info" };
}

function ensureHost() {
  let host = document.getElementById("toastHost");
  if (host) return host;
  host = document.createElement("div");
  host.id = "toastHost";
  host.className = "toast-host";
  host.setAttribute("aria-live", "polite");
  document.body.appendChild(host);
  return host;
}

export function showAnnouncementToast(ann) {
  if (!ann || !ann.id) return;
  const host = ensureHost();
  if ([...host.children].some((n) => n.dataset && n.dataset.annId === ann.id)) return;
  const meta = kindMeta(ann.kind);
  const el = document.createElement("div");
  el.className = `toast-popup ${meta.cls}`;
  el.dataset.annId = ann.id;
  el.innerHTML = `
    <div class="toast-accent" aria-hidden="true"></div>
    <div class="toast-body">
      <div class="toast-kicker">${esc(meta.label)}</div>
      <div class="toast-title">${esc(ann.title)}</div>
      <div class="toast-text">${esc(ann.body)}</div>
    </div>
    <button type="button" class="toast-close" aria-label="ปิด">×</button>
  `;
  const close = () => {
    markSeen(ann.id);
    el.classList.add("out");
    setTimeout(() => el.remove(), 220);
  };
  el.querySelector(".toast-close").onclick = close;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  // Auto-dismiss general/info after 12s; personal stay until closed
  if (ann.kind === "info" || ann.kind === "warning") {
    setTimeout(() => {
      if (document.body.contains(el)) close();
    }, 12000);
  }
}

export async function loadAnnouncementToasts() {
  const { res, data } = await api("/api/v1/announcements/active", { method: "GET" });
  if (!res.ok) return;
  const seen = new Set(readSeen());
  const items = data.announcements || [];
  for (const a of items) {
    if (seen.has(a.id)) continue;
    showAnnouncementToast(a);
  }
  return items;
}

/** Live push from WS — show even if previously unseen only once per id in session host. */
export function onLiveAnnouncement(ann) {
  if (!ann || !ann.id) return;
  const seen = new Set(readSeen());
  if (seen.has(ann.id)) return;
  showAnnouncementToast(ann);
}

let pollTimer = null;
export function startAnnouncementPoll(intervalMs = 25000) {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    loadAnnouncementToasts().catch(() => {});
  }, intervalMs);
}
