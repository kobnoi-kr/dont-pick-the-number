import { api } from "/js/dashboard/api.js";
import { hasPerm } from "./util.js";
import { renderOverview } from "./overview.js";
import { renderAnalytics } from "./analytics.js";
import { renderLive } from "./live.js";
import { renderUsers } from "./users.js";
import { renderGames } from "./games.js";
import { renderRooms } from "./rooms.js";
import { renderAnnouncements } from "./announcements.js";
import { renderPermissions } from "./permissions.js";
import { renderSystem } from "./system.js";
import { renderLogs } from "./logs.js";
import { renderSettings } from "./settings.js";

const TITLES = {
  overview: "Overview",
  analytics: "Analytics",
  live: "Live Monitor",
  users: "User Management",
  games: "Game Management",
  rooms: "Room Management",
  announcements: "Announcements",
  permissions: "Admin & Permissions",
  system: "System Management",
  logs: "Activity Logs",
  settings: "Settings"
};

const state = {
  user: null,
  view: "overview",
  cleanup: null
};

function paintUser(user) {
  const name = (user && (user.displayName || user.username)) || "Admin";
  const sideName = document.getElementById("sideName");
  const sideStatus = document.getElementById("sideStatus");
  const sideAvatar = document.getElementById("sideAvatar");
  const roleBadge = document.getElementById("roleBadge");
  if (sideName) sideName.textContent = name;
  if (sideStatus) {
    const roles = (user && user.roles) || [];
    sideStatus.textContent = roles.includes("super_admin")
      ? "super admin"
      : roles.includes("admin")
        ? "admin"
        : roles.includes("moderator")
          ? "moderator"
          : "—";
  }
  if (sideAvatar) {
    sideAvatar.textContent = (name || "?").slice(0, 1).toUpperCase();
  }
  if (roleBadge) {
    const roles = (user && user.roles) || [];
    roleBadge.textContent = roles.includes("super_admin")
      ? "SUPER"
      : roles.includes("moderator") && !roles.includes("admin")
        ? "MOD"
        : "ADMIN";
  }

  document.querySelectorAll("#sideNav [data-view]").forEach((btn) => {
    const perm = btn.getAttribute("data-perm");
    const ok = !perm || hasPerm(user, perm);
    btn.classList.toggle("hidden", !ok);
  });
}

function setActiveNav(view) {
  document.querySelectorAll("#sideNav [data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-view") === view);
  });
  const title = document.getElementById("pageTitle");
  if (title) title.textContent = TITLES[view] || "Admin";
}

async function showView(view) {
  const allowed = Object.keys(TITLES);
  let next = allowed.includes(view) ? view : "overview";
  const btn = document.querySelector(`#sideNav [data-view="${next}"]`);
  if (btn && btn.classList.contains("hidden")) {
    const first = document.querySelector("#sideNav [data-view]:not(.hidden)");
    next = first ? first.getAttribute("data-view") : "overview";
  }
  state.view = next;
  if (location.hash.replace(/^#/, "") !== next) {
    history.replaceState(null, "", "#" + next);
  }
  setActiveNav(next);
  if (typeof state.cleanup === "function") {
    try {
      state.cleanup();
    } catch {
      /* ignore */
    }
    state.cleanup = null;
  }
  const root = document.getElementById("viewRoot");
  const ctx = { user: state.user };
  if (next === "overview") await renderOverview(root);
  else if (next === "analytics") await renderAnalytics(root);
  else if (next === "live") state.cleanup = await renderLive(root, ctx);
  else if (next === "users") await renderUsers(root, ctx);
  else if (next === "games") await renderGames(root, ctx);
  else if (next === "rooms") await renderRooms(root, ctx);
  else if (next === "announcements") await renderAnnouncements(root);
  else if (next === "permissions") await renderPermissions(root, ctx);
  else if (next === "system") await renderSystem(root, ctx);
  else if (next === "logs") await renderLogs(root);
  else if (next === "settings") await renderSettings(root, ctx);
}

function wireShell() {
  document.querySelectorAll("#sideNav [data-view]").forEach((btn) => {
    btn.onclick = () => {
      location.hash = "#" + btn.getAttribute("data-view");
    };
  });
  window.addEventListener("hashchange", () => {
    showView(location.hash.replace(/^#/, "") || "overview");
  });
  const menu = document.getElementById("menuToggle");
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("backdrop");
  if (menu && sidebar) {
    menu.onclick = () => {
      sidebar.classList.toggle("open");
      if (backdrop) backdrop.classList.toggle("hidden", !sidebar.classList.contains("open"));
    };
  }
  if (backdrop) {
    backdrop.onclick = () => {
      sidebar.classList.remove("open");
      backdrop.classList.add("hidden");
    };
  }
  const logout = document.getElementById("sideLogout");
  if (logout) {
    logout.onclick = async () => {
      await api("/api/v1/auth/logout", { method: "POST", body: "{}" });
      location.href = "/";
    };
  }
}

async function boot() {
  const me = await api("/api/v1/auth/me", { method: "GET" });
  const user = me.data && me.data.user;
  const roles = (user && user.roles) || [];
  const ok =
    me.res.ok &&
    (roles.includes("admin") || roles.includes("super_admin") || roles.includes("moderator"));
  if (!ok) {
    location.href = "/login?next=/admin";
    return;
  }
  // Prefer permissions from admin/me if available
  const adminMe = await api("/api/v1/admin/me", { method: "GET" });
  if (adminMe.res.ok && adminMe.data && adminMe.data.user) {
    state.user = Object.assign({}, adminMe.data.user, {
      permissions: adminMe.data.permissions || adminMe.data.user.permissions || []
    });
  } else {
    state.user = user;
  }
  paintUser(state.user);
  wireShell();
  await showView(location.hash.replace(/^#/, "") || "overview");
}

boot().catch(() => {
  location.href = "/login?next=/admin";
});
