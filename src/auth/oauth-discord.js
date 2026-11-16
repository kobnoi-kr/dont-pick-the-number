"use strict";

const { beginOAuth } = require("./oauth-state");
const { publicBaseUrl } = require("./oauth-google");

const DISCORD_AUTH = "https://discord.com/api/oauth2/authorize";
const DISCORD_TOKEN = "https://discord.com/api/oauth2/token";
const DISCORD_ME = "https://discord.com/api/users/@me";

function discordConfigured() {
  return !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
}

function discordRedirectUri(req) {
  return process.env.DISCORD_REDIRECT_URI || publicBaseUrl(req) + "/api/v1/auth/discord/callback";
}

function startDiscordOAuth(req, { mode, userId }) {
  if (!discordConfigured()) {
    const err = new Error("discord_not_configured");
    err.code = "discord_not_configured";
    throw err;
  }
  const started = beginOAuth({ provider: "discord", mode, userId });
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: discordRedirectUri(req),
    response_type: "code",
    scope: "identify email",
    state: started.state,
    code_challenge: started.challenge,
    code_challenge_method: "S256",
    prompt: "consent"
  });
  return {
    url: DISCORD_AUTH + "?" + params.toString(),
    cookieValue: started.cookieValue,
    maxAgeSec: started.maxAgeSec
  };
}

async function exchangeDiscordCode(req, code, verifier) {
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: discordRedirectUri(req),
    code_verifier: verifier
  });
  const res = await fetch(DISCORD_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error("discord_token_exchange_failed");
    err.code = "oauth_exchange_failed";
    err.detail = text.slice(0, 300);
    throw err;
  }
  return res.json();
}

async function fetchDiscordUser(accessToken) {
  const res = await fetch(DISCORD_ME, {
    headers: { Authorization: "Bearer " + accessToken }
  });
  if (!res.ok) {
    const err = new Error("discord_user_failed");
    err.code = "oauth_profile_failed";
    throw err;
  }
  const profile = await res.json();
  const avatarUrl =
    profile.avatar && profile.id
      ? "https://cdn.discordapp.com/avatars/" + profile.id + "/" + profile.avatar + ".png"
      : null;
  return {
    providerUserId: String(profile.id),
    email: profile.email ? String(profile.email).toLowerCase() : null,
    emailVerified: !!profile.verified,
    displayName: profile.global_name || profile.username || "Discord Player",
    avatarUrl
  };
}

module.exports = {
  discordConfigured,
  startDiscordOAuth,
  exchangeDiscordCode,
  fetchDiscordUser
};
