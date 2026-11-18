import { api } from "/js/dashboard/api.js";
import { wireContactForm } from "/js/dashboard/contact-form.js";
import { hasPerm } from "./util.js?v=users-page2";
import { renderOverview } from "./overview.js?v=users-page2";
import { renderAnalytics } from "./analytics.js?v=users-page2";
import { renderLive } from "./live.js?v=users-page2";
import { renderUsers } from "./users.js?v=users-page2";
import { renderGames } from "./games.js?v=users-page2";
import { renderRooms } from "./rooms.js?v=users-page2";
import { renderAnnouncements } from "./announcements.js?v=users-page2";
import { renderPermissions } from "./permissions.js?v=users-page2";
import { renderSystem } from "./system.js?v=users-page2";
import { renderLogs } from "./logs.js?v=users-page2";
import { renderInbox } from "./inbox.js?v=users-page2";
import { renderSettings } from "./settings.js?v=users-page2";
import { renderLevels } from "./levels.js?v=users-page2";
import { renderGift } from "./gift.js?v=users-page2";
import { renderShopAdmin } from "./shop.js?v=users-page2";

const TITLES = {
  overview: "Overview",
  analytics: "Analytics",
  live: "Live Monitor",
  users: "User Management",
  games: "Game Management",
  rooms: "Room Management",
  announcements: "Announcements",
  levels: "Level & ยศ",
  gift: "Gift",
  shop: "Shop",
  inbox: "ข้อความติดต่อ",
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
      ? "SUPER ADMIN"
      : roles.includes("admin")
        ? "ADMIN"
        : roles.includes("moderator")
          ? "MODERATOR"
          : roles.includes("player")
            ? "PLAYER"
            : roles[0]
              ? String(roles[0]).replace(/_/g, " ").toUpperCase()
              : "—";
  }
  if (sideAvatar) {
    if (user && user.avatarUrl) {
      sideAvatar.outerHTML =
        `<img id="sideAvatar" src="${user.avatarUrl}" alt="" width="40" height="40" referrerpolicy="no-referrer">`;
    } else {
      sideAvatar.textContent = (name || "?").slice(0, 1).toUpperCase();
    }
  }
  if (roleBadge) {
    const roles = (user && user.roles) || [];
    roleBadge.textContent = roles.includes("super_admin")
      ? "SUPER ADMIN"
      : roles.includes("admin")
        ? "ADMIN"
        : roles.includes("moderator")
          ? "MODERATOR"
          : roles.includes("player")
            ? "PLAYER"
            : "ADMIN";
    roleBadge.classList.toggle("admin", roles.includes("admin") || roles.includes("super_admin") || roles.includes("moderator"));
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
  else if (next === "levels") await renderLevels(root, ctx);
  else if (next === "gift") await renderGift(root, ctx);
  else if (next === "shop") await renderShopAdmin(root, ctx);
  else if (next === "inbox") await renderInbox(root, { onOpenCount: setInboxBadge });
  else if (next === "permissions") await renderPermissions(root, ctx);
  else if (next === "system") await renderSystem(root, ctx);
  else if (next === "logs") await renderLogs(root);
  else if (next === "settings") await renderSettings(root, ctx);
}

function setInboxBadge(count) {
  const badge = document.getElementById("inboxNavBadge");
  if (!badge) return;
  const n = Math.max(0, Number(count) || 0);
  if (n <= 0) {
    badge.classList.add("hidden");
    badge.textContent = "0";
    return;
  }
  badge.classList.remove("hidden");
  badge.textContent = n > 99 ? "99+" : String(n);
}

async function refreshInboxBadge() {
  if (!hasPerm(state.user, "users.view")) {
    setInboxBadge(0);
    return;
  }
  const { res, data } = await api("/api/v1/admin/inbox?limit=1", { method: "GET" });
  if (!res.ok) return;
  setInboxBadge(data && data.openCount != null ? data.openCount : 0);
}

function wireShell() {
  const menu = document.getElementById("menuToggle");
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("backdrop");
  let scrollY = 0;
  const setMenuOpen = (open) => {
    if (!sidebar) return;
    sidebar.classList.toggle("open", open);
    if (backdrop) backdrop.classList.toggle("hidden", !open);
    if (open) {
      scrollY = window.scrollY || window.pageYOffset || 0;
      document.body.classList.add("nav-open");
      document.body.style.top = `-${scrollY}px`;
    } else {
      document.body.classList.remove("nav-open");
      document.body.style.top = "";
      window.scrollTo(0, scrollY);
    }
  };
  document.querySelectorAll("#sideNav [data-view]").forEach((btn) => {
    btn.onclick = () => {
      location.hash = "#" + btn.getAttribute("data-view");
      setMenuOpen(false);
    };
  });
  window.addEventListener("hashchange", () => {
    showView(location.hash.replace(/^#/, "") || "overview");
  });
  if (menu && sidebar) {
    menu.onclick = () => setMenuOpen(!sidebar.classList.contains("open"));
  }
  if (backdrop) {
    backdrop.onclick = () => setMenuOpen(false);
  }
  const logout = document.getElementById("sideLogout");
  if (logout) {
    logout.onclick = async () => {
      await api("/api/v1/auth/logout", { method: "POST", body: "{}" });
      location.href = "/";
    };
  }

  wireContactForm();
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
  // Prefer permissions from admin/me if available (cached on server now)
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
  // โหลดหน้า + inbox พร้อมกัน ลดเวลารอ Admin
  const view = location.hash.replace(/^#/, "") || "overview";
  await Promise.all([showView(view), refreshInboxBadge()]);
  setInterval(() => {
    refreshInboxBadge().catch(() => {});
  }, 30000);
}

boot().catch(() => {
  location.href = "/login?next=/admin";
});
