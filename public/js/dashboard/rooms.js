import { api, playUrl } from "./api.js";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function statusPill(room) {
  if (!room.joinable && room.phase === "lobby") return '<span class="pill bad">Full</span>';
  if (room.phase === "lobby") return '<span class="pill ok">Waiting</span>';
  if (room.phase === "over") return '<span class="pill">Finished</span>';
  return '<span class="pill busy">Playing</span>';
}

export async function renderRooms(root, { filter = "available", onFilter } = {}) {
  root.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
        <div>
          <h2 style="margin:0">Public Rooms</h2>
          <p class="muted" style="margin:4px 0 0">อัปเดตแบบ realtime จากล็อบบี้</p>
        </div>
        <button type="button" class="btn" id="roomsCreate">Create Room</button>
      </div>
      <div class="filters" id="roomFilters" style="margin-top:14px">
        <button type="button" data-f="available" class="${filter === "available" ? "on" : ""}">Available</button>
        <button type="button" data-f="waiting" class="${filter === "waiting" ? "on" : ""}">Waiting</button>
        <button type="button" data-f="playing" class="${filter === "playing" ? "on" : ""}">Playing</button>
        <button type="button" data-f="all" class="${filter === "all" ? "on" : ""}">All</button>
      </div>
      <div id="roomsBody"><div class="loading">Loading rooms…</div></div>
    </div>
  `;

  root.querySelector("#roomFilters").onclick = (e) => {
    const btn = e.target.closest("button[data-f]");
    if (!btn || !onFilter) return;
    onFilter(btn.getAttribute("data-f"));
  };

  const { res, data } = await api("/api/v1/rooms/public", { method: "GET" });
  const body = root.querySelector("#roomsBody");
  if (!res.ok) {
    body.innerHTML = `<div class="error-state">โหลดห้องไม่สำเร็จ <button class="btn ghost sm" id="retryRooms">Retry</button></div>`;
    const retry = body.querySelector("#retryRooms");
    if (retry) retry.onclick = () => renderRooms(root, { filter, onFilter });
    return;
  }
  let rooms = (data && data.rooms) || [];
  rooms = rooms.filter((r) => r.visibility === "public");
  if (filter === "available") rooms = rooms.filter((r) => r.joinable);
  if (filter === "waiting") rooms = rooms.filter((r) => r.phase === "lobby");
  if (filter === "playing") rooms = rooms.filter((r) => r.phase !== "lobby" && r.phase !== "over");

  if (!rooms.length) {
    body.innerHTML = `<div class="empty">No rooms available right now. Create your own room!<div style="margin-top:12px"><button class="btn" id="emptyCreate">Create Room</button></div></div>`;
  } else {
    body.innerHTML = `
      <table class="table">
        <thead><tr><th>Room</th><th>Host</th><th>Players</th><th>Mode</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${rooms.map((r) => `
            <tr>
              <td><b>${esc(r.title || "Room")}</b><div class="tiny">${r.code || "—"}</div></td>
              <td>${esc(r.host || "—")}</td>
              <td>${r.count}/${r.max}</td>
              <td>${r.cat === "wheel" ? "Wheel" : "Secret"}</td>
              <td>${statusPill(r)}</td>
              <td>${r.joinable
                ? `<button class="btn sm" data-join="${esc(r.code)}">Join</button>`
                : r.phase !== "lobby" && r.phase !== "over"
                  ? `<a class="btn ghost sm" href="${playUrl({ code: r.code, watch: true })}">Watch</a>`
                  : `<button class="btn sm" disabled>Full</button>`}
              </td>
            </tr>`).join("")}
        </tbody>
      </table>`;
  }

  body.querySelectorAll("[data-join]").forEach((btn) => {
    btn.onclick = () => { location.href = playUrl({ code: btn.getAttribute("data-join") }); };
  });
}

export function applyLobbyRooms(root, msg, state) {
  if (!root || !msg || msg.t !== "lobby") return;
  // re-render when on rooms view
  if (state.view === "rooms") {
    renderRooms(root, {
      filter: state.roomFilter || "available",
      onFilter: state.onRoomFilter
    });
  }
}
