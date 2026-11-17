import { ensureGuest, api, playUrl } from "./api.js";
import { paintUser, wireShell, logout } from "./shell.js";
import { connectDashboardWs, onDashboardMessage } from "./ws.js";
import { renderOverview } from "./overview.js";
import { renderLibrary } from "./library.js";
import { renderRooms } from "./rooms.js";
import { renderFriends } from "./friends.js";
import { renderProfile } from "./profile.js";
import { wireNotifications, refreshNotifications } from "./notifications.js";

const state = {
  user: null,
  view: "overview",
  favoriteMode: null
};

function openCreateModal(opts = {}) {
  document.getElementById("createModal").classList.remove("hidden");
  document.getElementById("crMsg").textContent = "";
  if (opts.cat) {
    const sel = document.getElementById("crCat");
    if (sel) sel.value = opts.cat === "wheel" ? "wheel" : "secret";
  }
}
function closeCreateModal() {
  document.getElementById("createModal").classList.add("hidden");
}

async function createRoomFromModal() {
  const msg = document.getElementById("crMsg");
  const name =
    (document.getElementById("crName").value || "").trim() ||
    (state.user && (state.user.displayName || state.user.username)) ||
    "Player";
  const cat = document.getElementById("crCat").value;
  localStorage.setItem("nv-last-game", cat);
  const body = {
    visibility: document.getElementById("crVis").value,
    title: document.getElementById("crName").value.trim(),
    displayName: name,
    setup: {
      cat,
      rangeMode: document.getElementById("crRange").value,
      winTarget: Number(document.getElementById("crWin").value) || 3,
      turnSec: Number(document.getElementById("crTurn").value) || 0
    }
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
    onSaved: (user) => {
      state.user = user;
      paintUser(user);
    }
  };
  if (state.view === "overview") await renderOverview(root, ctx);
  else if (state.view === "library") await renderLibrary(root, ctx);
  else if (state.view === "rooms") await renderRooms(root, ctx);
  else if (state.view === "friends") await renderFriends(root, ctx);
  else if (state.view === "profile") await renderProfile(root, ctx);
  else await renderOverview(root, ctx);
}

const shell = wireShell({
  onNavigate: navigate,
  onLogout: logout
});

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
  if (msg.t === "notification:new") refreshNotifications();
  if (msg.t === "dashboard:update" && state.view === "overview") navigate("overview");
  if ((msg.t === "friend:update" || msg.t === "presence") && state.view === "friends") {
    navigate("friends");
  }
});

(async function boot() {
  try {
    const data = await ensureGuest();
    state.user = data.user || data;
    if (state.user && state.user.id) localStorage.setItem("dpn-token", state.user.id);
    if (state.user && (state.user.displayName || state.user.username)) {
      localStorage.setItem("dpn-name", state.user.displayName || state.user.username);
    }
    const summary = await api("/api/v1/dashboard/summary", { method: "GET" });
    if (summary.data && summary.data.stats && summary.data.stats.favoriteMode) {
      state.favoriteMode = summary.data.stats.favoriteMode;
    }
    if (summary.data && summary.data.user && summary.data.user.roles) {
      state.user = Object.assign({}, state.user, { roles: summary.data.user.roles });
    }
    paintUser(state.user);
  } catch (err) {
    paintUser(null);
  }
  wireNotifications();
  connectDashboardWs();
  const q = new URLSearchParams(location.search);
  if (q.get("create") === "1" || q.get("cat")) {
    openCreateModal({ cat: q.get("cat") || "secret" });
  }
  const initial = (location.hash || "#overview").replace(/^#/, "") || "overview";
  await navigate(initial);
})();
