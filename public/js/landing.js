import { enforceMaintenanceGate } from "/js/maintenance-gate.js";

async function api(path, opts = {}) {
  const res = await fetch(path, Object.assign({
    credentials: "same-origin",
    headers: { Accept: "application/json" }
  }, opts));
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { res, data };
}

function setAvatar(el, user) {
  if (!el) return;
  if (user && user.avatarUrl) {
    el.innerHTML = `<img src="${user.avatarUrl}" alt="" referrerpolicy="no-referrer">`;
  } else {
    const ch = ((user && (user.displayName || user.username)) || "?").slice(0, 1).toUpperCase();
    el.textContent = ch;
  }
}

(async function boot() {
  const link = document.getElementById("profileLink");
  const label = document.getElementById("landLabel");
  const name = document.getElementById("landName");
  const avatar = document.getElementById("landAvatar");
  try {
    let me = await api("/api/v1/auth/me", { method: "GET" });
    if (!me.res.ok) {
      me = await api("/api/v1/auth/guest", {
        method: "POST",
        body: "{}",
        headers: { "Content-Type": "application/json", Accept: "application/json" }
      });
    }
    const user = me.data && me.data.user;
    if (user) {
      label.textContent = user.accountType === "registered" ? "โปรไฟล์" : "Guest";
      name.textContent = user.displayName || user.username || "Player";
      setAvatar(avatar, user);
      link.href = "/app.html#profile";
      if (user.id) localStorage.setItem("dpn-token", user.id);
      if (user.displayName || user.username) {
        localStorage.setItem("dpn-name", user.displayName || user.username);
      }
    }
  } catch {
    label.textContent = "เข้าสู่ระบบ";
    name.textContent = "Guest";
    link.href = "/login.html";
  }

  const gate = await enforceMaintenanceGate({ hardBlock: true });
  if (gate.blocked) {
    const start = document.getElementById("startBtn");
    if (start) {
      start.setAttribute("aria-disabled", "true");
      start.addEventListener("click", (e) => e.preventDefault());
      start.style.pointerEvents = "none";
      start.style.opacity = "0.5";
    }
  }
})();
