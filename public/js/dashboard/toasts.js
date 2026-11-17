import { api } from "./api.js";
import { playAnnouncementBell } from "./sfx.js";

const SEEN_KEY = "nv-ann-seen";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function ensureToastStyles() {
  if (document.getElementById("nvToastCss")) return;
  const style = document.createElement("style");
  style.id = "nvToastCss";
  style.textContent = `
    .toast-host{
      position:fixed;top:16px;left:50%;transform:translateX(-50%);
      z-index:130;width:min(440px,calc(100vw - 24px));
      display:flex;flex-direction:column;gap:10px;pointer-events:none;
    }
    .toast-popup{
      pointer-events:auto;display:grid;grid-template-columns:6px 1fr auto;
      border-radius:14px;overflow:hidden;background:#121a2b;
      border:1px solid rgba(255,255,255,.12);
      box-shadow:0 12px 40px rgba(0,0,0,.45);
      opacity:0;transform:translateY(-12px);
      transition:opacity .22s ease,transform .22s ease;
      color:#e8eefc;font-family:system-ui,Segoe UI,sans-serif;
    }
    .toast-popup.in{opacity:1;transform:translateY(0)}
    .toast-popup.out{opacity:0;transform:translateY(-10px)}
    .toast-accent{background:#22c55e}
    .toast-info .toast-accent{background:#22c55e}
    .toast-warning .toast-accent{background:#f59e0b}
    .toast-danger .toast-accent{background:#ef4444}
    .toast-alert .toast-accent{
      background:repeating-linear-gradient(-45deg,#f59e0b 0 8px,#ef4444 8px 16px)
    }
    .toast-body{padding:12px 14px;min-width:0}
    .toast-kicker{
      font-size:.72rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;
      color:#9aa4b2;margin-bottom:2px
    }
    .toast-title{font-weight:800;margin-bottom:4px}
    .toast-text{color:#c5d0e6;font-size:.9rem;line-height:1.4;white-space:pre-wrap;word-break:break-word}
    .toast-close{
      border:0;background:transparent;color:#9aa4b2;font-size:1.25rem;
      padding:8px 12px;cursor:pointer;align-self:start
    }
    .toast-close:hover{color:#e8eefc}
  `;
  document.head.appendChild(style);
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
  ensureToastStyles();
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
  playAnnouncementBell();
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
