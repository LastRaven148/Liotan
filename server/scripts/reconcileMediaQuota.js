"use strict";

const path = require("node:path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { reconcileMediaQuota } = require("../services/mediaQuotaReconciliation");

const CONFIRMATION = "RECONCILE_50_3_0_MEDIA_QUOTA";

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && process.env.LIOTAN_MEDIA_QUOTA_RECONCILE_CONFIRM !== CONFIRMATION) {
    throw new Error(
      `Set LIOTAN_MEDIA_QUOTA_RECONCILE_CONFIRM=${CONFIRMATION} to apply`
    );
  }
  if (apply && process.env.NODE_ENV === "production" &&
      process.env.LIOTAN_MAINTENANCE_MODE !== "true") {
    throw new Error("Production reconciliation requires LIOTAN_MAINTENANCE_MODE=true");
  }
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const result = await reconcileMediaQuota({ apply });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      mode: apply ? "apply" : "dry-run",
      ...result,
      containsRawIdentifiers: false
    }, null, 2)}\n`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`media quota reconciliation failed: ${String(error?.message || error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = { CONFIRMATION, main };
