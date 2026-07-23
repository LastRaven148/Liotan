"use strict";

const mongoose = require("mongoose");
const { cleanupDetachedAvatars } = require("../services/avatarLifecycle");

const CONFIRM = "DELETE_DETACHED_PUBLIC_AVATARS";

async function main() {
  const apply = process.argv.includes("--yes");
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
      ...result,
      confirmation: apply ? "confirmed" : `Re-run with --yes and ${CONFIRM}`
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
