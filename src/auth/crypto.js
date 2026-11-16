"use strict";

const crypto = require("crypto");

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function guestUsername() {
  const n = crypto.randomInt(1000, 9999);
  return "Player" + n;
}

module.exports = { randomToken, hashToken, guestUsername };
