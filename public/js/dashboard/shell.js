import { api } from "./api.js";

function wireContactAdmin() {
  const btn = document.getElementById("contactAdminBtn");
  const modal = document.getElementById("contactModal");
  if (!btn || !modal) return;
  const form = document.getElementById("contactForm");
  const cancel = document.getElementById("contactCancel");
  const msg = document.getElementById("contactMsg");
  const open = () => {
    if (msg) msg.textContent = "";
    modal.classList.remove("hidden");
    const ta = document.getElementById("contactMessage");
    if (ta) requestAnimationFrame(() => ta.focus());
  };
  const close = () => modal.classList.add("hidden");
  btn.onclick = open;
  if (cancel) cancel.onclick = close;
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const subject = (document.getElementById("contactSubject")?.value || "").trim();
      const message = (document.getElementById("contactMessage")?.value || "").trim();
      if (message.length < 5) {
        if (msg) msg.textContent = "พิมพ์ข้อความอย่างน้อย 5 ตัวอักษร";
        return;
      }
      if (msg) msg.textContent = "กำลังส่ง…";
      const r = await api("/api/v1/contact", {
        method: "POST",
        body: JSON.stringify({ subject, message })
      });
      if (!r.res.ok) {
        if (msg) {
          msg.textContent =
            r.res.status === 429
              ? "ส่งบ่อยเกินไป ลองใหม่ภายหลัง"
              : (r.data && r.data.error) || "ส่งไม่สำเร็จ";
        }
        return;
      }
      if (msg) msg.textContent = "ส่งแล้ว — แอดมินจะเห็นใน Inbox";
      form.reset();
      setTimeout(close, 900);
    };
  }
}

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

const ROLE_RANK = ["super_admin", "admin", "moderator", "player"];
const ROLE_LABEL = {
  super_admin: "SUPER ADMIN",
  admin: "ADMIN",
  moderator: "MODERATOR",
  player: "PLAYER"
};

function primaryRole(user) {
  const roles = (user && user.roles) || [];
  if (!roles.length) {
    return user && user.accountType === "guest" ? "guest" : "player";
  }
  for (const name of ROLE_RANK) {
    if (roles.includes(name)) return name;
  }
  return roles[0];
}

function roleLabel(user) {
  const role = primaryRole(user);
  return ROLE_LABEL[role] || String(role || "PLAYER").replace(/_/g, " ").toUpperCase();
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
    // Show DB role under the display name (not a static "สมาชิก").
    sideStatus.textContent = roleLabel(user);
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
    roleBadge.textContent = roleLabel(user);
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
  let scrollY = 0;
  const setMenuOpen = (open) => {
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
  const closeMenu = () => setMenuOpen(false);
  const openMenu = () => setMenuOpen(true);

  document.getElementById("menuToggle").onclick = () => {
    if (sidebar.classList.contains("open")) closeMenu();
    else openMenu();
  };
  if (backdrop) backdrop.onclick = closeMenu;

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
  wireContactAdmin();

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
