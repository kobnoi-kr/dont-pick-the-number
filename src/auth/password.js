"use strict";

const argon2 = require("argon2");

const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
};

async function hashPassword(password) {
  return argon2.hash(String(password), OPTIONS);
}

async function verifyPassword(hash, password) {
  if (!hash || !password) return false;
  try {
    return await argon2.verify(hash, String(password));
  } catch {
    return false;
  }
}

function passwordIssues(password) {
  const p = String(password || "");
  const issues = [];
  if (p.length < 8) issues.push("too_short");
  if (p.length > 128) issues.push("too_long");
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) issues.push("weak");
  return issues;
}

module.exports = { hashPassword, verifyPassword, passwordIssues };
