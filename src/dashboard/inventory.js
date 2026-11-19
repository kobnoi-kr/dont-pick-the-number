"use strict";

const { sendJson, readJsonBody, clientIp } = require("../auth/http");
const { requireAuth } = require("../auth/middleware");
const { getPrisma, authEnabled } = require("../db");

const ANGEL_ITEM_ID = "item.angel";
const MAX_ITEM_QUANTITY = 99;

const CATALOG_ITEMS = [
  {
    id: ANGEL_ITEM_ID,
    name: "การ์ดนางฟ้า",
    description: "กันแพ้ 1 ครั้งต่อเกม",
    details:
      "หาเลขลับ: เลขลับเหลือ ≤1 แล้วโดน → เสมอ · เลขลับเหลือ >1 และผู้เล่นอื่น >2 → ชุบเล่นต่อ\n" +
      "วงล้อ: เลือกเลข ≤1 แล้วโดน → เสมอ · เลือกเลข >1 และผู้เล่น >2 → ชุบเล่นต่อ\n" +
      "งูและบันได: กันไหลลงงู 3 ครั้ง",
    shopPrice: 399,
    imageUrl: "/images/items/angel-card.png",
    effect: "angel_guard"
  }
];

const CATALOG_BY_ID = Object.fromEntries(CATALOG_ITEMS.map((it) => [it.id, it]));

const INVENTORY_TTL_MS = 15 * 60 * 1000;
let catalogEnsuredAt = 0;
let catalogEnsurePromise = null;

function method(req) {
  return String(req.method || "GET").toUpperCase();
}

function publicItem(item, quantity) {
  if (!item) return null;
  const catalog = CATALOG_BY_ID[item.id] || null;
  const out = {
    id: item.id,
    kind: "helper",
    name: item.name,
    description: (catalog && catalog.description) || item.description || null,
    details: (catalog && catalog.details) || item.details || null,
    shopPrice: item.shopPrice == null ? null : item.shopPrice,
    imageUrl: item.imageUrl || null,
    effect: item.effect || null
  };
  if (quantity != null) out.quantity = Math.max(0, Number(quantity) || 0);
  return out;
}

async function ensureInventoryCatalog(prisma, opts) {
  const force = !!(opts && opts.force);
  if (!prisma || !prisma.inventoryItem) return;
  const now = Date.now();
  if (!force && catalogEnsuredAt && now - catalogEnsuredAt < INVENTORY_TTL_MS) return;
  if (!force && catalogEnsurePromise) return catalogEnsurePromise;

  catalogEnsurePromise = (async () => {
    try {
      await Promise.all(
        CATALOG_ITEMS.map((item) =>
          prisma.inventoryItem.upsert({
            where: { id: item.id },
            update: {
              name: item.name,
              description: item.description,
              shopPrice: item.shopPrice,
              imageUrl: item.imageUrl,
              effect: item.effect
            },
            create: {
              id: item.id,
              name: item.name,
              description: item.description,
              shopPrice: item.shopPrice,
              imageUrl: item.imageUrl,
              effect: item.effect
            }
          })
        )
      );
      catalogEnsuredAt = Date.now();
    } finally {
      catalogEnsurePromise = null;
    }
  })();
  return catalogEnsurePromise;
}

/** Items currently listed for sale (shopPrice not null). */
async function listShopItems(prisma) {
  await ensureInventoryCatalog(prisma);
  const rows = await prisma.inventoryItem.findMany({
    where: { shopPrice: { not: null } },
    orderBy: [{ shopPrice: "asc" }, { name: "asc" }]
  });
  return rows.map((row) => publicItem(row));
}

/** Full catalog for admin gift (includes unsold helpers). */
async function listCatalogItems(prisma) {
  await ensureInventoryCatalog(prisma);
  const rows = await prisma.inventoryItem.findMany({
    orderBy: [{ name: "asc" }]
  });
  return rows.map((row) => publicItem(row));
}

/**
 * Admin grant: add quantity (clamped to MAX_ITEM_QUANTITY).
 * Returns { item, quantity, added }.
 */
async function grantItem(prisma, userId, itemId, quantity) {
  await ensureInventoryCatalog(prisma);
  const id = String(itemId || "").trim();
  const add = Math.floor(Number(quantity) || 0);
  if (!id || !Number.isFinite(add) || add < 1) {
    const err = new Error("invalid_quantity");
    err.code = "invalid_quantity";
    throw err;
  }
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item) {
    const err = new Error("item_not_found");
    err.code = "item_not_found";
    throw err;
  }
  const current = await prisma.userInventoryItem.findUnique({
    where: { userId_itemId: { userId, itemId: id } },
    select: { quantity: true }
  });
  const before = current ? current.quantity : 0;
  if (before >= MAX_ITEM_QUANTITY) {
    const err = new Error("max_quantity");
    err.code = "max_quantity";
    throw err;
  }
  const next = Math.min(MAX_ITEM_QUANTITY, before + add);
  const added = next - before;
  const row = await prisma.userInventoryItem.upsert({
    where: { userId_itemId: { userId, itemId: id } },
    create: { userId, itemId: id, quantity: next },
    update: { quantity: next }
  });
  return { item: publicItem(item, row.quantity), quantity: row.quantity, added };
}

/**
 * Admin revoke: remove up to `quantity` units.
 * Returns { item, quantity, removed } or throws not_owned.
 */
async function revokeItem(prisma, userId, itemId, quantity) {
  const id = String(itemId || "").trim();
  const want = Math.floor(Number(quantity) || 0);
  if (!id || !Number.isFinite(want) || want < 1) {
    const err = new Error("invalid_quantity");
    err.code = "invalid_quantity";
    throw err;
  }
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item) {
    const err = new Error("item_not_found");
    err.code = "item_not_found";
    throw err;
  }
  const current = await prisma.userInventoryItem.findUnique({
    where: { userId_itemId: { userId, itemId: id } },
    select: { quantity: true }
  });
  if (!current || current.quantity < 1) {
    const err = new Error("not_owned");
    err.code = "not_owned";
    throw err;
  }
  const removed = Math.min(want, current.quantity);
  const next = current.quantity - removed;
  if (next <= 0) {
    await prisma.userInventoryItem.delete({
      where: { userId_itemId: { userId, itemId: id } }
    });
    return { item: publicItem(item, 0), quantity: 0, removed };
  }
  const row = await prisma.userInventoryItem.update({
    where: { userId_itemId: { userId, itemId: id } },
    data: { quantity: next }
  });
  return { item: publicItem(item, row.quantity), quantity: row.quantity, removed };
}

async function loadUserInventory(prisma, userId) {
  await ensureInventoryCatalog(prisma);
  const rows = await prisma.userInventoryItem.findMany({
    where: { userId, quantity: { gt: 0 } },
    include: { item: true },
    orderBy: { updatedAt: "desc" }
  });
  const items = rows.filter((row) => row.item).map((row) => publicItem(row.item, row.quantity));
  const quantities = {};
  for (const it of items) quantities[it.id] = it.quantity;
  return { items, quantities };
}

async function getItemQuantity(prisma, userId, itemId) {
  const row = await prisma.userInventoryItem.findUnique({
    where: { userId_itemId: { userId, itemId } },
    select: { quantity: true }
  });
  return row ? row.quantity : 0;
}

/**
 * Pay shopPts and add 1 to quantity.
 * Throws Error with .code: item_not_found | not_for_sale | invalid_price |
 * insufficient_pts (.shopPts) | max_quantity | user_not_found
 */
async function buyItem(prisma, userId, itemId) {
  await ensureInventoryCatalog(prisma);
  const id = String(itemId || "").trim();
  const item = id ? await prisma.inventoryItem.findUnique({ where: { id } }) : null;
  if (!item) {
    const err = new Error("item_not_found");
    err.code = "item_not_found";
    throw err;
  }
  if (item.shopPrice == null) {
    const err = new Error("not_for_sale");
    err.code = "not_for_sale";
    throw err;
  }
  const price = Number(item.shopPrice);
  if (!Number.isFinite(price) || price < 0 || Math.floor(price) !== price) {
    const err = new Error("invalid_price");
    err.code = "invalid_price";
    throw err;
  }

  return prisma.$transaction(async (tx) => {
    const current = await tx.userInventoryItem.findUnique({
      where: { userId_itemId: { userId, itemId: id } },
      select: { quantity: true }
    });
    if (current && current.quantity >= MAX_ITEM_QUANTITY) {
      const err = new Error("max_quantity");
      err.code = "max_quantity";
      throw err;
    }
    // Guarded decrement so concurrent buys cannot overdraw pts.
    const paid = await tx.user.updateMany({
      where: { id: userId, shopPts: { gte: price } },
      data: { shopPts: { decrement: price } }
    });
    if (paid.count !== 1) {
      const me = await tx.user.findUnique({ where: { id: userId }, select: { shopPts: true } });
      const err = new Error(me ? "insufficient_pts" : "user_not_found");
      err.code = me ? "insufficient_pts" : "user_not_found";
      err.shopPts = me && me.shopPts != null ? me.shopPts : 0;
      throw err;
    }
    const row = await tx.userInventoryItem.upsert({
      where: { userId_itemId: { userId, itemId: id } },
      create: { userId, itemId: id, quantity: 1 },
      update: { quantity: { increment: 1 } }
    });
    const user = await tx.user.findUnique({ where: { id: userId }, select: { shopPts: true } });
    return {
      item: publicItem(item, row.quantity),
      quantity: row.quantity,
      shopPts: user && user.shopPts != null ? user.shopPts : 0,
      spent: price
    };
  });
}

/**
 * Consume 1 unit if owned. Atomic: never goes below 0.
 * Returns { ok: true, quantity } or { ok: false, quantity: 0 }.
 */
async function consumeItem(prisma, userId, itemId) {
  const id = String(itemId || "").trim();
  if (!prisma || !userId || !id) return { ok: false, quantity: 0 };
  const res = await prisma.userInventoryItem.updateMany({
    where: { userId, itemId: id, quantity: { gte: 1 } },
    data: { quantity: { decrement: 1 } }
  });
  if (res.count !== 1) return { ok: false, quantity: 0 };
  const quantity = await getItemQuantity(prisma, userId, id);
  return { ok: true, quantity };
}

async function handleInventoryApi(req, res, pathname) {
  if (!String(pathname || "").startsWith("/api/v1/inventory")) return false;
  if (!authEnabled()) {
    sendJson(res, 503, { error: "auth_disabled" });
    return true;
  }

  if (pathname === "/api/v1/inventory/catalog") {
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const prisma = await getPrisma();
    if (!prisma) {
      sendJson(res, 503, { error: "db_unavailable" });
      return true;
    }
    sendJson(res, 200, { items: await listShopItems(prisma) });
    return true;
  }

  if (pathname === "/api/v1/inventory/me") {
    if (method(req) !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const auth = await requireAuth(req, res);
    if (!auth) return true;
    if (auth.user.accountType !== "registered") {
      sendJson(res, 403, { error: "registered_required" });
      return true;
    }
    const data = await loadUserInventory(auth.prisma, auth.user.id);
    sendJson(res, 200, data);
    return true;
  }

  if (pathname === "/api/v1/inventory/buy") {
    if (method(req) !== "POST") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return true;
    }
    const auth = await requireAuth(req, res);
    if (!auth) return true;
    if (auth.user.accountType === "guest") {
      sendJson(res, 403, { error: "registered_required" });
      return true;
    }
    const { loadShopPtsConfig } = require("./shop-pts");
    const ptsCfg = await loadShopPtsConfig(auth.prisma);
    if (!ptsCfg.enabled) {
      sendJson(res, 403, { error: "shop_disabled" });
      return true;
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "invalid_json" });
      return true;
    }
    const itemId = String((body && body.itemId) || "").trim();
    if (!itemId) {
      sendJson(res, 400, { error: "invalid_input" });
      return true;
    }
    try {
      const result = await buyItem(auth.prisma, auth.user.id, itemId);
      sendJson(res, 200, { ok: true, ...result });
    } catch (err) {
      const code = err && err.code;
      if (code === "insufficient_pts") {
        sendJson(res, 400, { error: "insufficient_pts", shopPts: err.shopPts || 0 });
      } else if (code === "item_not_found" || code === "not_for_sale") {
        sendJson(res, 404, { error: code === "item_not_found" ? "not_found" : "not_for_sale" });
      } else if (code === "max_quantity") {
        sendJson(res, 409, { error: "max_quantity", max: MAX_ITEM_QUANTITY });
      } else if (code === "invalid_price" || code === "user_not_found") {
        sendJson(res, code === "user_not_found" ? 404 : 400, { error: code });
      } else {
        console.warn("[inventory] buy failed", err && err.message);
        sendJson(res, 500, { error: "buy_failed" });
      }
    }
    return true;
  }

  sendJson(res, 404, { error: "not_found" });
  return true;
}

async function resolveGiftTarget(prisma, body) {
  const userId = String((body && body.userId) || "").trim();
  const username = String((body && body.username) || "").trim();
  if (userId) return prisma.user.findUnique({ where: { id: userId } });
  if (username) {
    return prisma.user.findFirst({
      where: {
        username: { equals: username, mode: "insensitive" },
        status: { not: "deleted" }
      }
    });
  }
  return null;
}

function canGiftInventory(user, userHasPermission) {
  return userHasPermission(user, "cosmetics.gift") || userHasPermission(user, "users.ban");
}

async function handleAdminInventoryApi(req, res, pathname) {
  if (!String(pathname || "").startsWith("/api/v1/admin/inventory")) return false;
  if (!authEnabled()) {
    sendJson(res, 503, { error: "auth_disabled" });
    return true;
  }
  const { requireAdmin, userHasPermission } = require("../auth/middleware");
  const { writeAdminLog } = require("../admin/audit");
  const { getGameApi } = require("./bridge");
  const prisma = await getPrisma();
  if (!prisma) {
    sendJson(res, 503, { error: "db_unavailable" });
    return true;
  }

  if (pathname === "/api/v1/admin/inventory" && method(req) === "GET") {
    const auth = await requireAdmin(req, res);
    if (!auth) return true;
    if (!canGiftInventory(auth.user, userHasPermission)) {
      sendJson(res, 403, { error: "permission_denied", permission: "cosmetics.gift" });
      return true;
    }
    sendJson(res, 200, { items: await listCatalogItems(prisma) });
    return true;
  }

  if (pathname === "/api/v1/admin/inventory/owned" && method(req) === "GET") {
    const auth = await requireAdmin(req, res);
    if (!auth) return true;
    if (!canGiftInventory(auth.user, userHasPermission)) {
      sendJson(res, 403, { error: "permission_denied", permission: "cosmetics.gift" });
      return true;
    }
    const url = new URL(req.url || "/", "http://localhost");
    const userId = String(url.searchParams.get("userId") || "").trim();
    if (!userId) {
      sendJson(res, 400, { error: "invalid_input" });
      return true;
    }
    const data = await loadUserInventory(prisma, userId);
    sendJson(res, 200, data);
    return true;
  }

  if (pathname === "/api/v1/admin/inventory/gift" && method(req) === "POST") {
    const auth = await requireAdmin(req, res);
    if (!auth) return true;
    if (!canGiftInventory(auth.user, userHasPermission)) {
      sendJson(res, 403, { error: "permission_denied", permission: "cosmetics.gift" });
      return true;
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "invalid_json" });
      return true;
    }
    const itemId = String((body && body.itemId) || "").trim();
    const quantity = Math.floor(Number(body && body.quantity) || 1);
    if (!itemId) {
      sendJson(res, 400, { error: "invalid_input" });
      return true;
    }
    const target = await resolveGiftTarget(prisma, body || {});
    if (!target || target.status === "deleted") {
      sendJson(res, 404, { error: "user_not_found" });
      return true;
    }
    if (target.accountType !== "registered") {
      sendJson(res, 400, { error: "registered_required" });
      return true;
    }
    const note = String((body && body.note) || "").trim().slice(0, 200);
    let result;
    try {
      result = await grantItem(prisma, target.id, itemId, quantity);
    } catch (err) {
      const code = err && err.code;
      if (code === "item_not_found") {
        sendJson(res, 404, { error: "item_not_found" });
        return true;
      }
      if (code === "max_quantity") {
        sendJson(res, 409, { error: "max_quantity", max: MAX_ITEM_QUANTITY });
        return true;
      }
      if (code === "invalid_quantity") {
        sendJson(res, 400, { error: "invalid_quantity" });
        return true;
      }
      throw err;
    }
    const title = "ได้รับไอเทมจากแอดมิน";
    const bodyText =
      `แอดมินมอบ「${result.item.name}」×${result.added} ให้คุณ` +
      ` (ในกระเป๋าตอนนี้ ×${result.quantity})`;
    await prisma.notification.create({
      data: {
        userId: target.id,
        type: "system_grant",
        title,
        body: bodyText,
        payload: {
          kind: "admin_inventory_gift",
          fullBody:
            bodyText +
            (note ? "\n\nข้อความจากแอดมิน: " + note : "") +
            "\n\nเปิดเมนู กระเป๋า เพื่อดูไอเทม",
          itemId: result.item.id,
          itemName: result.item.name,
          added: result.added,
          quantity: result.quantity,
          note: note || null,
          href: "/app#inventory"
        }
      }
    });
    const gameApi = getGameApi();
    if (gameApi && typeof gameApi.notifyUser === "function") {
      try {
        gameApi.notifyUser(target.id, { type: "system_grant" });
      } catch {
        /* ignore */
      }
    }
    await writeAdminLog(prisma, {
      adminId: auth.user.id,
      action: "inventory.gift",
      targetId: target.id,
      metadata: {
        itemId: result.item.id,
        name: result.item.name,
        added: result.added,
        quantity: result.quantity,
        note: note || null
      },
      ipAddress: clientIp(req)
    });
    sendJson(res, 200, {
      ok: true,
      item: result.item,
      added: result.added,
      quantity: result.quantity,
      user: { id: target.id, username: target.username, displayName: target.displayName }
    });
    return true;
  }

  if (pathname === "/api/v1/admin/inventory/revoke" && method(req) === "POST") {
    const auth = await requireAdmin(req, res);
    if (!auth) return true;
    if (!canGiftInventory(auth.user, userHasPermission)) {
      sendJson(res, 403, { error: "permission_denied", permission: "cosmetics.gift" });
      return true;
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "invalid_json" });
      return true;
    }
    const itemId = String((body && body.itemId) || "").trim();
    const quantity = Math.floor(Number(body && body.quantity) || 1);
    if (!itemId) {
      sendJson(res, 400, { error: "invalid_input" });
      return true;
    }
    const target = await resolveGiftTarget(prisma, body || {});
    if (!target || target.status === "deleted") {
      sendJson(res, 404, { error: "user_not_found" });
      return true;
    }
    const note = String((body && body.note) || "").trim().slice(0, 200);
    let result;
    try {
      result = await revokeItem(prisma, target.id, itemId, quantity);
    } catch (err) {
      const code = err && err.code;
      if (code === "item_not_found") {
        sendJson(res, 404, { error: "item_not_found" });
        return true;
      }
      if (code === "not_owned") {
        sendJson(res, 404, { error: "not_owned" });
        return true;
      }
      if (code === "invalid_quantity") {
        sendJson(res, 400, { error: "invalid_quantity" });
        return true;
      }
      throw err;
    }
    await writeAdminLog(prisma, {
      adminId: auth.user.id,
      action: "inventory.revoke",
      targetId: target.id,
      metadata: {
        itemId: result.item.id,
        name: result.item.name,
        removed: result.removed,
        quantity: result.quantity,
        note: note || null
      },
      ipAddress: clientIp(req)
    });
    sendJson(res, 200, {
      ok: true,
      item: result.item,
      removed: result.removed,
      quantity: result.quantity,
      user: { id: target.id, username: target.username, displayName: target.displayName }
    });
    return true;
  }

  sendJson(res, 404, { error: "not_found" });
  return true;
}

module.exports = {
  ANGEL_ITEM_ID,
  MAX_ITEM_QUANTITY,
  CATALOG_ITEMS,
  ensureInventoryCatalog,
  listShopItems,
  listCatalogItems,
  publicItem,
  loadUserInventory,
  getItemQuantity,
  buyItem,
  consumeItem,
  grantItem,
  revokeItem,
  handleInventoryApi,
  handleAdminInventoryApi
};
