"use strict";

const { createSession, revokeSession, sessionResponse } = require("./sessions");
const { setSessionCookie, clearSessionCookie, readSessionToken } = require("./cookies");
const { findValidSession } = require("./sessions");
const { clientIp } = require("./http");

async function rotateAndIssueSession(prisma, req, res, user) {
  const oldToken = readSessionToken(req);
  if (oldToken) {
    const old = await findValidSession(prisma, oldToken);
    if (old) await revokeSession(prisma, old.id);
  }
  const { session, token, ttlSec } = await createSession(prisma, user, {
    userAgent: String(req.headers["user-agent"] || "").slice(0, 512) || null,
    ipAddress: clientIp(req) || null
  });
  setSessionCookie(res, token, ttlSec);
  return sessionResponse(session, user);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store" });
  res.end();
}

module.exports = { rotateAndIssueSession, redirect, clearSessionCookie };
