function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function ensureStyles() {
  if (document.getElementById("nvMaintCss")) return;
  const style = document.createElement("style");
  style.id = "nvMaintCss";
  style.textContent = `
    .nv-maint-overlay{
      position:fixed;inset:0;z-index:99990;
      display:flex;align-items:center;justify-content:center;
      padding:24px;background:rgba(6,10,22,.82);backdrop-filter:blur(8px);
      color:#e8eefc;font-family:system-ui,Segoe UI,sans-serif;text-align:center;
    }
    .nv-maint-card{
      max-width:420px;width:100%;
      background:#121a2e;border:1px solid rgba(255,255,255,.12);
      border-radius:18px;padding:28px 24px;box-shadow:0 20px 60px rgba(0,0,0,.45);
    }
    .nv-maint-card h1{margin:0 0 10px;font-size:1.35rem}
    .nv-maint-card p{margin:0;color:#a9b6d3;line-height:1.5;white-space:pre-wrap}
    .nv-maint-card .nv-maint-actions{margin-top:18px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
    .nv-maint-card a,.nv-maint-card button{
      appearance:none;border:1px solid rgba(255,255,255,.16);background:#1a2540;color:#e8eefc;
      border-radius:999px;padding:10px 16px;text-decoration:none;cursor:pointer;font:inherit
    }
    .nv-maint-card a.primary{background:#3b66f5;border-color:transparent}
  `;
  document.head.appendChild(style);
}

function showMaintenanceOverlay(message, { adminBypass = false } = {}) {
  ensureStyles();
  let el = document.getElementById("nvMaintOverlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "nvMaintOverlay";
    el.className = "nv-maint-overlay";
    el.setAttribute("role", "alertdialog");
    el.setAttribute("aria-modal", "true");
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <div class="nv-maint-card">
      <h1>ปิดปรับปรุงชั่วคราว</h1>
      <p>${esc(message || "ระบบปิดปรับปรุงชั่วคราว กรุณากลับมาใหม่ภายหลัง")}</p>
      <div class="nv-maint-actions">
        <button type="button" id="nvMaintRetry">ลองใหม่</button>
        ${adminBypass ? `<a class="primary" href="/admin">ไปหน้า Admin</a>` : ""}
      </div>
    </div>
  `;
  const retry = el.querySelector("#nvMaintRetry");
  if (retry) retry.onclick = () => location.reload();
  return el;
}

function hideMaintenanceOverlay() {
  const el = document.getElementById("nvMaintOverlay");
  if (el) el.remove();
}

/**
 * @returns {Promise<{blocked:boolean, maintenance?:object}>}
 */
export async function enforceMaintenanceGate({ hardBlock = true } = {}) {
  try {
    const res = await fetch("/api/v1/system/status", {
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });
    if (!res.ok) return { blocked: false };
    const data = await res.json();
    const maint = data && data.maintenance;
    if (!maint || !maint.enabled) {
      hideMaintenanceOverlay();
      return { blocked: false, maintenance: maint };
    }
    if (maint.bypass) {
      // Admins can continue; still show a thin notice? Keep soft — no hard block.
      hideMaintenanceOverlay();
      return { blocked: false, maintenance: maint };
    }
    if (hardBlock) {
      showMaintenanceOverlay(maint.message, { adminBypass: false });
      return { blocked: true, maintenance: maint };
    }
    return { blocked: false, maintenance: maint };
  } catch {
    return { blocked: false };
  }
}

/** Live WS push: kick UI into maintenance without waiting for refresh. */
export function applyLiveMaintenance(message, { bypass = false } = {}) {
  hideMaintenanceCountdown();
  if (bypass) {
    hideMaintenanceOverlay();
    return { blocked: false };
  }
  showMaintenanceOverlay(message || "ระบบปิดปรับปรุงชั่วคราว กรุณากลับมาใหม่ภายหลัง");
  return { blocked: true };
}

let countdownTimer = null;
let maintTickAudio = null;
let countdownLastSec = -1;

function stopMaintTick() {
  if (!maintTickAudio) return;
  try {
    maintTickAudio.pause();
    maintTickAudio.currentTime = 0;
  } catch {
    /* ignore */
  }
  maintTickAudio = null;
}

function hideMaintenanceCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  stopMaintTick();
  countdownLastSec = -1;
  const el = document.getElementById("nvMaintCountdown");
  if (el) el.remove();
}

/** Short beep per second — long countdown.mp3 was stacking and outliving the timer. */
function playMaintTick() {
  stopMaintTick();
  try {
    const a = new Audio("/audio/beep.mp3");
    a.volume = 0.35;
    maintTickAudio = a;
    a.onended = () => {
      if (maintTickAudio === a) maintTickAudio = null;
    };
    const p = a.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    /* ignore */
  }
}

function resolveCountdownEndsAt(msg) {
  const secHint = Math.max(1, Number(msg.seconds) || 15);
  const relative = Date.now() + secHint * 1000;
  const abs = Number(msg.endsAt);
  if (!Number.isFinite(abs)) return relative;
  // Reject stale / wildly skewed absolute stamps (clock skew / late join).
  if (Math.abs(abs - relative) > 2500) return relative;
  return abs;
}

function paintCountdownOverlay(el) {
  if (!el || !document.body.contains(el)) return;
  const target = el._nvEndsAt || Date.now();
  const leftMs = Math.max(0, target - Date.now());
  // floor+1 feel: show N while (N-1, N] seconds remain, except exact 0.
  const sec = leftMs <= 0 ? 0 : Math.max(1, Math.ceil(leftMs / 1000));
  if (sec !== countdownLastSec) {
    const prev = countdownLastSec;
    countdownLastSec = sec;
    // Tick once when the displayed second changes (including first paint).
    if (sec > 0 && sec !== prev) playMaintTick();
    const badge = el._nvDeploy ? "SYSTEM UPDATE" : "MAINTENANCE";
    const title = el._nvDeploy ? "กำลังอัปเดตระบบใน" : "Maintenance in";
    const sub = el._nvDeploy
      ? `กรุณาหยุดการกระทำ — ปิดปรับปรุงใน ${sec} วินาที`
      : `ปิดเซิร์ฟใน ${sec} วินาที`;
    el.innerHTML = `
      <div style="
        width:min(420px,100%);text-align:center;color:#fee2e2;
        font-family:system-ui,Segoe UI,sans-serif;
        background:#1a1018;border:1px solid rgba(239,68,68,.5);
        border-radius:20px;padding:28px 24px 24px;
        box-shadow:0 24px 70px rgba(0,0,0,.55)">
        <div style="
          display:inline-block;margin-bottom:10px;padding:4px 12px;border-radius:999px;
          background:rgba(239,68,68,.18);border:1px solid rgba(239,68,68,.4);
          font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase">
          ${badge}
        </div>
        <div style="font-size:1.05rem;font-weight:800;margin-bottom:6px;color:#fecaca">
          ${title}
        </div>
        <div style="
          font-size:4.2rem;line-height:1;font-weight:900;
          font-variant-numeric:tabular-nums;letter-spacing:.04em;
          color:#fff;text-shadow:0 0 24px rgba(239,68,68,.45);margin:8px 0 10px">
          ${sec}
        </div>
        <div style="font-size:.95rem;font-weight:700;color:#fca5a5;margin-bottom:12px">
          ${sub}
        </div>
        <p style="margin:0;color:#f5c2c2;line-height:1.45;white-space:pre-wrap">${esc(el._nvMessage || "")}</p>
        ${
          el._nvBypass
            ? `<div style="margin-top:12px;font-size:.82rem;opacity:.8">แอดมิน: คุณจะไม่ถูกบล็อกหลังปิด</div>`
            : ""
        }
      </div>`;
  }
  if (sec <= 0) {
    stopMaintTick();
    hideMaintenanceCountdown();
  }
}

/**
 * Center overlay: Maintenance in 15, 14, 13...
 * msg: { message, seconds, endsAt, cancelled? }
 */
export function applyMaintenanceCountdown(msg, { bypass = false } = {}) {
  if (!msg || msg.cancelled) {
    hideMaintenanceCountdown();
    return;
  }
  ensureStyles();
  const endsAt = resolveCountdownEndsAt(msg);
  const message =
    msg.message || "ระบบจะปิดปรับปรุงชั่วคราว กรุณาเตรียมออกจากห้อง";
  const isDeploy =
    /อัปเดต|อัพเดต|deploy|update/i.test(String(message)) || msg.kind === "deploy";

  let el = document.getElementById("nvMaintCountdown");
  // Server pulses every 1s — only refresh endsAt/message, do NOT reset lastSec
  // (that was causing double ticks and drifting timing).
  if (el && countdownTimer) {
    el._nvEndsAt = endsAt;
    el._nvMessage = message;
    el._nvBypass = !!bypass;
    el._nvDeploy = isDeploy;
    return;
  }

  if (!el) {
    el = document.createElement("div");
    el.id = "nvMaintCountdown";
    el.setAttribute("role", "alertdialog");
    el.setAttribute("aria-live", "assertive");
    el.setAttribute("aria-modal", "true");
    document.body.appendChild(el);
  }
  el.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:99985",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "padding:24px",
    "background:rgba(6,8,18,.72)",
    "backdrop-filter:blur(6px)",
    "pointer-events:auto"
  ].join(";");
  el._nvEndsAt = endsAt;
  el._nvMessage = message;
  el._nvBypass = !!bypass;
  el._nvDeploy = isDeploy;
  countdownLastSec = -1;

  if (countdownTimer) clearInterval(countdownTimer);
  paintCountdownOverlay(el);
  countdownTimer = setInterval(() => paintCountdownOverlay(el), 100);
}

export default enforceMaintenanceGate;
