"use strict";

const { createRemoteJWKSet, jwtVerify } = require("jose");
const { beginOAuth } = require("./oauth-state");

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

function googleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function publicBaseUrl(req) {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] || "http").toString().split(",")[0].trim();
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "localhost").toString().split(",")[0].trim();
  return proto + "://" + host;
}

function googleRedirectUri(req) {
  return process.env.GOOGLE_REDIRECT_URI || publicBaseUrl(req) + "/api/v1/auth/google/callback";
}

function startGoogleOAuth(req, { mode, userId }) {
  if (!googleConfigured()) {
    const err = new Error("google_not_configured");
    err.code = "google_not_configured";
    throw err;
  }
  const started = beginOAuth({ provider: "google", mode, userId });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(req),
    response_type: "code",
    scope: "openid email profile",
    state: started.state,
    code_challenge: started.challenge,
    code_challenge_method: "S256",
    access_type: "online",
    prompt: "select_account"
  });
  return {
    url: GOOGLE_AUTH + "?" + params.toString(),
    cookieValue: started.cookieValue,
    maxAgeSec: started.maxAgeSec
  };
}

async function exchangeGoogleCode(req, code, verifier) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: googleRedirectUri(req),
    grant_type: "authorization_code",
    code_verifier: verifier
  });
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error("google_token_exchange_failed");
    err.code = "oauth_exchange_failed";
    err.detail = text.slice(0, 300);
    throw err;
  }
  return res.json();
}

async function verifyGoogleIdToken(idToken) {
  const { payload } = await jwtVerify(idToken, jwks, {
    audience: process.env.GOOGLE_CLIENT_ID
  });
  if (!GOOGLE_ISSUERS.has(String(payload.iss))) {
    const err = new Error("invalid_issuer");
    err.code = "invalid_token";
    throw err;
  }
  if (!payload.sub) {
    const err = new Error("missing_sub");
    err.code = "invalid_token";
    throw err;
  }
  return {
    providerUserId: String(payload.sub),
    email: payload.email ? String(payload.email).toLowerCase() : null,
    emailVerified: !!payload.email_verified,
    displayName: payload.name ? String(payload.name) : null,
    avatarUrl: payload.picture ? String(payload.picture) : null
  };
}

module.exports = {
  googleConfigured,
  startGoogleOAuth,
  exchangeGoogleCode,
  verifyGoogleIdToken,
  publicBaseUrl
};
