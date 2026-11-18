import { api } from "./api.js";
import { playSfx } from "./sfx.js";

const DM_SOUND = "/audio/snapchat-message.mp3";
const CHAT_EMOJIS = [
  "😀","😁","😂","🤣","😊","😍","😘","😎",
  "🤩","😇","🙂","😉","😭","😤","😡","🤔",
  "😴","🤒","🤢","😈","👻","💀","🔥","✨",
  "💥","❤️","🧡","💛","💚","💙","💜","🖤",
  "👍","👎","👏","🙌","🤝","✌️","🤞","💪",
  "🎮","🎲","🐍","🪜","🏆","🥇","🎯","⚡",
  "🍀","🎉","🎊","💯","✅","❌","⭐","🌟"
];

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function clipChatBody(s) {
  return Array.from(String(s || "").trim().replace(/\s+/g, " ")).slice(0, 280).join("");
}

function looksLikeEmojiOnly(s) {
  const t = String(s || "").trim();
  if (!t) return false;
  // short emoji / emoji clusters without much plain text
  return Array.from(t).length <= 8 && /[\p{Extended_Pictographic}\uFE0F\u200D]/u.test(t);
}

function when(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return "เมื่อสักครู่";
    if (diff < 3_600_000) return Math.floor(diff / 60_000) + " นาทีที่แล้ว";
    return d.toLocaleString("th-TH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

let activePeerId = null;
let conversations = [];

function paintUnread(n) {
  const dot = document.getElementById("chatDot");
  if (dot) dot.classList.toggle("hidden", !(n > 0));
}

function avatarHtml(user) {
  const name = (user && (user.displayName || user.username)) || "?";
  if (user && user.avatarUrl) {
    return `<img class="chat-av" src="${esc(user.avatarUrl)}" alt="" width="36" height="36" referrerpolicy="no-referrer">`;
  }
  return `<div class="chat-av ph">${esc(name.slice(0, 1).toUpperCase())}</div>`;
}

async function loadConversations() {
  const list = document.getElementById("chatConvList");
  const empty = document.getElementById("chatEmpty");
  if (!list) return;
  list.innerHTML = `<div class="loading">Loading…</div>`;
  const { res, data } = await api("/api/v1/chat/conversations", { method: "GET" });
  if (!res.ok) {
    list.innerHTML = "";
    if (empty) {
      empty.classList.remove("hidden");
      empty.textContent = res.status === 403 ? "เข้าสู่ระบบด้วยบัญชีจริงเพื่อแชทกับเพื่อน" : "โหลดแชทไม่ได้";
    }
    paintUnread(0);
    return;
  }
  conversations = data.conversations || [];
  paintUnread(data.unread || 0);
  if (!conversations.length) {
    list.innerHTML = "";
    if (empty) {
      empty.classList.remove("hidden");
      empty.textContent = "ยังไม่มีเพื่อน — ไปเพิ่มเพื่อนก่อน";
    }
    return;
  }
  if (empty) empty.classList.add("hidden");
  list.innerHTML = conversations
    .map((c) => {
      const u = c.user || {};
      const preview = c.lastMessage ? c.lastMessage.body : "เริ่มแชท…";
      const unread = c.unread > 0 ? `<span class="chat-unread">${c.unread > 99 ? "99+" : c.unread}</span>` : "";
      return `<button type="button" class="chat-conv${c.unread ? " has-unread" : ""}" data-peer="${esc(c.userId)}">
        ${avatarHtml(u)}
        <span class="chat-conv-meta">
          <span class="chat-conv-name">${esc(u.displayName || "เพื่อน")}${unread}</span>
          <span class="chat-conv-preview">${esc(preview)}</span>
        </span>
      </button>`;
    })
    .join("");
  list.querySelectorAll("[data-peer]").forEach((btn) => {
    btn.onclick = () => openThread(btn.getAttribute("data-peer"));
  });
}

async function openThread(peerId) {
  activePeerId = peerId;
  const listView = document.getElementById("chatListView");
  const threadView = document.getElementById("chatThreadView");
  const title = document.getElementById("chatThreadTitle");
  const box = document.getElementById("chatThreadMsgs");
  const peer = (conversations.find((c) => c.userId === peerId) || {}).user;
  if (listView) listView.classList.add("hidden");
  if (threadView) threadView.classList.remove("hidden");
  if (title) title.textContent = (peer && peer.displayName) || "แชท";
  if (box) box.innerHTML = `<div class="loading">Loading…</div>`;
  const { res, data } = await api(`/api/v1/chat/with/${encodeURIComponent(peerId)}?limit=80`, { method: "GET" });
  if (!res.ok) {
    if (box) box.innerHTML = `<div class="empty">โหลดข้อความไม่ได้</div>`;
    return;
  }
  if (title && data.peer) title.textContent = data.peer.displayName || "แชท";
  paintUnread(data.unread || 0);
  const meId = (window.__nvMeId || "").toString();
  if (box) {
    box.innerHTML = (data.messages || [])
      .map((m) => {
        const mine = meId && m.senderId === meId;
        const emoji = looksLikeEmojiOnly(m.body);
        return `<div class="chat-bubble-row${mine ? " mine" : ""}">
          <div class="chat-bubble${emoji ? " is-emoji" : ""}">${esc(m.body)}</div>
          <div class="chat-bubble-time">${esc(when(m.createdAt))}</div>
        </div>`;
      })
      .join("");
    box.scrollTop = box.scrollHeight;
  }
  setChatEmojiPanel(false);
  const input = document.getElementById("chatThreadInput");
  if (input) {
    input.value = "";
    requestAnimationFrame(() => input.focus());
  }
}

function backToList() {
  activePeerId = null;
  const listView = document.getElementById("chatListView");
  const threadView = document.getElementById("chatThreadView");
  if (threadView) threadView.classList.add("hidden");
  if (listView) listView.classList.remove("hidden");
  loadConversations();
}

async function sendThread() {
  if (!activePeerId) return;
  const input = document.getElementById("chatThreadInput");
  const msgEl = document.getElementById("chatThreadMsg");
  const body = (input && input.value ? input.value : "").trim();
  if (!body) return;
  if (msgEl) msgEl.textContent = "";
  const { res, data } = await api(`/api/v1/chat/with/${encodeURIComponent(activePeerId)}`, {
    method: "POST",
    body: JSON.stringify({ body })
  });
  if (!res.ok) {
    if (msgEl) {
      msgEl.textContent =
        res.status === 429 ? "ส่งบ่อยเกินไป" : res.status === 403 ? "แชทได้เฉพาะเพื่อน" : "ส่งไม่สำเร็จ";
    }
    return;
  }
  if (input) input.value = "";
  setChatEmojiPanel(false);
  const box = document.getElementById("chatThreadMsgs");
  if (box && data.message) {
    const m = data.message;
    const emoji = looksLikeEmojiOnly(m.body);
    box.insertAdjacentHTML(
      "beforeend",
      `<div class="chat-bubble-row mine">
        <div class="chat-bubble${emoji ? " is-emoji" : ""}">${esc(m.body)}</div>
        <div class="chat-bubble-time">${esc(when(m.createdAt))}</div>
      </div>`
    );
    box.scrollTop = box.scrollHeight;
  }
}

function setChatEmojiPanel(open) {
  const panel = document.getElementById("chatEmojiPanel");
  const btn = document.getElementById("chatEmojiBtn");
  if (!panel) return;
  panel.classList.toggle("hidden", !open);
  if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
}

function wireChatEmoji() {
  const btn = document.getElementById("chatEmojiBtn");
  const panel = document.getElementById("chatEmojiPanel");
  const form = document.getElementById("chatThreadForm");
  if (!btn || !panel) return;
  panel.innerHTML = CHAT_EMOJIS.map(
    (e) => `<button type="button" data-emoji="${e}" aria-label="${e}">${e}</button>`
  ).join("");
  panel.onclick = (e) => {
    const pick = e.target.closest("[data-emoji]");
    if (!pick) return;
    const input = document.getElementById("chatThreadInput");
    if (!input) return;
    const emoji = pick.getAttribute("data-emoji") || "";
    input.value = clipChatBody(input.value + emoji);
    input.focus();
    try {
      const end = input.value.length;
      input.setSelectionRange(end, end);
    } catch (_) {}
  };
  btn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setChatEmojiPanel(panel.classList.contains("hidden"));
  };
  document.addEventListener("click", (e) => {
    if (!panel || panel.classList.contains("hidden")) return;
    if (form && form.contains(e.target)) return;
    setChatEmojiPanel(false);
  });
}

export async function refreshChatUnread() {
  const { res, data } = await api("/api/v1/chat/unread", { method: "GET" });
  if (!res.ok) {
    paintUnread(0);
    return 0;
  }
  paintUnread(data.unread || 0);
  return data.unread || 0;
}

export function onChatDmPush(msg) {
  playSfx(DM_SOUND, 0.5);
  const panel = document.getElementById("chatPanel");
  const open = panel && !panel.classList.contains("hidden");
  if (open && activePeerId && msg.message && msg.message.senderId === activePeerId) {
    openThread(activePeerId);
  } else if (open && !activePeerId) {
    loadConversations();
  } else {
    refreshChatUnread();
  }
}

export function wireChat(user) {
  const btn = document.getElementById("chatBtn");
  const panel = document.getElementById("chatPanel");
  if (!btn || !panel) return;
  window.__nvMeId = user && user.id ? user.id : "";

  const registered = user && user.accountType === "registered";
  btn.classList.toggle("hidden", !registered);
  if (!registered) return;

  panel.addEventListener("click", (e) => e.stopPropagation());
  panel.addEventListener("mousedown", (e) => e.stopPropagation());

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const notif = document.getElementById("notifPanel");
    if (notif) notif.classList.add("hidden");
    const willOpen = panel.classList.contains("hidden");
    panel.classList.toggle("hidden", !willOpen);
    if (willOpen) {
      backToList();
      await loadConversations();
    }
  });

  document.addEventListener("click", (e) => {
    if (panel.classList.contains("hidden")) return;
    if (btn.contains(e.target) || panel.contains(e.target)) return;
    if (e.target && e.target.isConnected === false) return;
    panel.classList.add("hidden");
  });

  const back = document.getElementById("chatThreadBack");
  if (back) back.onclick = (e) => {
    e.stopPropagation();
    backToList();
  };
  const form = document.getElementById("chatThreadForm");
  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault();
      sendThread();
    };
  }
  wireChatEmoji();

  refreshChatUnread();
}
