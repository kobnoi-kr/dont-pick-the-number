"use strict";

/** Defaults when game_catalog has no comingSoon override for that id. */
const DEFAULT_COMING_SOON = {
  imposter: true,
  race2048: true,
  cardmemory: true
};

async function loadGameCatalogFlags(prisma) {
  if (!prisma) return {};
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: "game_catalog" } });
    if (row && row.value && typeof row.value === "object") return row.value;
  } catch {
    /* ignore */
  }
  return {};
}

function isComingSoonCat(flags, cat) {
  const id = String(cat || "");
  if (!id) return false;
  const override = flags && flags[id];
  if (override && Object.prototype.hasOwnProperty.call(override, "comingSoon")) {
    return !!override.comingSoon;
  }
  return !!DEFAULT_COMING_SOON[id];
}

function rolesAreElevated(roles) {
  const set = new Set((roles || []).map((r) => String(r).toLowerCase()));
  return set.has("admin") || set.has("super_admin") || set.has("moderator");
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, reason: "coming_soon" }>}
 */
async function assertCatPlayable(prisma, cat, { roles, isAdmin } = {}) {
  const flags = await loadGameCatalogFlags(prisma);
  if (!isComingSoonCat(flags, cat)) return { ok: true };
  if (isAdmin || rolesAreElevated(roles)) return { ok: true };
  return { ok: false, reason: "coming_soon" };
}

module.exports = {
  DEFAULT_COMING_SOON,
  loadGameCatalogFlags,
  isComingSoonCat,
  rolesAreElevated,
  assertCatPlayable
};
