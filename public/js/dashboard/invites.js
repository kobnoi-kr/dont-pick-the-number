import { playUrl } from "./api.js";
import { sendWs } from "./ws.js";

let pending = null;

function ensureBanner() {
  let el = document.getElementById("dashRoomInviteBanner");
  if (el) return el;
  el = document.createElement("div");
  el.id = "dashRoomInviteBanner";
  el.className = "invite-banner hidden";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-live", "polite");
  el.innerHTML = `
    <div class="invite-banner-card">
      <img id="dashInviteAvatar" class="invite-banner-av" alt="" width="40" height="40">
      <div class="invite-banner-body">
        <div class="invite-banner-kicker">มีคนชวนเข้าห้อง</div>
        <p id="dashInviteFrom" class="invite-banner-from"></p>
        <p id="dashInviteRoom" class="invite-banner-room"></p>
      </div>
      <div class="invite-banner-actions">
        <button type="button" class="btn sm" id="dashInviteAccept">ตกลง</button>
        <button type="button" class="btn ghost sm" id="dashInviteDecline">ปฏิเสธ</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  el.querySelector("#dashInviteAccept").onclick = () => {
    if (!pending || !pending.inviteId) return;
    const inviteId = pending.inviteId;
    hideRoomInviteBanner();
    const name = localStorage.getItem("dpn-name") || "";
    location.href = playUrl({ invite: inviteId, name });
  };
  el.querySelector("#dashInviteDecline").onclick = () => {
    if (pending && pending.inviteId) sendWs({ t: "declineInvite", inviteId: pending.inviteId });
    hideRoomInviteBanner();
  };
  return el;
}

export function showRoomInviteBanner(msg) {
  if (!msg || !msg.inviteId) return;
  pending = msg;
  const el = ensureBanner();
  const av = el.querySelector("#dashInviteAvatar");
  if (msg.fromAvatar) {
    av.src = msg.fromAvatar;
    av.classList.add("on");
  } else {
    av.removeAttribute("src");
    av.classList.remove("on");
  }
  el.querySelector("#dashInviteFrom").textContent =
    (msg.fromName || "เพื่อน") + " ชวนคุณเข้าห้อง";
  el.querySelector("#dashInviteRoom").textContent = msg.roomTitle || "ห้องส่วนตัว";
  el.classList.remove("hidden");
}

export function hideRoomInviteBanner() {
  pending = null;
  const el = document.getElementById("dashRoomInviteBanner");
  if (el) el.classList.add("hidden");
}
