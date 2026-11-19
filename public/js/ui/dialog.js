function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function ensureHost() {
  let host = document.getElementById("nvDialogHost");
  if (host) return host;
  host = document.createElement("div");
  host.id = "nvDialogHost";
  document.body.appendChild(host);
  return host;
}

function closeActive(result) {
  const host = document.getElementById("nvDialogHost");
  if (!host) return;
  const overlay = host.querySelector(".nv-dialog");
  if (!overlay) return;
  const resolve = overlay._nvResolve;
  host.innerHTML = "";
  if (typeof resolve === "function") resolve(result);
}

function showDialog({
  title = "",
  bodyHtml = "",
  confirmLabel = "ตกลง",
  cancelLabel = "ยกเลิก",
  danger = false,
  showCancel = true
} = {}) {
  return new Promise((resolve) => {
    closeActive(false);
    const host = ensureHost();
    host.innerHTML = `
      <div class="nv-dialog" role="dialog" aria-modal="true" aria-labelledby="nvDialogTitle">
        <div class="nv-dialog-card">
          ${title ? `<h3 id="nvDialogTitle">${esc(title)}</h3>` : `<h3 id="nvDialogTitle" class="sr-only">ยืนยัน</h3>`}
          <div class="nv-dialog-body">${bodyHtml}</div>
          <div class="nv-dialog-actions">
            ${
              showCancel
                ? `<button type="button" class="btn ghost" data-nv-cancel>${esc(cancelLabel)}</button>`
                : ""
            }
            <button type="button" class="btn${danger ? " danger" : ""}" data-nv-ok>${esc(confirmLabel)}</button>
          </div>
        </div>
      </div>`;
    const overlay = host.querySelector(".nv-dialog");
    overlay._nvResolve = resolve;
    const ok = overlay.querySelector("[data-nv-ok]");
    const cancel = overlay.querySelector("[data-nv-cancel]");
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup(false);
      } else if (e.key === "Enter" && document.activeElement === ok) {
        e.preventDefault();
        cleanup(true);
      }
    };
    function cleanup(val) {
      document.removeEventListener("keydown", onKey, true);
      closeActive(val);
    }
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) cleanup(false);
    });
    if (cancel) cancel.onclick = () => cleanup(false);
    if (ok) ok.onclick = () => cleanup(true);
    document.addEventListener("keydown", onKey, true);
    (ok || cancel || overlay).focus();
  });
}

/** Centered confirm popup. Replaces window.confirm across the app. */
export function confirmDialog(message, opts = {}) {
  const text = String(message || "").trim();
  const title = opts.title != null ? String(opts.title) : "ยืนยัน";
  return showDialog({
    title,
    bodyHtml: `<p class="nv-dialog-msg">${esc(text)}</p>`,
    confirmLabel: opts.confirmLabel || "ตกลง",
    cancelLabel: opts.cancelLabel || "ยกเลิก",
    danger: !!opts.danger,
    showCancel: opts.showCancel !== false
  });
}

/** Info / details popup (e.g. item full description). */
export function openDetailsDialog({ title = "รายละเอียด", bodyHtml = "", closeLabel = "ปิด" } = {}) {
  return showDialog({
    title,
    bodyHtml,
    confirmLabel: closeLabel,
    showCancel: false,
    danger: false
  });
}

export function itemDetailsBody(item) {
  const short = String((item && item.description) || "").trim();
  const details = String((item && item.details) || "").trim();
  const lines = details
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<li>${esc(line)}</li>`)
    .join("");
  const img =
    item && item.imageUrl
      ? `<div class="nv-dialog-item-thumb"><img src="${esc(item.imageUrl)}" alt="" decoding="async"></div>`
      : "";
  return `${img}
    ${item && item.name ? `<p class="nv-dialog-item-name"><b>${esc(item.name)}</b></p>` : ""}
    ${short ? `<p class="nv-dialog-msg">${esc(short)}</p>` : ""}
    ${lines ? `<ul class="nv-dialog-list">${lines}</ul>` : `<p class="nv-dialog-msg muted">ไม่มีรายละเอียดเพิ่มเติม</p>`}`;
}

export async function openItemDetailsDialog(item) {
  if (!item) return false;
  return openDetailsDialog({
    title: "รายละเอียดไอเทม",
    bodyHtml: itemDetailsBody(item),
    closeLabel: "ปิด"
  });
}
