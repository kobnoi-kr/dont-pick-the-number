import { ensureGuest, api, playUrl } from "./api.js";
import { paintUser, wireShell, logout } from "./shell.js";
import { connectDashboardWs, onDashboardMessage } from "./ws.js";
import { renderOverview } from "./overview.js";
import { renderRooms } from "./rooms.js";
import { renderLive } from "./live.js";
import { renderHistory } from "./history.js";
import { renderLeaderboard } from "./leaderboard.js";
import { renderProfile } from "./profile.js";
import { renderSettings } from "./settings.js";
import { wireNotifications, refreshNotifications } from "./notifications.js";

const state = {
  user: null,
  view: "overview",
  roomFilter: "available"
};

function openCreateModal() {
  document.getElementById("createModal").classList.remove("hidden");
  document.getElementById("crMsg").textContent = "";
}
function closeCreateModal() {
  document.getElementById("createModal").classList.add("hidden");
}

async function createRoomFromModal() {
  const msg = document.getElementById("crMsg");
  const name = (document.getElementById("crName").value || "").trim()
    || (state.user && (state.user.displayName || state.user.username))
    || "Player";
  const body = {
    visibility: document.getElementById("crVis").value,
    title: document.getElementById("crName").value.trim(),
    displayName: name,
    setup: {
      cat: document.getElementById("crCat").value,
      rangeMode: document.getElementById("crRange").value,
      winTarget: Number(document.getElementById("crWin").value) || 3,
      turnSec: Number(document.getElementById("crTurn").value) || 0
    }
  };
  msg.textContent = "Creating…";
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
  root.innerHTML = `<div class="card"><div class="loading">Loading…</div></div>`;
  const ctx = {
    user: state.user,
    openCreate: openCreateModal,
    openJoinFocus: () => {
      const el = document.getElementById("topJoinCode");
      if (el) { el.focus(); el.select(); }
    },
    onSaved: (user) => {
      state.user = user;
      paintUser(user);
    }
  };
  if (state.view === "overview") await renderOverview(root, ctx);
  else if (state.view === "rooms") {
    await renderRooms(root, {
      filter: state.roomFilter,
      onFilter: (f) => {
        state.roomFilter = f;
        navigate("rooms");
      }
    });
    root.querySelector("#roomsCreate")?.addEventListener("click", openCreateModal);
    root.querySelector("#emptyCreate")?.addEventListener("click", openCreateModal);
  } else if (state.view === "live") await renderLive(root);
  else if (state.view === "history") await renderHistory(root);
  else if (state.view === "leaderboard") await renderLeaderboard(root);
  else if (state.view === "profile") await renderProfile(root, ctx);
  else if (state.view === "settings") await renderSettings(root);
}

const shell = wireShell({
  onNavigate: navigate,
  onLogout: logout
});

document.getElementById("topJoinForm").onsubmit = (e) => {
  e.preventDefault();
  const code = document.getElementById("topJoinCode").value.replace(/\D/g, "").slice(0, 6);
  if (!/^\d{6}$/.test(code)) return;
  const name = (state.user && (state.user.displayName || state.user.username)) || localStorage.getItem("dpn-name") || "";
  if (name) localStorage.setItem("dpn-name", name);
  location.href = playUrl({ code, name });
};

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
});

(async function boot() {
  try {
    const data = await ensureGuest();
    state.user = data.user || data;
    if (state.user && state.user.id) localStorage.setItem("dpn-token", state.user.id);
    if (state.user && (state.user.displayName || state.user.username)) {
      localStorage.setItem("dpn-name", state.user.displayName || state.user.username);
    }
    paintUser(state.user);
  } catch (err) {
    paintUser(null);
  }
  wireNotifications();
  connectDashboardWs();
  const initial = (location.hash || "#overview").replace(/^#/, "") || "overview";
  await navigate(initial);
})();
