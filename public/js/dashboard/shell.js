import { api } from "./api.js";

const TITLES = {
  overview: "Overview",
  library: "Game Library",
  rooms: "My Rooms",
  friends: "Friends",
  profile: "Profile & Settings"
};

function isElevatedAdmin(user) {
  const roles = (user && user.roles) || [];
  return roles.includes("admin") || roles.includes("super_admin") || roles.includes("moderator");
}

export function paintUser(user) {
  const name = (user && (user.displayName || user.username)) || "Player";
  const sideName = document.getElementById("sideName");
  const sideStatus = document.getElementById("sideStatus");
  const sideAvatar = document.getElementById("sideAvatar");
  const roleBadge = document.getElementById("roleBadge");
  const adminNav = document.getElementById("adminNavBtn");
  if (sideName) sideName.textContent = name;
  if (sideStatus) {
    sideStatus.textContent = user && user.accountType === "registered" ? "สมาชิก" : "Guest";
  }
  if (sideAvatar) {
    if (user && user.avatarUrl) {
      sideAvatar.outerHTML =
        `<img id="sideAvatar" src="${user.avatarUrl}" alt="" width="40" height="40" referrerpolicy="no-referrer">`;
    } else {
      sideAvatar.className = "avatar-fallback";
      sideAvatar.textContent = name.slice(0, 1).toUpperCase();
    }
  }
  const admin = isElevatedAdmin(user);
  if (roleBadge) {
    roleBadge.textContent = admin ? "ADMIN" : "USER";
    roleBadge.classList.toggle("admin", admin);
  }
  if (adminNav) adminNav.classList.toggle("hidden", !admin);
  const banner = document.getElementById("guestBanner");
  if (banner) {
    const dismissed = sessionStorage.getItem("nv-guest-banner") === "1";
    banner.classList.toggle("hidden", !(user && user.accountType === "guest") || dismissed);
  }
}

export function setPageTitle(view) {
  const el = document.getElementById("pageTitle");
  if (el) el.textContent = TITLES[view] || "NUMVERSE";
  document.title = (TITLES[view] || "Dashboard") + " — NUMVERSE";
}

export function wireShell({ onNavigate, onLogout }) {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("backdrop");
  const closeMenu = () => {
    sidebar.classList.remove("open");
    backdrop.classList.add("hidden");
  };
  const openMenu = () => {
    sidebar.classList.add("open");
    backdrop.classList.remove("hidden");
  };

  document.getElementById("menuToggle").onclick = () => {
    if (sidebar.classList.contains("open")) closeMenu();
    else openMenu();
  };
  backdrop.onclick = closeMenu;

  function bindNav(root) {
    if (!root) return;
    root.querySelectorAll("[data-view]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const view = el.getAttribute("data-view");
        onNavigate(view);
        closeMenu();
      });
    });
  }
  bindNav(document.getElementById("sideNav"));
  bindNav(document.getElementById("bottomNav"));

  document.getElementById("sideLogout").onclick = onLogout;
  document.getElementById("userMenuBtn").onclick = () => onNavigate("profile");
  const guestContinue = document.getElementById("guestContinue");
  if (guestContinue) {
    guestContinue.onclick = () => {
      sessionStorage.setItem("nv-guest-banner", "1");
      document.getElementById("guestBanner").classList.add("hidden");
    };
  }

  return {
    setActive(view) {
      document.querySelectorAll("[data-view]").forEach((el) => {
        el.classList.toggle("active", el.getAttribute("data-view") === view);
      });
      setPageTitle(view);
    }
  };
}

export async function logout() {
  await api("/api/v1/auth/logout", { method: "POST", body: "{}" });
  location.href = "/";
}
