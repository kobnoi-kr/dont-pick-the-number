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
        ${adminBypass ? `<a class="primary" href="/admin.html">ไปหน้า Admin</a>` : ""}
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

function hideMaintenanceCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  const el = document.getElementById("nvMaintCountdown");
  if (el) el.remove();
}

/**
 * Top banner: server closing in N seconds.
 * msg: { message, seconds, endsAt, cancelled? }
 */
export function applyMaintenanceCountdown(msg, { bypass = false } = {}) {
  if (!msg || msg.cancelled) {
    hideMaintenanceCountdown();
    return;
  }
  ensureStyles();
  // Admins still see the warning so they know the kick is coming.
  const endsAt =
    Number(msg.endsAt) ||
    Date.now() + Math.max(1, Number(msg.seconds) || 15) * 1000;
  let el = document.getElementById("nvMaintCountdown");
  if (!el) {
    el = document.createElement("div");
    el.id = "nvMaintCountdown";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "assertive");
    document.body.appendChild(el);
  }
  el.style.cssText = [
    "position:fixed",
    "top:14px",
    "left:50%",
    "transform:translateX(-50%)",
    "z-index:99980",
    "width:min(460px,calc(100vw - 24px))",
    "pointer-events:none"
  ].join(";");
  const message =
    msg.message || "ระบบจะปิดปรับปรุงชั่วคราว กรุณาบันทึก/จบเกมก่อน";

  const paint = () => {
    const leftMs = Math.max(0, endsAt - Date.now());
    const sec = Math.ceil(leftMs / 1000);
    el.innerHTML = `
      <div style="
        pointer-events:auto;display:flex;align-items:center;gap:12px;
        padding:12px 14px;border-radius:14px;
        background:rgba(40,16,16,.96);border:1px solid rgba(239,68,68,.45);
        box-shadow:0 14px 40px rgba(0,0,0,.5);color:#fee2e2;
        font-family:system-ui,Segoe UI,sans-serif">
        <div style="flex:1;min-width:0">
          <div style="font-size:.7rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;opacity:.85;margin-bottom:2px">
            ปิดเซิร์ฟใน ${sec} วินาที
          </div>
          <div style="font-weight:700;line-height:1.35;white-space:pre-wrap">${esc(message)}</div>
          ${bypass ? `<div style="margin-top:4px;font-size:.8rem;opacity:.75">แอดมิน: คุณจะไม่ถูกบล็อกหลังปิด</div>` : ""}
        </div>
        <div style="
          flex:0 0 auto;min-width:52px;height:52px;border-radius:12px;
          display:flex;align-items:center;justify-content:center;
          background:rgba(239,68,68,.2);border:1px solid rgba(239,68,68,.4);
          font-size:1.45rem;font-weight:900;font-variant-numeric:tabular-nums">${sec}</div>
      </div>`;
    if (sec <= 0) {
      hideMaintenanceCountdown();
    }
  };

  if (countdownTimer) clearInterval(countdownTimer);
  paint();
  countdownTimer = setInterval(paint, 250);
}

export default enforceMaintenanceGate;
