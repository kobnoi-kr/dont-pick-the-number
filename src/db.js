"use strict";

let prisma = null;
let initError = null;

function authEnabled() {
  return !!(process.env.DATABASE_URL && process.env.AUTH_ENABLED !== "0");
}

async function getPrisma() {
  if (!authEnabled()) return null;
  if (prisma) return prisma;
  if (initError) throw initError;
  try {
    const { PrismaClient } = require("@prisma/client");
    prisma = new PrismaClient();
    await prisma.$connect();
    return prisma;
  } catch (err) {
    initError = err;
    throw err;
  }
}

async function disconnectDb() {
  if (!prisma) return;
  await prisma.$disconnect();
  prisma = null;
}

module.exports = { authEnabled, getPrisma, disconnectDb };
