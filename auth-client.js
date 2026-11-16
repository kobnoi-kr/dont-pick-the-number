async function api(path, opts = {}) {
  const res = await fetch(path, Object.assign({
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" }
  }, opts));
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  return { res, data };
}

function qs(name) {
  return new URLSearchParams(location.search).get(name) || "";
}

function setMsg(el, text, ok) {
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("ok", !!ok);
}

async function loadProviders() {
  const { res, data } = await api("/api/v1/auth/providers", { method: "GET", headers: { Accept: "application/json" } });
  if (!res.ok) return { authEnabled: false, providers: [] };
  return data;
}
