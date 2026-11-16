"use strict";

require("dotenv").config();

const { spawn } = require("child_process");
const path = require("path");

async function prepareDb() {
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

prepareDb().finally(() => {
  require(path.join(__dirname, "..", "server.js"));
});
