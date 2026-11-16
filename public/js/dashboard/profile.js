import { api } from "./api.js";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export async function renderProfile(root, { user, onSaved }) {
  const u = user || {};
  root.innerHTML = `
    <div class="content-grid">
      <div class="card">
        <h2>Profile</h2>
        <div style="display:flex;gap:14px;align-items:center;margin:12px 0">
          ${u.avatarUrl
            ? `<img src="${esc(u.avatarUrl)}" width="72" height="72" style="border-radius:50%;object-fit:cover;border:1px solid var(--nv-border)" referrerpolicy="no-referrer">`
            : `<span class="avatar-fallback" style="width:72px;height:72px;font-size:1.4rem">${esc((u.displayName || "?").slice(0, 1))}</span>`}
          <div>
            <div style="font-weight:800;font-size:1.2rem">${esc(u.displayName || u.username || "Player")}</div>
            <div class="tiny">@${esc(u.username || "—")} · ${esc(u.accountType || "guest")}</div>
            <div class="tiny">ID: ${esc(u.id || "—")}</div>
          </div>
        </div>
        <form id="profileForm" class="form-grid">
          <label>Display Name<input id="pfName" maxlength="64" value="${esc(u.displayName || "")}" required></label>
          <label>Avatar URL<input id="pfAvatar" value="${esc(u.avatarUrl || "")}" placeholder="https://..."></label>
          <button class="btn" type="submit">Save Profile</button>
        </form>
        <p class="msg" id="pfMsg"></p>
        <p style="margin-top:14px"><a class="btn ghost" href="/account.html">Full account page</a></p>
      </div>
      <div class="panel-right">
        <div class="card">
          <h3>Stats Snapshot</h3>
          <div id="pfStats"><div class="skeleton"></div></div>
        </div>
      </div>
    </div>`;

  root.querySelector("#profileForm").onsubmit = async (e) => {
    e.preventDefault();
    const msg = root.querySelector("#pfMsg");
    const body = JSON.stringify({
      displayName: root.querySelector("#pfName").value.trim(),
      avatarUrl: root.querySelector("#pfAvatar").value.trim() || null
    });
    const { res, data } = await api("/api/v1/account/profile", { method: "PATCH", body });
    if (!res.ok) {
      msg.textContent = (data && data.error) || "save_failed";
      msg.classList.remove("ok");
      return;
    }
    msg.textContent = "Saved";
    msg.classList.add("ok");
    if (onSaved && data && data.user) onSaved(data.user);
  };

  const st = await api("/api/v1/stats/me", { method: "GET" });
  const s = (st.data && st.data.stats) || {};
  root.querySelector("#pfStats").innerHTML = `
    <div class="stat" style="margin-bottom:8px"><div class="label">Games</div><div class="value">${s.totalGames || 0}</div></div>
    <div class="stat" style="margin-bottom:8px"><div class="label">Wins</div><div class="value">${s.gamesWon || 0}</div></div>
    <div class="stat"><div class="label">Points</div><div class="value">${s.totalPoints || 0}</div></div>`;
}
