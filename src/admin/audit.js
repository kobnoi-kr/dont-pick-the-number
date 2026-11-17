"use strict";

async function writeAdminLog(prisma, { adminId, action, targetId, metadata, ipAddress }) {
  if (!prisma || !adminId || !action) return null;
  try {
    return await prisma.adminLog.create({
      data: {
        adminId,
        action: String(action).slice(0, 128),
        targetId: targetId != null ? String(targetId).slice(0, 128) : null,
        metadata: metadata != null ? metadata : undefined,
        ipAddress: ipAddress ? String(ipAddress).slice(0, 64) : null
      }
    });
  } catch {
    return null;
  }
}

module.exports = { writeAdminLog };
