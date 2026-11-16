"use strict";

require("dotenv").config();
const { getPrisma, authEnabled } = require("../src/db");
const { ensureRole } = require("../src/auth/admin-bootstrap");

async function main() {
  const args = process.argv.slice(2);
  let role = "super_admin";
  const positional = [];
  for (const a of args) {
    if (a.startsWith("--role=")) role = a.slice(7);
    else if (a === "--admin") role = "admin";
    else if (a === "--super") role = "super_admin";
    else positional.push(a);
  }
  const key = positional[0];
  if (!key) {
    console.error("Usage: node scripts/make-admin.js [--role=admin|super_admin] <username|email|userId>");
    process.exit(1);
  }
  if (!["admin", "super_admin", "moderator"].includes(role)) {
    console.error("Invalid role:", role);
    process.exit(1);
  }
  if (!authEnabled()) {
    console.error("DATABASE_URL not set / auth disabled");
    process.exit(1);
  }

  const prisma = await getPrisma();
  const looksEmail = key.includes("@");
  const looksUuid = /^[0-9a-f-]{36}$/i.test(key);

  let user = null;
  if (looksUuid) {
    user = await prisma.user.findUnique({ where: { id: key } });
  } else if (looksEmail) {
    const acc = await prisma.authAccount.findFirst({
      where: { providerEmail: { equals: key, mode: "insensitive" } },
      include: { user: true }
    });
    user = acc && acc.user;
  } else {
    user = await prisma.user.findFirst({
      where: {
        OR: [{ username: key }, { displayName: key }],
        status: { not: "deleted" }
      }
    });
  }

  if (!user) {
    console.error("User not found:", key);
    console.error("Tip: link Google/Discord first, or put email in SUPER_ADMIN_EMAILS then login.");
    process.exit(1);
  }

  await ensureRole(prisma, user.id, role);
  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      authAccounts: true,
      userRoles: { include: { role: true } }
    }
  });
  console.log("Granted", role, "to", fresh.displayName, "(" + fresh.id + ")");
  console.log(
    "providers:",
    fresh.authAccounts.map((a) => a.provider + (a.providerEmail ? "<" + a.providerEmail + ">" : "")).join(", ") || "(none)"
  );
  console.log("roles:", fresh.userRoles.map((r) => r.role.name).join(", "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
