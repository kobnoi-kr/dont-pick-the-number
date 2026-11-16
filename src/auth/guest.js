"use strict";

const { getPrisma } = require("../db");
const { guestUsername } = require("./crypto");
const { ensurePlayerRole, createSession, loadSessionUser, publicUser } = require("./session");

async function createGuest(meta = {}) {
  const db = await getPrisma();
  const username = guestUsername();
  const result = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username,
        displayName: username,
        accountType: "guest",
        status: "active",
        settings: { create: { language: "th", theme: "system" } },
        accountEvents: {
          create: { eventType: "guest_created", metadata: { source: "web" } }
        }
      },
      include: { userRoles: { include: { role: true } } }
    });
    await ensurePlayerRole(tx, user.id);
    const full = await tx.user.findUnique({
      where: { id: user.id },
      include: { userRoles: { include: { role: true } }, settings: true }
    });
    return full;
  });

  const { token, session, maxAgeSec } = await createSession(result, meta);
  return {
    user: publicUser(result),
    token,
    sessionId: session.id,
    maxAgeSec,
    created: true
  };
}

async function ensureGuestSession(existingToken, meta = {}) {
  if (existingToken) {
    const loaded = await loadSessionUser(existingToken);
    if (loaded) {
      return {
        user: publicUser(loaded.user),
        token: existingToken,
        sessionId: loaded.session.id,
        maxAgeSec: Math.max(0, Math.floor((loaded.session.expiresAt.getTime() - Date.now()) / 1000)),
        created: false
      };
    }
  }
  return createGuest(meta);
}

module.exports = { createGuest, ensureGuestSession };
