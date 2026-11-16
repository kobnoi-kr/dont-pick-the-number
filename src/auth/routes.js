"use strict";

const { getPrisma, authEnabled } = require("../db");
const { enabledProviders } = require("./config");
const {
  setSessionCookie,
  clearSessionCookie,
  readSessionToken,
  appendSetCookie
} = require("./cookies");
const { sendJson, clientIp, readJsonBody } = require("./http");
const { createGuestUser, publicUser } = require("./users");
const {
  createSession,
  findValidSession,
  revokeSession,
  revokeAllUserSessions,
  sessionResponse
} = require("./sessions");
const { resolveAuth, requireAuth } = require("./middleware");
const { rateLimit } = require("./rate-limit");
const { rotateAndIssueSession, redirect } = require("./issue");
const { oauthCookieHeader, readOAuthCookie } = require("./oauth-state");
const { googleConfigured, startGoogleOAuth, exchangeGoogleCode, verifyGoogleIdToken } = require("./oauth-google");
const {
  discordConfigured,
  startDiscordOAuth,
  exchangeDiscordCode,
  fetchDiscordUser
} = require("./oauth-discord");
const { resolveProviderLogin, unlinkProvider } = require("./upgrade");
const {
  registerWithEmail,
  loginWithEmail,
  verifyEmailToken,
  resendVerification,
  requestPasswordReset,
  resetPassword,
  linkEmailToUser
} = require("./email-auth");

function method(req) {
  return String(req.method || "GET").toUpperCase();
}

function tooMany(res, retryAfterSec) {
  sendJson(res, 429, { error: "rate_limited", retryAfterSec });
}

function lobbyRedirect() {
  return process.env.AUTH_SUCCESS_REDIRECT || "/";
}

function loginErrorRedirect(code) {
  return "/login.html?error=" + encodeURIComponent(code || "oauth_failed");
}

async function handleGuest(req, res) {
  if (method(req) !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  if (!authEnabled()) {
    sendJson(res, 503, { error: "auth_disabled" });
    return true;
  }

  const prisma = await getPrisma();
  const existingToken = readSessionToken(req);
  if (existingToken) {
    const existing = await findValidSession(prisma, existingToken);
    if (existing) {
      sendJson(res, 200, Object.assign({ reused: true }, sessionResponse(existing, existing.user)));
      return true;
    }
    clearSessionCookie(res);
  }

  const user = await createGuestUser(prisma, {
    ip: clientIp(req),
    userAgent: String(req.headers["user-agent"] || "").slice(0, 512)
  });
  const { session, token, ttlSec } = await createSession(prisma, user, {
    userAgent: String(req.headers["user-agent"] || "").slice(0, 512) || null,
    ipAddress: clientIp(req) || null
  });
  setSessionCookie(res, token, ttlSec);
  sendJson(res, 201, Object.assign({ reused: false }, sessionResponse(session, user)));
  return true;
}

async function handleMe(req, res) {
  if (method(req) !== "GET") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  const auth = await resolveAuth(req);
  if (!auth.enabled) {
    sendJson(res, 503, { error: "auth_disabled" });
    return true;
  }
  if (!auth.user || !auth.session) {
    sendJson(res, 401, { error: "unauthorized" });
    return true;
  }
  sendJson(res, 200, sessionResponse(auth.session, auth.user));
  return true;
}

async function handleLogout(req, res) {
  if (method(req) !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  if (!authEnabled()) {
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return true;
  }

  const prisma = await getPrisma();
  const token = readSessionToken(req);
  if (token) {
    const session = await findValidSession(prisma, token);
    if (session) await revokeSession(prisma, session.id);
  }
  clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
  return true;
}

async function handleLogoutAll(req, res) {
  if (method(req) !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  const auth = await requireAuth(req, res);
  if (!auth) return true;

  await revokeAllUserSessions(auth.prisma, auth.user.id);
  clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
  return true;
}

async function handleProviders(req, res) {
  if (method(req) !== "GET") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  sendJson(res, 200, {
    providers: enabledProviders(),
    authEnabled: authEnabled()
  });
  return true;
}

async function startOAuth(req, res, provider, mode) {
  if (method(req) !== "GET") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  if (!authEnabled()) {
    sendJson(res, 503, { error: "auth_disabled" });
    return true;
  }

  let userId = null;
  if (mode === "link" || mode === "upgrade") {
    const auth = await requireAuth(req, res);
    if (!auth) return true;
    userId = auth.user.id;
  } else {
    const auth = await resolveAuth(req);
    if (auth.user && auth.user.accountType === "guest") userId = auth.user.id;
  }

  try {
    const started =
      provider === "google"
        ? startGoogleOAuth(req, { mode: mode || "login", userId })
        : startDiscordOAuth(req, { mode: mode || "login", userId });
    appendSetCookie(res, oauthCookieHeader(started.cookieValue, started.maxAgeSec));
    redirect(res, started.url);
  } catch (err) {
    sendJson(res, 400, { error: err.code || "oauth_start_failed" });
  }
  return true;
}

async function finishOAuth(req, res, provider) {
  if (method(req) !== "GET") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  if (!authEnabled()) {
    redirect(res, loginErrorRedirect("auth_disabled"));
    return true;
  }

  const url = new URL(req.url || "/", "http://localhost");
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const oauthErr = url.searchParams.get("error");
  if (oauthErr) {
    appendSetCookie(res, oauthCookieHeader("", 0));
    redirect(res, loginErrorRedirect(oauthErr));
    return true;
  }

  const saved = readOAuthCookie(req);
  appendSetCookie(res, oauthCookieHeader("", 0));
  if (!saved || saved.provider !== provider || saved.state !== state || !code) {
    redirect(res, loginErrorRedirect("invalid_oauth_state"));
    return true;
  }

  try {
    const prisma = await getPrisma();
    let profile;
    if (provider === "google") {
      const tokens = await exchangeGoogleCode(req, code, saved.verifier);
      profile = await verifyGoogleIdToken(tokens.id_token);
      if (!profile.emailVerified && profile.email) {
        // Google email_verified false → still allow login by sub, but don't mark email verified
      }
    } else {
      const tokens = await exchangeDiscordCode(req, code, saved.verifier);
      profile = await fetchDiscordUser(tokens.access_token);
    }

    if (saved.mode === "link" && saved.userId) {
      const { linkProviderToUser } = require("./upgrade");
      await linkProviderToUser(prisma, {
        userId: saved.userId,
        provider,
        providerUserId: profile.providerUserId,
        providerEmail: profile.email,
        markEmailVerified: !!profile.emailVerified,
        eventType: "provider_linked",
        metadata: { displayName: profile.displayName, avatarUrl: profile.avatarUrl }
      });
      const user = await prisma.user.findUnique({
        where: { id: saved.userId },
        include: { userRoles: { include: { role: true } } }
      });
      await rotateAndIssueSession(prisma, req, res, user);
      redirect(res, "/account.html?linked=" + provider);
      return true;
    }

    const result = await resolveProviderLogin(prisma, {
      provider,
      providerUserId: profile.providerUserId,
      providerEmail: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      markEmailVerified: !!profile.emailVerified,
      guestUserId: saved.userId || null
    });
    await rotateAndIssueSession(prisma, req, res, result.user);
    redirect(res, lobbyRedirect());
  } catch (err) {
    console.error("[oauth:" + provider + "]", err);
    redirect(res, loginErrorRedirect(err.code || "oauth_failed"));
  }
  return true;
}

async function handleRegister(req, res) {
  if (method(req) !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  if (!authEnabled()) {
    sendJson(res, 503, { error: "auth_disabled" });
    return true;
  }
  const rl = rateLimit("reg:" + clientIp(req), 10, 15 * 60 * 1000);
  if (!rl.ok) return tooMany(res, rl.retryAfterSec), true;

  try {
    const body = await readJsonBody(req);
    const prisma = await getPrisma();
    const auth = await resolveAuth(req);
    const guestUserId =
      auth.user && auth.user.accountType === "guest" ? auth.user.id : null;
    const result = await registerWithEmail(prisma, req, {
      email: body.email,
      password: body.password,
      guestUserId
    });
    // Keep guest/registered session; email not verified yet so don't force login
    if (guestUserId) {
      await rotateAndIssueSession(prisma, req, res, result.user);
    }
    sendJson(res, 201, {
      ok: true,
      user: publicUser(result.user),
      upgraded: !!result.upgraded,
      verificationRequired: true,
      previewLink: process.env.NODE_ENV === "production" ? undefined : result.previewLink
    });
  } catch (err) {
    const status =
      err.code === "email_taken" ? 409 :
      err.code === "weak_password" || err.code === "invalid_input" ? 400 : 400;
    sendJson(res, status, { error: err.code || "register_failed", issues: err.issues });
  }
  return true;
}

async function handleLogin(req, res) {
  if (method(req) !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  if (!authEnabled()) {
    sendJson(res, 503, { error: "auth_disabled" });
    return true;
  }
  const rl = rateLimit("login:" + clientIp(req), 20, 15 * 60 * 1000);
  if (!rl.ok) return tooMany(res, rl.retryAfterSec), true;

  try {
    const body = await readJsonBody(req);
    const prisma = await getPrisma();
    const user = await loginWithEmail(prisma, {
      email: body.email,
      password: body.password
    });
    const payload = await rotateAndIssueSession(prisma, req, res, user);
    sendJson(res, 200, payload);
  } catch (err) {
    const status =
      err.code === "email_unverified" ? 403 :
      err.code === "account_blocked" ? 403 : 401;
    sendJson(res, status, { error: err.code || "invalid_credentials" });
  }
  return true;
}

async function handleVerifyEmail(req, res) {
  if (method(req) !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  if (!authEnabled()) {
    sendJson(res, 503, { error: "auth_disabled" });
    return true;
  }
  try {
    const body = await readJsonBody(req);
    const prisma = await getPrisma();
    const user = await verifyEmailToken(prisma, body.token);
    const payload = await rotateAndIssueSession(prisma, req, res, user);
    sendJson(res, 200, Object.assign({ verified: true }, payload));
  } catch (err) {
    sendJson(res, 400, { error: err.code || "invalid_token" });
  }
  return true;
}

async function handleResendVerification(req, res) {
  if (method(req) !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  if (!authEnabled()) {
    sendJson(res, 503, { error: "auth_disabled" });
    return true;
  }
  const rl = rateLimit("resend:" + clientIp(req), 5, 15 * 60 * 1000);
  if (!rl.ok) return tooMany(res, rl.retryAfterSec), true;
  try {
    const body = await readJsonBody(req);
    const prisma = await getPrisma();
    await resendVerification(prisma, req, body.email);
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 400, { error: err.code || "resend_failed" });
  }
  return true;
}

async function handleForgotPassword(req, res) {
  if (method(req) !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  if (!authEnabled()) {
    sendJson(res, 503, { error: "auth_disabled" });
    return true;
  }
  const rl = rateLimit("forgot:" + clientIp(req), 5, 15 * 60 * 1000);
  if (!rl.ok) return tooMany(res, rl.retryAfterSec), true;
  try {
    const body = await readJsonBody(req);
    const prisma = await getPrisma();
    const result = await requestPasswordReset(prisma, req, body.email);
    sendJson(res, 200, result);
  } catch (err) {
    sendJson(res, 200, { ok: true });
  }
  return true;
}

async function handleResetPassword(req, res) {
  if (method(req) !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  if (!authEnabled()) {
    sendJson(res, 503, { error: "auth_disabled" });
    return true;
  }
  try {
    const body = await readJsonBody(req);
    const prisma = await getPrisma();
    await resetPassword(prisma, { token: body.token, password: body.password });
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 400, { error: err.code || "reset_failed", issues: err.issues });
  }
  return true;
}

async function handleAccountProfile(req, res) {
  const m = method(req);
  if (m === "GET") {
    const auth = await requireAuth(req, res);
    if (!auth) return true;
    sendJson(res, 200, { user: publicUser(auth.user) });
    return true;
  }
  if (m === "PATCH") {
    const auth = await requireAuth(req, res);
    if (!auth) return true;
    try {
      const body = await readJsonBody(req);
      const displayName = String(body.displayName || "").trim().replace(/\s+/g, " ").slice(0, 64);
      if (!displayName) {
        sendJson(res, 400, { error: "invalid_input" });
        return true;
      }
      const user = await auth.prisma.user.update({
        where: { id: auth.user.id },
        data: { displayName, username: displayName.slice(0, 64) },
        include: { userRoles: { include: { role: true } } }
      });
      sendJson(res, 200, { user: publicUser(user) });
    } catch (err) {
      sendJson(res, 400, { error: "update_failed" });
    }
    return true;
  }
  sendJson(res, 405, { error: "method_not_allowed" });
  return true;
}

async function handleAccountProviders(req, res) {
  if (method(req) !== "GET") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  const auth = await requireAuth(req, res);
  if (!auth) return true;
  const rows = await auth.prisma.authAccount.findMany({
    where: { userId: auth.user.id },
    select: { provider: true, providerEmail: true, createdAt: true }
  });
  sendJson(res, 200, { providers: rows });
  return true;
}

async function handleLinkEmail(req, res) {
  if (method(req) !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  const auth = await requireAuth(req, res);
  if (!auth) return true;
  try {
    const body = await readJsonBody(req);
    const result = await linkEmailToUser(auth.prisma, req, auth.user.id, {
      email: body.email,
      password: body.password
    });
    const payload = await rotateAndIssueSession(auth.prisma, req, res, result.user);
    sendJson(res, 200, Object.assign({ verificationRequired: true }, payload));
  } catch (err) {
    sendJson(res, 400, { error: err.code || "link_failed", issues: err.issues });
  }
  return true;
}

async function handleUnlink(req, res, provider) {
  if (method(req) !== "DELETE") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  const auth = await requireAuth(req, res);
  if (!auth) return true;
  if (!["google", "discord", "email"].includes(provider)) {
    sendJson(res, 400, { error: "invalid_provider" });
    return true;
  }
  try {
    await unlinkProvider(auth.prisma, auth.user.id, provider);
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 400, { error: err.code || "unlink_failed" });
  }
  return true;
}

async function handleAccountSessions(req, res) {
  if (method(req) !== "GET") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  const auth = await requireAuth(req, res);
  if (!auth) return true;
  const rows = await auth.prisma.session.findMany({
    where: { userId: auth.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
      userAgent: true,
      ipAddress: true
    }
  });
  sendJson(res, 200, {
    sessions: rows.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      expiresAt: s.expiresAt,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      current: s.id === auth.session.id
    }))
  });
  return true;
}

async function handleDeleteSession(req, res, sessionId) {
  if (method(req) !== "DELETE") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  const auth = await requireAuth(req, res);
  if (!auth) return true;
  const row = await auth.prisma.session.findFirst({
    where: { id: sessionId, userId: auth.user.id, revokedAt: null }
  });
  if (!row) {
    sendJson(res, 404, { error: "not_found" });
    return true;
  }
  await revokeSession(auth.prisma, row.id);
  if (row.id === auth.session.id) clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
  return true;
}

async function handleDeleteAccount(req, res) {
  if (method(req) !== "DELETE") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  const auth = await requireAuth(req, res);
  if (!auth) return true;
  await auth.prisma.$transaction(async (tx) => {
    await tx.session.updateMany({
      where: { userId: auth.user.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    await tx.user.update({
      where: { id: auth.user.id },
      data: { status: "deleted", displayName: "Deleted", username: "deleted-" + auth.user.id.slice(0, 8) }
    });
    await tx.accountEvent.create({
      data: { userId: auth.user.id, eventType: "account_suspended", metadata: { reason: "user_delete" } }
    });
  });
  clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
  return true;
}

async function handleAuthApi(req, res, pathname) {
  try {
    if (pathname === "/api/v1/auth/guest") return await handleGuest(req, res);
    if (pathname === "/api/v1/auth/me") return await handleMe(req, res);
    if (pathname === "/api/v1/auth/logout") return await handleLogout(req, res);
    if (pathname === "/api/v1/auth/logout-all") return await handleLogoutAll(req, res);
    if (pathname === "/api/v1/auth/providers") return await handleProviders(req, res);

    if (pathname === "/api/v1/auth/google") return await startOAuth(req, res, "google", "login");
    if (pathname === "/api/v1/auth/google/callback") return await finishOAuth(req, res, "google");
    if (pathname === "/api/v1/auth/link/google") return await startOAuth(req, res, "google", "link");
    if (pathname === "/api/v1/auth/discord") return await startOAuth(req, res, "discord", "login");
    if (pathname === "/api/v1/auth/discord/callback") return await finishOAuth(req, res, "discord");
    if (pathname === "/api/v1/auth/link/discord") return await startOAuth(req, res, "discord", "link");

    if (pathname === "/api/v1/auth/register") return await handleRegister(req, res);
    if (pathname === "/api/v1/auth/login") return await handleLogin(req, res);
    if (pathname === "/api/v1/auth/verify-email") return await handleVerifyEmail(req, res);
    if (pathname === "/api/v1/auth/resend-verification") return await handleResendVerification(req, res);
    if (pathname === "/api/v1/auth/forgot-password") return await handleForgotPassword(req, res);
    if (pathname === "/api/v1/auth/reset-password") return await handleResetPassword(req, res);

    if (pathname === "/api/v1/account/profile") return await handleAccountProfile(req, res);
    if (pathname === "/api/v1/account/providers") return await handleAccountProviders(req, res);
    if (pathname === "/api/v1/account/link/email") return await handleLinkEmail(req, res);
    if (pathname === "/api/v1/account/sessions") return await handleAccountSessions(req, res);
    if (pathname === "/api/v1/account/delete") return await handleDeleteAccount(req, res);

    const unlink = pathname.match(/^\/api\/v1\/account\/unlink\/(google|discord|email)$/);
    if (unlink) return await handleUnlink(req, res, unlink[1]);
    const delSession = pathname.match(/^\/api\/v1\/account\/sessions\/([0-9a-f-]{36})$/i);
    if (delSession) return await handleDeleteSession(req, res, delSession[1]);

    return false;
  } catch (err) {
    console.error("[auth]", err);
    if (!res.headersSent) sendJson(res, 500, { error: "internal_error" });
    return true;
  }
}

module.exports = {
  handleAuthApi,
  googleConfigured,
  discordConfigured
};
