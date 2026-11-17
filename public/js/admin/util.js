export function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

export function fmtDate(v) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

export function statusPill(status) {
  const s = String(status || "active");
  return `<span class="status-pill status-${esc(s)}">${esc(s)}</span>`;
}

export function hasPerm(user, perm) {
  if (!user) return false;
  const roles = user.roles || [];
  if (roles.includes("super_admin")) return true;
  return (user.permissions || []).includes(perm);
}

export function modeLabel(mode) {
  return mode === "wheel" ? "วงล้อ" : "หาเลข";
}
