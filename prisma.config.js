require("dotenv/config");
const { defineConfig } = require("prisma/config");

/** @see https://pris.ly/prisma-config */
module.exports = defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.js"
  }
});
