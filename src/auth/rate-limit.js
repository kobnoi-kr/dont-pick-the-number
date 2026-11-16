"use strict";

const buckets = new Map();

function prune(now) {
  if (buckets.size < 2000) return;
  for (const [key, item] of buckets) {
    if (item.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Fixed-window rate limit.
 * @returns {{ ok: boolean, retryAfterSec: number }}
 */
function rateLimit(key, limit = 20, windowMs = 60 * 1000) {
  const now = Date.now();
  prune(now);
  const item = buckets.get(key);
  if (!item || item.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  item.count += 1;
  if (item.count > limit) {
    return { ok: false, retryAfterSec: Math.ceil((item.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}

module.exports = { rateLimit };
