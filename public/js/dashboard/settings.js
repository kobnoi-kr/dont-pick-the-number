import { api } from "./api.js";

export async function renderSettings(root) {
  root.innerHTML = `<div class="card"><h2>Settings</h2><div class="loading">Loading…</div></div>`;
  const { res, data } = await api("/api/v1/settings", { method: "GET" });
  const s = (data && data.settings) || { language: "th", theme: "dark", preferences: {} };
  const pref = s.preferences || {};
  root.innerHTML = `
    <div class="content-grid">
      <div class="card">
        <h2>General</h2>
        <form id="setForm" class="form-grid">
          <label>Language
            <select id="setLang">
              <option value="th" ${s.language === "th" ? "selected" : ""}>ไทย</option>
              <option value="en" ${s.language === "en" ? "selected" : ""}>English</option>
            </select>
          </label>
          <label>Theme
            <select id="setTheme">
              <option value="dark" ${s.theme === "dark" ? "selected" : ""}>Dark Gaming</option>
              <option value="system" ${s.theme === "system" ? "selected" : ""}>System</option>
            </select>
          </label>
          <label>Sound Effects volume (0–100)
            <input id="setSfx" type="number" min="0" max="100" value="${pref.sfxVolume != null ? pref.sfxVolume : 40}">
          </label>
          <label>Music volume (0–100)
            <input id="setMusic" type="number" min="0" max="100" value="${pref.musicVolume != null ? pref.musicVolume : 20}">
          </label>
          <label><input id="setNotif" type="checkbox" ${pref.notifications !== false ? "checked" : ""}> Enable notifications</label>
          <button class="btn" type="submit">Save Settings</button>
        </form>
        <p class="msg" id="setMsg"></p>
      </div>
      <div class="panel-right">
        <div class="card">
          <h3>Privacy</h3>
          <form id="privForm" class="form-grid">
            <label><input id="privStats" type="checkbox" ${pref.publicStats !== false ? "checked" : ""}> Public game statistics</label>
            <label><input id="privHistory" type="checkbox" ${pref.publicHistory ? "checked" : ""}> Public match history</label>
            <label><input id="privInvites" type="checkbox" ${pref.allowInvites !== false ? "checked" : ""}> Allow room invitations</label>
            <label><input id="privSpectate" type="checkbox" ${pref.allowSpectators !== false ? "checked" : ""}> Allow spectators on my public rooms</label>
            <button class="btn ghost" type="submit">Save Privacy</button>
          </form>
          <p class="msg" id="privMsg"></p>
        </div>
        <div class="card">
          <h3>Account</h3>
          <a class="btn ghost block" href="/app.html#profile">Connected accounts & sessions</a>
          <a class="btn ghost block" style="margin-top:8px" href="/login.html">Switch account</a>
        </div>
      </div>
    </div>`;

  async function save(partial, msgEl) {
    const { res: r, data: d } = await api("/api/v1/settings", {
      method: "PATCH",
      body: JSON.stringify(partial)
    });
    msgEl.textContent = r.ok ? "Saved" : ((d && d.error) || "failed");
    msgEl.classList.toggle("ok", r.ok);
  }

  root.querySelector("#setForm").onsubmit = (e) => {
    e.preventDefault();
    save({
      language: root.querySelector("#setLang").value,
      theme: root.querySelector("#setTheme").value,
      preferences: {
        sfxVolume: Number(root.querySelector("#setSfx").value),
        musicVolume: Number(root.querySelector("#setMusic").value),
        notifications: root.querySelector("#setNotif").checked
      }
    }, root.querySelector("#setMsg"));
  };
  root.querySelector("#privForm").onsubmit = (e) => {
    e.preventDefault();
    save({
      preferences: {
        publicStats: root.querySelector("#privStats").checked,
        publicHistory: root.querySelector("#privHistory").checked,
        allowInvites: root.querySelector("#privInvites").checked,
        allowSpectators: root.querySelector("#privSpectate").checked
      }
    }, root.querySelector("#privMsg"));
  };

  if (!res.ok) {
    root.querySelector("#setMsg").textContent = "Settings API unavailable — defaults shown";
  }
}
