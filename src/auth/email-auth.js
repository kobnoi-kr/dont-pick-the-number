"use strict";

const { z } = require("zod");
const { randomToken, hashToken } = require("./crypto");
const { hashPassword, verifyPassword, passwordIssues } = require("./password");
const { sendMail } = require("./mail");
const { publicBaseUrl } = require("./oauth-google");
const { resolveProviderLogin, linkProviderToUser } = require("./upgrade");
const { getUserWithRoles } = require("./users");

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(8).max(128)
});

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function createEmailVerification(prisma, userId) {
  const token = randomToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.emailVerification.create({
    data: { userId, tokenHash, expiresAt }
  });
  return token;
}

async function sendVerificationEmail(req, email, token) {
  const link = publicBaseUrl(req) + "/verify-email.html?token=" + encodeURIComponent(token);
  await sendMail({
    to: email,
    subject: "ยืนยันอีเมล NUMVERSE",
    text: "ยืนยันอีเมลด้วยลิงก์นี้ (หมดอายุใน 24 ชม.):\n" + link,
    html: "<p>ยืนยันอีเมล NUMVERSE</p><p><a href=\"" + link + "\">ยืนยันอีเมล</a></p>"
  });
  return link;
}

async function registerWithEmail(prisma, req, { email, password, guestUserId }) {
  const parsed = credentialsSchema.safeParse({ email, password });
  if (!parsed.success) {
    const err = new Error("invalid_input");
    err.code = "invalid_input";
    throw err;
  }
  const issues = passwordIssues(parsed.data.password);
  if (issues.length) {
    const err = new Error("weak_password");
    err.code = "weak_password";
    err.issues = issues;
    throw err;
  }

  const emailNorm = parsed.data.email;
  const existing = await prisma.authAccount.findUnique({
    where: {
      provider_providerUserId: { provider: "email", providerUserId: emailNorm }
    }
  });
  if (existing) {
    const err = new Error("email_taken");
    err.code = "email_taken";
    throw err;
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const result = await resolveProviderLogin(prisma, {
    provider: "email",
    providerUserId: emailNorm,
    providerEmail: emailNorm,
    passwordHash,
    displayName: emailNorm.split("@")[0],
    markEmailVerified: false,
    guestUserId
  });

  const token = await createEmailVerification(prisma, result.user.id);
  const previewLink = await sendVerificationEmail(req, emailNorm, token);
  return { user: result.user, upgraded: result.upgraded, previewLink };
}

async function loginWithEmail(prisma, { email, password }) {
  const parsed = credentialsSchema.safeParse({ email, password });
  if (!parsed.success) {
    const err = new Error("invalid_credentials");
    err.code = "invalid_credentials";
    throw err;
  }
  const emailNorm = parsed.data.email;
  const account = await prisma.authAccount.findUnique({
    where: {
      provider_providerUserId: { provider: "email", providerUserId: emailNorm }
    },
    include: { user: { include: { userRoles: { include: { role: true } } } } }
  });

  // Constant-ish failure path (precomputed argon2id hash)
  const dummy =
    "$argon2id$v=19$m=19456,t=2,p=1$+J50h0jilNOfC2U27jkyBw$FXkxf1JNWbmx3Af5aXEiaSbA5vo/M0p2xInNryqtlE4";
  const hash = account && account.passwordHash ? account.passwordHash : dummy;
  const ok = await verifyPassword(hash, parsed.data.password);
  if (!account || !ok) {
    const err = new Error("invalid_credentials");
    err.code = "invalid_credentials";
    throw err;
  }
  if (account.user.status !== "active") {
    const err = new Error("account_blocked");
    err.code = "account_blocked";
    throw err;
  }
  if (!account.user.emailVerifiedAt) {
    const err = new Error("email_unverified");
    err.code = "email_unverified";
    throw err;
  }
  await prisma.user.update({
    where: { id: account.userId },
    data: { lastLoginAt: new Date() }
  });
  return getUserWithRoles(prisma, account.userId);
}

async function verifyEmailToken(prisma, rawToken) {
  if (!rawToken) {
    const err = new Error("invalid_token");
    err.code = "invalid_token";
    throw err;
  }
  const tokenHash = hashToken(rawToken);
  const row = await prisma.emailVerification.findUnique({ where: { tokenHash } });
  if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
    const err = new Error("invalid_token");
    err.code = "invalid_token";
    throw err;
  }
  await prisma.$transaction(async (tx) => {
    await tx.emailVerification.update({
      where: { id: row.id },
      data: { usedAt: new Date() }
    });
    await tx.user.update({
      where: { id: row.userId },
      data: { emailVerifiedAt: new Date() }
    });
  });
  return getUserWithRoles(prisma, row.userId);
}

async function resendVerification(prisma, req, email) {
  const emailNorm = normalizeEmail(email);
  const account = await prisma.authAccount.findUnique({
    where: { provider_providerUserId: { provider: "email", providerUserId: emailNorm } },
    include: { user: true }
  });
  // Avoid enumeration
  if (!account || account.user.emailVerifiedAt) {
    return { ok: true };
  }
  const token = await createEmailVerification(prisma, account.userId);
  await sendVerificationEmail(req, emailNorm, token);
  return { ok: true };
}

async function requestPasswordReset(prisma, req, email) {
  const emailNorm = normalizeEmail(email);
  const account = await prisma.authAccount.findUnique({
    where: { provider_providerUserId: { provider: "email", providerUserId: emailNorm } }
  });
  if (!account) return { ok: true };

  const token = randomToken(32);
  const tokenHash = hashToken(token);
  await prisma.passwordReset.create({
    data: {
      userId: account.userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    }
  });
  const link = publicBaseUrl(req) + "/reset-password.html?token=" + encodeURIComponent(token);
  await sendMail({
    to: emailNorm,
    subject: "รีเซ็ตรหัสผ่าน NUMVERSE",
    text: "ตั้งรหัสผ่านใหม่ (หมดอายุใน 1 ชม.):\n" + link,
    html: "<p>ตั้งรหัสผ่านใหม่</p><p><a href=\"" + link + "\">รีเซ็ตรหัสผ่าน</a></p>"
  });
  return { ok: true, previewLink: process.env.NODE_ENV === "production" ? undefined : link };
}

async function resetPassword(prisma, { token, password }) {
  const issues = passwordIssues(password);
  if (issues.length) {
    const err = new Error("weak_password");
    err.code = "weak_password";
    err.issues = issues;
    throw err;
  }
  const tokenHash = hashToken(token || "");
  const row = await prisma.passwordReset.findUnique({ where: { tokenHash } });
  if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
    const err = new Error("invalid_token");
    err.code = "invalid_token";
    throw err;
  }
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    await tx.passwordReset.update({
      where: { id: row.id },
      data: { usedAt: new Date() }
    });
    await tx.authAccount.updateMany({
      where: { userId: row.userId, provider: "email" },
      data: { passwordHash }
    });
    await tx.accountEvent.create({
      data: {
        userId: row.userId,
        eventType: "password_changed",
        metadata: { via: "reset" }
      }
    });
    await tx.session.updateMany({
      where: { userId: row.userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  });
  return { ok: true };
}

async function linkEmailToUser(prisma, req, userId, { email, password }) {
  const parsed = credentialsSchema.safeParse({ email, password });
  if (!parsed.success) {
    const err = new Error("invalid_input");
    err.code = "invalid_input";
    throw err;
  }
  const issues = passwordIssues(parsed.data.password);
  if (issues.length) {
    const err = new Error("weak_password");
    err.code = "weak_password";
    err.issues = issues;
    throw err;
  }
  const emailNorm = parsed.data.email;
  const passwordHash = await hashPassword(parsed.data.password);
  const result = await linkProviderToUser(prisma, {
    userId,
    provider: "email",
    providerUserId: emailNorm,
    providerEmail: emailNorm,
    passwordHash,
    markEmailVerified: false,
    eventType: "provider_linked",
    metadata: {}
  });
  // Clear previous verified state when linking new email as unverified
  await prisma.user.update({
    where: { id: userId },
    data: { emailVerifiedAt: null }
  });
  const token = await createEmailVerification(prisma, userId);
  await sendVerificationEmail(req, emailNorm, token);
  return { user: await getUserWithRoles(prisma, userId), upgraded: result.upgraded };
}

module.exports = {
  registerWithEmail,
  loginWithEmail,
  verifyEmailToken,
  resendVerification,
  requestPasswordReset,
  resetPassword,
  linkEmailToUser,
  normalizeEmail
};
