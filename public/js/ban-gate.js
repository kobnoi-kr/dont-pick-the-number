const BAN_KEY = "nv-ban-msg";

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function titleFor(status) {
  if (status === "suspended") return "บัญชีถูกระงับ";
  if (status === "deleted") return "บัญชีถูกลบ";
  return "คุณถูกแบน";
}

function ensureBanStyles() {
  if (document.getElementById("nvBanCss")) return;
  const style = document.createElement("style");
  style.id = "nvBanCss";
  style.textContent = `
    .nv-ban-overlay{
      position:fixed;inset:0;z-index:99995;
      display:flex;align-items:center;justify-content:center;
      padding:24px;background:rgba(8,6,12,.88);backdrop-filter:blur(10px);
      color:#fde8e8;font-family:system-ui,Segoe UI,sans-serif;text-align:center;
    }
    .nv-ban-card{
      max-width:420px;width:100%;
      background:#1a1018;border:1px solid rgba(239,68,68,.45);
      border-radius:18px;padding:28px 24px;
      box-shadow:0 20px 60px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.04);
      animation:nvBanIn .22s ease;
    }
    @keyframes nvBanIn{
      from{opacity:0;transform:translateY(10px) scale(.98)}
      to{opacity:1;transform:translateY(0) scale(1)}
    }
    .nv-ban-kicker{
      display:inline-block;margin:0 0 10px;padding:4px 10px;border-radius:999px;
      background:rgba(239,68,68,.18);border:1px solid rgba(239,68,68,.4);
      color:#fecaca;font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
    }
    .nv-ban-card h1{margin:0 0 10px;font-size:1.45rem;color:#fee2e2}
    .nv-ban-card p{margin:0;color:#f5c2c2;line-height:1.5;white-space:pre-wrap}
    .nv-ban-actions{margin-top:18px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
    .nv-ban-actions a,.nv-ban-actions button{
      appearance:none;border:1px solid rgba(255,255,255,.16);background:#2a1520;color:#fee2e2;
      border-radius:999px;padding:10px 16px;text-decoration:none;cursor:pointer;font:inherit
    }
    .nv-ban-actions a.primary{background:#dc2626;border-color:transparent;color:#fff}
  `;
  document.head.appendChild(style);
}

function persistBan(payload) {
  try {
    sessionStorage.setItem(BAN_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function readStoredBan() {
  try {
    const raw = sessionStorage.getItem(BAN_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

export function clearStoredBan() {
  try {
    sessionStorage.removeItem(BAN_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Full-screen center notice when the account is banned/suspended/deleted.
 * @param {{status?:string,message?:string}} msg
 */
export function applyBanNotice(msg = {}) {
  ensureBanStyles();
  const status = String(msg.status || "banned");
  const message =
    String(msg.message || "").trim() ||
    (status === "suspended"
      ? "บัญชีของคุณถูกระงับชั่วคราว กรุณาติดต่อแอดมิน"
      : status === "deleted"
        ? "บัญชีของคุณถูกลบแล้ว"
        : "บัญชีของคุณถูกแบน ไม่สามารถเข้าเล่นได้");
  persistBan({ status, message, at: Date.now() });

  let el = document.getElementById("nvBanOverlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "nvBanOverlay";
    el.className = "nv-ban-overlay";
    el.setAttribute("role", "alertdialog");
    el.setAttribute("aria-modal", "true");
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <div class="nv-ban-card">
      <div class="nv-ban-kicker">${esc(status)}</div>
      <h1>${esc(titleFor(status))}</h1>
      <p>${esc(message)}</p>
      <div class="nv-ban-actions">
        <a class="primary" href="/login.html">ไปหน้าเข้าสู่ระบบ</a>
        <button type="button" id="nvBanDismiss">ปิด</button>
      </div>
    </div>
  `;
  const dismiss = el.querySelector("#nvBanDismiss");
  if (dismiss) {
    dismiss.onclick = () => {
      // Keep stored ban so refresh still shows; only hide this layer if they insist.
      el.remove();
    };
  }
  return el;
}

/** On boot: re-show ban overlay if we were kicked this session. */
export function restoreBanNotice() {
  const stored = readStoredBan();
  if (!stored) return false;
  applyBanNotice(stored);
  return true;
}

export default applyBanNotice;
