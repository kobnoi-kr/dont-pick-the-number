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

/** parity: "even" | "odd" | null — re-roll until matching (dice 1–6). */
function rollDiceParity(rng, parity) {
  const want = parity === "even" || parity === "odd" ? parity : null;
  if (!want) return rollDice(rng);
  for (let i = 0; i < 32; i++) {
    const d = rollDice(rng);
    if (want === "even" && d % 2 === 0) return d;
    if (want === "odd" && d % 2 === 1) return d;
  }
  return want === "even" ? 2 : 1;
}

module.exports = { rollDice, rollDiceParity };
