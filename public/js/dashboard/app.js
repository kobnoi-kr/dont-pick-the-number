import { ensureGuest, api, playUrl } from "./api.js";
import { paintUser, wireShell, logout } from "./shell.js";
import { connectDashboardWs, onDashboardMessage, disconnectDashboardWs } from "./ws.js";
import { renderOverview } from "./overview.js";
import { renderLibrary } from "./library.js";
import { renderRooms } from "./rooms.js";
import { renderFriends } from "./friends.js";
import { renderRanking } from "./ranking.js";
import { renderProfile } from "./profile.js";
import { renderDecorate } from "./decorate.js";
import { renderShop } from "./shop.js";
import { renderLevel } from "./level.js";
import { wireNotifications, refreshNotifications, onNotificationPush } from "./notifications.js";
import { wireChat, onChatDmPush, refreshChatUnread } from "./chat.js";
import { loadAnnouncementToasts, onLiveAnnouncement, startAnnouncementPoll } from "./toasts.js";
import { showRoomInviteBanner } from "./invites.js";
import {
  enforceMaintenanceGate,
  applyLiveMaintenance,
  applyMaintenanceCountdown
} from "/js/maintenance-gate.js";
import { applyBanNotice, restoreBanNotice, clearBanNotice } from "/js/ban-gate.js";

const state = {
  user: null,
  view: "overview",
  favoriteMode: null
};

function setCreateCat(cat) {
  const next = cat === "wheel" ? "wheel" : "secret";
  state.pendingCat = next;
  const hidden = document.getElementById("crCat");
  if (hidden) hidden.value = next;
  const wrap = document.getElementById("crCatToggle");
  if (wrap) {
    wrap.querySelectorAll("[data-cat]").forEach((b) => {
      b.classList.toggle("on", b.getAttribute("data-cat") === next);
    });
  }
}

function openCreateModal(opts = {}) {
  document.getElementById("createModal").classList.remove("hidden");
  document.getElementById("crMsg").textContent = "";
  const cat = opts.cat || localStorage.getItem("nv-last-game") || "secret";
  setCreateCat(cat);
  const lockCat = !!opts.lockCat;
  const catField = document.getElementById("crCatField");
  if (catField) catField.classList.toggle("hidden", lockCat);
  const hint = document.getElementById("crHint");
  if (hint) {
    hint.textContent = lockCat
      ? "ตั้งชื่อห้อง แล้วเข้าล็อบบี้"
      : "เลือกเกม ตั้งชื่อห้อง แล้วเข้าล็อบบี้";
  }
}
function closeCreateModal() {
  document.getElementById("createModal").classList.add("hidden");
}

function wireVisToggle() {
  const wrap = document.getElementById("crVisToggle");
  const hidden = document.getElementById("crVis");
  if (!wrap || !hidden) return;
  wrap.querySelectorAll("[data-vis]").forEach((btn) => {
    btn.onclick = () => {
      wrap.querySelectorAll("[data-vis]").forEach((b) => b.classList.toggle("on", b === btn));
      hidden.value = btn.getAttribute("data-vis");
    };
  });
}

function wireCatToggle() {
  const wrap = document.getElementById("crCatToggle");
  if (!wrap) return;
  wrap.querySelectorAll("[data-cat]").forEach((btn) => {
    btn.onclick = () => setCreateCat(btn.getAttribute("data-cat"));
  });
}

async function createRoomFromModal() {
  const msg = document.getElementById("crMsg");
  const name =
    (document.getElementById("crName").value || "").trim() ||
    (state.user && (state.user.displayName || state.user.username)) ||
    "Player";
  const catEl = document.getElementById("crCat");
  const cat = (catEl && catEl.value === "wheel") || state.pendingCat === "wheel" ? "wheel" : "secret";
  state.pendingCat = cat;
  localStorage.setItem("nv-last-game", cat);
  const body = {
    visibility: document.getElementById("crVis").value || "public",
    title: document.getElementById("crName").value.trim(),
    displayName: name,
    setup: { cat }
  };
  msg.textContent = "กำลังสร้าง…";
  const { res, data } = await api("/api/v1/rooms", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok || !data || !data.code) {
    location.href = playUrl({
      create: body.visibility,
      name,
      setup: body.setup
    });
    return;
  }
  if (data.token) localStorage.setItem("dpn-token", data.token);
  localStorage.setItem("dpn-name", name);
  location.href = playUrl({ code: data.code, name });
}

async function navigate(view) {
  state.view = view || "overview";
  location.hash = state.view === "overview" ? "" : "#" + state.view;
  shell.setActive(state.view);
  const root = document.getElementById("viewRoot");
  if (root._friendsTimer) {
    clearInterval(root._friendsTimer);
    root._friendsTimer = null;
  }
  root.innerHTML = `<div class="card"><div class="loading">Loading…</div></div>`;
  const ctx = {
    user: state.user,
    openCreate: openCreateModal,
    openRooms: () => navigate("rooms"),
    favoriteMode: state.favoriteMode || localStorage.getItem("nv-last-game"),
    summaryData: state.view === "overview" ? state.summaryData : null,
    onSaved: (user) => {
      state.user = user;
      paintUser(user);
    }
  };
  // summary ใช้ได้รอบแรกเท่านั้น กันข้อมูลค้าง
  if (state.view === "overview" && state.summaryData) state.summaryData = null;
  if (state.view === "overview") await renderOverview(root, ctx);
  else if (state.view === "library") await renderLibrary(root, ctx);
  else if (state.view === "rooms") await renderRooms(root, ctx);
  else if (state.view === "ranking") await renderRanking(root, ctx);
  else if (state.view === "level") await renderLevel(root, ctx);
  else if (state.view === "friends") await renderFriends(root, ctx);
  else if (state.view === "decorate") await renderDecorate(root, ctx);
  else if (state.view === "shop") await renderShop(root, ctx);
  else if (state.view === "profile") await renderProfile(root, ctx);
  else await renderOverview(root, ctx);
}

const shell = wireShell({
  onNavigate: navigate,
  onLogout: logout
});

wireVisToggle();
wireCatToggle();
document.getElementById("crCancel").onclick = closeCreateModal;
document.getElementById("crSubmit").onclick = createRoomFromModal;
document.getElementById("createModal").addEventListener("click", (e) => {
  if (e.target.id === "createModal") closeCreateModal();
});

window.addEventListener("hashchange", () => {
  const view = (location.hash || "#overview").replace(/^#/, "") || "overview";
  if (view !== state.view) navigate(view);
});

onDashboardMessage((msg) => {
  if (msg.t === "lobby" && state.view === "rooms") navigate("rooms");
  if (msg.t === "chat:dm") {
    onChatDmPush(msg);
    return;
  }
  if (msg.t === "notification:new") {
    onNotificationPush(msg);
    refreshNotifications();
  }
  if (msg.t === "announcement:new") {
    onLiveAnnouncement(msg.announcement);
    refreshNotifications();
  }
  if (msg.t === "roomInvite") showRoomInviteBanner(msg);
  if (msg.t === "banned") {
    disconnectDashboardWs();
    applyBanNotice(msg);
    return;
  }
  if (msg.t === "unbanned") {
    clearBanNotice();
  }
  if (msg.t === "maintenance:countdown") {
    const roles = (state.user && state.user.roles) || [];
    const isAdmin =
      roles.includes("admin") || roles.includes("super_admin") || roles.includes("moderator");
    applyMaintenanceCountdown(msg, { bypass: isAdmin });
  }
  if (msg.t === "maintenance" && msg.enabled !== false) {
    const roles = (state.user && state.user.roles) || [];
    const isAdmin =
      roles.includes("admin") || roles.includes("super_admin") || roles.includes("moderator");
    const result = applyLiveMaintenance(msg.message, { bypass: isAdmin });
    if (result.blocked) return;
  }
  if (msg.t === "dashboard:update" && state.view === "overview") navigate("overview");
  if ((msg.t === "friend:update" || msg.t === "presence") && state.view === "friends") {
    navigate("friends");
  }
});

(async function boot() {
  let summaryData = null;
  try {
    const data = await ensureGuest();
    state.user = data.user || data;
    // Working session means ban overlay must not stick after unban.
    clearBanNotice();
    if (state.user && state.user.id) localStorage.setItem("dpn-token", state.user.id);
    if (state.user && (state.user.displayName || state.user.username)) {
      localStorage.setItem("dpn-name", state.user.displayName || state.user.username);
    }
    paintUser(state.user);
  } catch (err) {
    restoreBanNotice();
    paintUser(null);
  }

  try {
    const kicked = sessionStorage.getItem("nv-maint-msg");
    if (kicked != null) {
      sessionStorage.removeItem("nv-maint-msg");
      const roles = (state.user && state.user.roles) || [];
      const isAdmin =
        roles.includes("admin") || roles.includes("super_admin") || roles.includes("moderator");
      if (!isAdmin) {
        applyLiveMaintenance(kicked || "ระบบปิดปรับปรุงชั่วคราว กรุณากลับมาใหม่ภายหลัง");
        return;
      }
    }
  } catch {
    /* ignore */
  }

  // โหลดขนาน: summary + maintenance + active room
  const [summary, gate, active] = await Promise.all([
    api("/api/v1/dashboard/summary", { method: "GET" }).catch(() => ({ res: { ok: false }, data: null })),
    enforceMaintenanceGate({ hardBlock: true }),
    api("/api/v1/rooms/active", { method: "GET" }).catch(() => ({ res: { ok: false }, data: null }))
  ]);

  if (summary && summary.data) {
    summaryData = summary.data;
    if (summary.data.stats && summary.data.stats.favoriteMode) {
      state.favoriteMode = summary.data.stats.favoriteMode;
    }
    if (summary.data.user && summary.data.user.roles) {
      state.user = Object.assign({}, state.user || {}, { roles: summary.data.user.roles });
      paintUser(state.user);
    }
  }

  if (gate && gate.blocked) return;

  const seat = active && active.data && active.data.active;
  if (seat && seat.code && seat.phase !== "over") {
    location.replace(playUrl({ code: seat.code, name: localStorage.getItem("dpn-name") || "" }));
    return;
  }

  wireNotifications();
  wireChat(state.user);
  connectDashboardWs();
  loadAnnouncementToasts().catch(() => {});
  startAnnouncementPoll(25000);
  refreshChatUnread().catch(() => {});
  const q = new URLSearchParams(location.search);
  if (q.get("create") === "1" || q.get("cat")) {
    openCreateModal({ cat: q.get("cat") || "secret", lockCat: !!q.get("cat") });
  }
  const initial = (location.hash || "#overview").replace(/^#/, "") || "overview";
  state.summaryData = summaryData;
  await navigate(initial);
})();
