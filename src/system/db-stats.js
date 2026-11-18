"use strict";

const DEFAULT_LIMIT_MB = 1024; // Render free Postgres = 1 GB

function asInt(v, fallback, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function fmtBytes(n) {
  const b = Math.max(0, Number(n) || 0);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function resolveLimitBytes(prisma) {
  const envMb = process.env.DB_SIZE_LIMIT_MB;
  if (envMb != null && String(envMb).trim() !== "") {
    return asInt(envMb, DEFAULT_LIMIT_MB, 64, 1024 * 1024) * 1024 * 1024;
  }
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: "db_size_limit_mb" } });
    const mb = asInt(row && row.value, DEFAULT_LIMIT_MB, 64, 1024 * 1024);
    return mb * 1024 * 1024;
  } catch {
    return DEFAULT_LIMIT_MB * 1024 * 1024;
  }
}

const DB_STATS_TTL_MS = 60 * 1000;
let dbStatsCache = null;
let dbStatsCacheAt = 0;
let dbStatsPromise = null;

/**
 * Database size + top tables for Admin Dashboard meter.
 * Uses Postgres catalog queries; fails soft if unavailable.
 * Cached briefly — overview ถูกเรียกบ่อยและ query นี้หนัก
 */
async function getDbStats(prisma) {
  const now = Date.now();
  if (dbStatsCache && now - dbStatsCacheAt < DB_STATS_TTL_MS) return dbStatsCache;
  if (dbStatsPromise) return dbStatsPromise;

  dbStatsPromise = (async () => {
    const limitBytes = await resolveLimitBytes(prisma);
    try {
      const sizeRows = await prisma.$queryRawUnsafe(`
        SELECT
          current_database() AS name,
          pg_database_size(current_database())::bigint AS bytes
      `);
      const size = sizeRows && sizeRows[0] ? sizeRows[0] : null;
      const usedBytes = Number(size && size.bytes != null ? size.bytes : 0) || 0;

      const tableRows = await prisma.$queryRawUnsafe(`
        SELECT
          n.nspname AS schema,
          c.relname AS name,
          pg_total_relation_size(c.oid)::bigint AS bytes
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r'
          AND n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND n.nspname NOT LIKE 'pg_toast%'
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 8
      `);

      const tables = (tableRows || []).map((t) => {
        const bytes = Number(t.bytes) || 0;
        return {
          schema: String(t.schema || "public"),
          name: String(t.name || ""),
          bytes,
          pretty: fmtBytes(bytes),
          pctOfDb: usedBytes > 0 ? Math.round((bytes / usedBytes) * 1000) / 10 : 0
        };
      });

      const pct = limitBytes > 0 ? Math.min(100, Math.round((usedBytes / limitBytes) * 1000) / 10) : 0;
      let level = "ok";
      if (pct >= 90) level = "critical";
      else if (pct >= 75) level = "warn";

      const result = {
        ok: true,
        database: size && size.name ? String(size.name) : null,
        usedBytes,
        usedPretty: fmtBytes(usedBytes),
        limitBytes,
        limitPretty: fmtBytes(limitBytes),
        pct,
        level,
        tables
      };
      dbStatsCache = result;
      dbStatsCacheAt = Date.now();
      return result;
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? String(err.message) : "db_stats_failed",
        usedBytes: 0,
        usedPretty: "—",
        limitBytes,
        limitPretty: fmtBytes(limitBytes),
        pct: 0,
        level: "unknown",
        tables: []
      };
    } finally {
      dbStatsPromise = null;
    }
  })();

  return dbStatsPromise;
}

module.exports = {
  getDbStats,
  fmtBytes,
  DEFAULT_LIMIT_MB
};
