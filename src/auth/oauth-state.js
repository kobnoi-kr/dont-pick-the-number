"use strict";

const crypto = require("crypto");
const { randomToken } = require("./crypto");
const { parseCookies } = require("./cookies");

const OAUTH_COOKIE = "numverse_oauth";
const TTL_SEC = 10 * 60;

function authSecret() {
  return process.env.AUTH_SECRET || process.env.SESSION_SECRET || "dev-only-change-me";
}

function sign(payloadB64) {
  return crypto.createHmac("sha256", authSecret()).update(payloadB64).digest("base64url");
}

function encodeState(data) {
  const payloadB64 = Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
  return payloadB64 + "." + sign(payloadB64);
}

function decodeState(raw) {
  if (!raw || typeof raw !== "string") return null;
  const idx = raw.lastIndexOf(".");
  if (idx < 0) return null;
  const payloadB64 = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (!data || !data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function createPkce() {
  const verifier = randomToken(32);
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function beginOAuth({ provider, mode, userId }) {
  const state = randomToken(16);
  const pkce = createPkce();
  const data = {
    provider,
    mode: mode || "login", // login | link | upgrade
    userId: userId || null,
    state,
    verifier: pkce.verifier,
    exp: Date.now() + TTL_SEC * 1000
  };
  return {
    state,
    challenge: pkce.challenge,
    cookieValue: encodeState(data),
    maxAgeSec: TTL_SEC
  };
}

function readOAuthCookie(req) {
  return decodeState(parseCookies(req)[OAUTH_COOKIE] || "");
}

function oauthCookieHeader(value, maxAgeSec) {
  const secure = process.env.COOKIE_SECURE === "1" || process.env.NODE_ENV === "production";
  const parts = [
    OAUTH_COOKIE + "=" + encodeURIComponent(value || ""),
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=" + Math.max(0, Math.floor(maxAgeSec || 0))
  ];
  if (secure) parts.splice(1, 0, "Secure");
  if (!value) parts.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  return parts.join("; ");
}

module.exports = {
  OAUTH_COOKIE,
  beginOAuth,
  readOAuthCookie,
  oauthCookieHeader,
  decodeState
};
