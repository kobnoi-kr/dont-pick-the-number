"use strict";

const crypto = require("crypto");

/**
 * Secure server-side dice 1–6.
 * Optional `rng` for tests: () => number in [0,1).
 */
function rollDice(rng) {
  if (typeof rng === "function") {
    const r = Number(rng());
    if (!Number.isFinite(r) || r < 0 || r >= 1) {
      const err = new Error("invalid_rng");
      err.code = "invalid_rng";
      throw err;
    }
    return 1 + Math.floor(r * 6);
  }
  return 1 + crypto.randomInt(0, 6);
}

module.exports = { rollDice };
