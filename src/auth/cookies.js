"use strict";

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "numverse_session";

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = Object.create(null);
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx < 0) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) return;
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  });
  return out;
}

function sessionCookieOptions(maxAgeSec) {
  const secure = process.env.COOKIE_SECURE === "1" || process.env.NODE_ENV === "production";
  const parts = [
    COOKIE_NAME + "=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=" + Math.max(0, Math.floor(maxAgeSec || 0))
  ];
  if (secure) parts.splice(1, 0, "Secure");
  if (process.env.COOKIE_DOMAIN) parts.push("Domain=" + process.env.COOKIE_DOMAIN);
  return parts;
}

function appendSetCookie(res, cookieStr) {
  const prev = res.getHeader("Set-Cookie");
  if (!prev) {
    res.setHeader("Set-Cookie", cookieStr);
    return;
  }
  const list = Array.isArray(prev) ? prev.slice() : [String(prev)];
  list.push(cookieStr);
  res.setHeader("Set-Cookie", list);
}

function setSessionCookie(res, token, maxAgeSec) {
  const parts = sessionCookieOptions(maxAgeSec);
  parts[0] = COOKIE_NAME + "=" + encodeURIComponent(token);
  appendSetCookie(res, parts.join("; "));
}

function clearSessionCookie(res) {
  const parts = sessionCookieOptions(0);
  parts[0] = COOKIE_NAME + "=";
  parts.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  appendSetCookie(res, parts.join("; "));
}

function readSessionToken(req) {
  return parseCookies(req)[COOKIE_NAME] || "";
}

module.exports = {
  COOKIE_NAME,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  readSessionToken,
  appendSetCookie
};
