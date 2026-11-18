"use strict";
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { awardShopPts } = require("../src/dashboard/shop-pts");

async function main() {
  const p = new PrismaClient();
  try {
    const u = await p.user.findFirst({
      where: { displayName: { equals: "Kim", mode: "insensitive" } }
    });
    if (!u) {
      console.log("no Kim user");
      return;
    }
    const r = await awardShopPts(p, u.id, 500, { reason: "bootstrap" });
    console.log(u.displayName, u.accountType, r);
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
