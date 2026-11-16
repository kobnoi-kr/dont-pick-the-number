let sock = null;
let handlers = new Set();
let timer = null;

export function onDashboardMessage(fn) {
  handlers.add(fn);
  return () => handlers.delete(fn);
}

function emit(msg) {
  for (const fn of handlers) {
    try { fn(msg); } catch { /* ignore */ }
  }
}

export function connectDashboardWs() {
  if (sock && (sock.readyState === 0 || sock.readyState === 1)) return sock;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const host = window.NV_PUBLIC_WS_HOST || location.host;
  let ws;
  try {
    ws = new WebSocket(proto + "://" + host + "/ws");
  } catch {
    return null;
  }
  sock = ws;
  ws.onopen = () => {
    const token = localStorage.getItem("dpn-token") || "";
    ws.send(JSON.stringify({ t: "hello", token, name: localStorage.getItem("dpn-name") || "", dashboard: true }));
  };
  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg && typeof msg === "object") emit(msg);
  };
  ws.onclose = () => {
    if (sock !== ws) return;
    sock = null;
    clearTimeout(timer);
    timer = setTimeout(connectDashboardWs, 1000);
  };
  return ws;
}

export function sendWs(obj) {
  if (sock && sock.readyState === 1) sock.send(JSON.stringify(obj));
}
