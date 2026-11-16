"use strict";

require("dotenv").config();

const { spawn } = require("child_process");
const path = require("path");

async function ensureEmbeddedPg() {
  if (process.env.EMBEDDED_PG !== "1") return;
  const { startEmbeddedPostgres } = require("./embedded-pg");
  const { url } = await startEmbeddedPostgres();
  process.env.DATABASE_URL = url;
  console.log("DATABASE_URL ready (embedded Postgres)");
}

async function prepareDb() {
  await ensureEmbeddedPg();
  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL not set — Auth stays off, game still starts");
    return;
  }
  const run = (cmd, args) =>
    new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        stdio: "inherit",
        shell: process.platform === "win32",
        cwd: path.join(__dirname, "..")
      });
      child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(cmd + " exited " + code))));
    });
  try {
    console.log("Running prisma migrate deploy…");
    await run("npx", ["prisma", "migrate", "deploy"]);
    console.log("Seeding roles…");
    await run("node", ["prisma/seed.js"]);
  } catch (err) {
    console.error("DB prepare failed (continuing to start game):", err.message || err);
  }
}

prepareDb()
  .then(() => {
    require(path.join(__dirname, "..", "server.js"));
  })
  .catch((err) => {
    console.error("Startup failed:", err.message || err);
    process.exit(1);
  });
