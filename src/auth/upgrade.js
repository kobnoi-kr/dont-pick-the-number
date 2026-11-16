"use strict";

const { ensurePlayerRole, getUserWithRoles } = require("./users");

/**
 * Link a provider to an existing user (guest upgrade or registered link).
 * Keeps the same user id. Runs in a transaction.
 */
async function linkProviderToUser(prisma, {
  userId,
  provider,
  providerUserId,
  providerEmail,
  passwordHash,
  markEmailVerified,
  eventType,
  metadata
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.authAccount.findUnique({
      where: {
        provider_providerUserId: { provider, providerUserId }
      }
    });
    if (existing && existing.userId !== userId) {
      const err = new Error("provider_already_linked");
      err.code = "provider_already_linked";
      throw err;
    }
    if (existing && existing.userId === userId) {
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { userRoles: { include: { role: true } } }
      });
      return { user, created: false };
    }

    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) {
      const err = new Error("user_not_found");
      err.code = "user_not_found";
      throw err;
    }
    if (user.status === "banned" || user.status === "suspended" || user.status === "deleted") {
      const err = new Error("account_blocked");
      err.code = "account_blocked";
      throw err;
    }

    await tx.authAccount.create({
      data: {
        userId,
        provider,
        providerUserId,
        providerEmail: providerEmail || null,
        passwordHash: passwordHash || null
      }
    });

    const role = await ensurePlayerRole(prisma, tx);
    await tx.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { userId, roleId: role.id },
      update: {}
    });

    const wasGuest = user.accountType === "guest";
    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        accountType: "registered",
        emailVerifiedAt: markEmailVerified
          ? user.emailVerifiedAt || new Date()
          : user.emailVerifiedAt,
        lastLoginAt: new Date(),
        avatarUrl: metadata && metadata.avatarUrl ? metadata.avatarUrl : undefined,
        displayName:
          metadata && metadata.displayName && user.accountType === "guest"
            ? String(metadata.displayName).slice(0, 64)
            : undefined
      },
      include: { userRoles: { include: { role: true } } }
    });

    await tx.accountEvent.create({
      data: {
        userId,
        eventType: eventType || (wasGuest ? "account_upgraded" : "provider_linked"),
        metadata: Object.assign({ provider, providerUserId }, metadata || {})
      }
    });

    return { user: updated, created: true, upgraded: wasGuest };
  });
}

async function createRegisteredWithProvider(prisma, {
  provider,
  providerUserId,
  providerEmail,
  passwordHash,
  displayName,
  avatarUrl,
  markEmailVerified
}) {
  return prisma.$transaction(async (tx) => {
    const clash = await tx.authAccount.findUnique({
      where: { provider_providerUserId: { provider, providerUserId } }
    });
    if (clash) {
      const err = new Error("provider_already_linked");
      err.code = "provider_already_linked";
      throw err;
    }

    const role = await ensurePlayerRole(prisma, tx);
    const baseName = (displayName || "Player").toString().replace(/[^\w\u0E00-\u0E7F .-]/g, "").slice(0, 24) || "Player";
    const username = baseName.slice(0, 48);

    const user = await tx.user.create({
      data: {
        username,
        displayName: baseName.slice(0, 64),
        avatarUrl: avatarUrl || null,
        accountType: "registered",
        status: "active",
        emailVerifiedAt: markEmailVerified ? new Date() : null,
        lastLoginAt: new Date(),
        userRoles: { create: { roleId: role.id } },
        settings: { create: {} },
        authAccounts: {
          create: {
            provider,
            providerUserId,
            providerEmail: providerEmail || null,
            passwordHash: passwordHash || null
          }
        },
        accountEvents: {
          create: {
            eventType: "account_upgraded",
            metadata: { provider, providerUserId, created: true }
          }
        }
      },
      include: { userRoles: { include: { role: true } } }
    });
    return { user, created: true, upgraded: false };
  });
}

/**
 * Resolve login-or-upgrade for OAuth / email.
 * Prefer guest session user id when upgrading.
 */
async function resolveProviderLogin(prisma, {
  provider,
  providerUserId,
  providerEmail,
  passwordHash,
  displayName,
  avatarUrl,
  markEmailVerified,
  guestUserId
}) {
  const existing = await prisma.authAccount.findUnique({
    where: { provider_providerUserId: { provider, providerUserId } },
    include: {
      user: { include: { userRoles: { include: { role: true } } } }
    }
  });

  if (existing) {
    if (existing.user.status !== "active") {
      const err = new Error("account_blocked");
      err.code = "account_blocked";
      throw err;
    }
    await prisma.user.update({
      where: { id: existing.userId },
      data: { lastLoginAt: new Date() }
    });
    const user = await getUserWithRoles(prisma, existing.userId);
    return { user, linked: false, upgraded: false };
  }

  if (guestUserId) {
    const guest = await prisma.user.findUnique({ where: { id: guestUserId } });
    if (guest && guest.accountType === "guest" && guest.status === "active") {
      const result = await linkProviderToUser(prisma, {
        userId: guestUserId,
        provider,
        providerUserId,
        providerEmail,
        passwordHash,
        markEmailVerified,
        eventType: "account_upgraded",
        metadata: { displayName, avatarUrl }
      });
      return { user: result.user, linked: true, upgraded: true };
    }
  }

  const created = await createRegisteredWithProvider(prisma, {
    provider,
    providerUserId,
    providerEmail,
    passwordHash,
    displayName,
    avatarUrl,
    markEmailVerified
  });
  return { user: created.user, linked: false, upgraded: false };
}

async function unlinkProvider(prisma, userId, provider) {
  return prisma.$transaction(async (tx) => {
    const accounts = await tx.authAccount.findMany({ where: { userId } });
    if (accounts.length <= 1) {
      const err = new Error("last_provider");
      err.code = "last_provider";
      throw err;
    }
    const target = accounts.find((a) => a.provider === provider);
    if (!target) {
      const err = new Error("provider_not_linked");
      err.code = "provider_not_linked";
      throw err;
    }
    await tx.authAccount.delete({ where: { id: target.id } });
    await tx.accountEvent.create({
      data: {
        userId,
        eventType: "provider_unlinked",
        metadata: { provider }
      }
    });
    return true;
  });
}

module.exports = {
  linkProviderToUser,
  createRegisteredWithProvider,
  resolveProviderLogin,
  unlinkProvider
};
