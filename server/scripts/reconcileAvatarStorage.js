"use strict";

const mongoose = require("mongoose");
const { cleanupDetachedAvatars } = require("../services/avatarLifecycle");

const CONFIRM = "DELETE_DETACHED_PUBLIC_AVATARS";

async function main() {
  const apply = process.argv.includes("--yes");
  if (process.env.NODE_ENV === "production" &&
      !process.argv.includes("--production-read-only")) {
    throw new Error("Production reconciliation requires --production-read-only");
  }
  if (apply && process.env.LIOTAN_AVATAR_ORPHAN_DELETE_CONFIRM !== CONFIRM) {
    throw new Error(`Set LIOTAN_AVATAR_ORPHAN_DELETE_CONFIRM=${CONFIRM} to delete detached avatars`);
  }
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const result = await cleanupDetachedAvatars({
      dryRun: !apply,
      maxObjects: Math.max(1, Math.min(Number(process.env.AVATAR_RECONCILE_MAX_OBJECTS) || 10_000, 100_000))
    });
    console.log(JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      found: result.found,
      deleted: result.deleted,
      containsRawObjectKeys: false,
      confirmation: apply ? "confirmed" : `Re-run with --yes and ${CONFIRM}`
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(err => {
  console.error(JSON.stringify({
    error: {
      name: String(err?.name || "Error").slice(0, 80),
      code: String(err?.code || "AVATAR_RECONCILIATION_FAILED").slice(0, 80)
    }
  }));
  process.exitCode = 1;
});
