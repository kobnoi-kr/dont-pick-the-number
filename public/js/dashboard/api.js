export async function api(path, opts = {}) {
  const headers = Object.assign(
    { Accept: "application/json", "Content-Type": "application/json" },
    opts.headers || {}
  );
  if (opts.body == null || opts.method === "GET" || opts.method === "HEAD") {
    delete headers["Content-Type"];
  }
  const res = await fetch(path, Object.assign({ credentials: "same-origin", headers }, opts));
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { res, data };
}

export async function ensureGuest() {
  const me = await api("/api/v1/auth/me", { method: "GET" });
  if (me.res.ok && me.data && me.data.user) return me.data;
  const guest = await api("/api/v1/auth/guest", { method: "POST", body: "{}" });
  if (!guest.res.ok) throw new Error((guest.data && guest.data.error) || "guest_failed");
  return guest.data;
}

export function playUrl(opts = {}) {
  const q = new URLSearchParams();
  if (opts.code) q.set("code", opts.code);
  if (opts.create) q.set("create", opts.create);
  if (opts.watch) q.set("watch", "1");
  if (opts.name) q.set("name", opts.name);
  if (opts.setup) q.set("setup", JSON.stringify(opts.setup));
  const s = q.toString();
  return "/play.html" + (s ? "?" + s : "");
}
