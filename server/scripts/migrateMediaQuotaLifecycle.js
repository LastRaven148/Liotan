"use strict";

const path = require("node:path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const AttachmentUpload = require("../models/AttachmentUpload");
const MediaQuotaState = require("../models/MediaQuotaState");
const User = require("../models/User");
const { scopeHash } = require("../services/mediaQuota");
const { reconcileMediaQuota } = require("../services/mediaQuotaReconciliation");
const { headFromR2 } = require("../utils/uploadToR2");
const {
  acquireLease,
  advancePhase,
  checkpointBatch,
  migrationOwner,
  pauseOrFail,
  renewLease
} = require("../utils/durableMigration");

const MIGRATION_ID = "50.3.0-media-quota-lifecycle";
const CONFIRMATION = "APPLY_50_3_0_MEDIA_QUOTA_LIFECYCLE";
const UNTRACKED_QUERY = {
  protocol: "mls-media-1",
  lifecycleState: {
    $in: ["temporary", "committed", "deletion-pending", "legacy-unverified"]
  },
  $or: [
    { quotaStorageState: { $exists: false } },
    { quotaStorageState: "untracked" }
  ]
};

function quotaScope(scope, value) {
  const scopeIdHash = scopeHash(scope, value);
  return { scope, scopeIdHash, key: `${scope}:${scopeIdHash}` };
}

async function inspect() {
  return {
    migration: MIGRATION_ID,
    untrackedMlsObjects: await AttachmentUpload.countDocuments(UNTRACKED_QUERY),
    untrackedWithoutStorageKey: await AttachmentUpload.countDocuments({
      ...UNTRACKED_QUERY,
      $and: [
        { $or: UNTRACKED_QUERY.$or },
        { $or: [{ storageKey: "" }, { storageKey: { $exists: false } }] }
      ]
    }),
    untrackedWithoutKnownBytes: await AttachmentUpload.countDocuments({
      ...UNTRACKED_QUERY,
      $and: [
        { $or: UNTRACKED_QUERY.$or },
        { $or: [
          { ciphertextBytes: { $exists: false } },
          { ciphertextBytes: { $lte: 0 } }
        ] }
      ]
    }),
    quotaStateDocuments: await MediaQuotaState.countDocuments()
  };
}

function storageClass(upload) {
  return String(upload.storageType || "").includes("public-avatar")
    ? "public-avatar"
    : "private-media";
}

async function objectBytes(upload, headObject) {
  const recorded = Number(upload.ciphertextBytes);
  if (Number.isSafeInteger(recorded) && recorded > 0) return recorded;
  if (!upload.storageKey) {
    const error = new Error("untracked MLS object has neither recorded bytes nor a storage key");
    error.code = "MEDIA_QUOTA_BACKFILL_OBJECT_UNLOCATABLE";
    throw error;
  }
  const response = await headObject(upload.storageKey, {
    storageClass: storageClass(upload)
  });
  const bytes = Number(response?.headers?.["content-length"]);
  if (!Number.isSafeInteger(bytes) || bytes <= 0) {
    const error = new Error("R2 object metadata did not provide an exact content length");
    error.code = "MEDIA_QUOTA_BACKFILL_SIZE_UNAVAILABLE";
    throw error;
  }
  return bytes;
}

async function applyMigration({
  batchSize = 100,
  owner = migrationOwner(),
  headObject = headFromR2,
  hooks = {}
} = {}) {
  batchSize = Math.max(1, Math.min(Number(batchSize) || 100, 500));
  const migrations = mongoose.connection.collection("system_migrations");
  const lease = await acquireLease(migrations, MIGRATION_ID, { owner, version: 1 });
  if (lease.completed) return { alreadyApplied: true, ...(lease.state.result || {}) };
  let state = lease.state;
  try {
    if (state.phase === "indexes") {
      await AttachmentUpload.createIndexes();
      await MediaQuotaState.createIndexes();
      await advancePhase(migrations, MIGRATION_ID, owner, "uploads");
    }

    state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    while (state.phase === "uploads") {
      await renewLease(migrations, MIGRATION_ID, owner);
      const query = { ...UNTRACKED_QUERY };
      if (state.cursor) query._id = { $gt: state.cursor };
      const uploads = await AttachmentUpload.find(query)
        .sort({ _id: 1 })
        .limit(batchSize)
        .lean();
      if (!uploads.length) {
        await advancePhase(migrations, MIGRATION_ID, owner, "verification");
        break;
      }
      const owners = [...new Set(uploads.map(upload => upload.owner).filter(Boolean))];
      const users = await User.find({ username: { $in: owners } }, "username").lean();
      const usersByName = new Map(users.map(user => [user.username, user]));
      let migrated = 0;
      for (const upload of uploads) {
        const bytes = await objectBytes(upload, headObject);
        const scopes = [quotaScope("global", "global")];
        const user = usersByName.get(upload.owner);
        if (user?._id) scopes.push(quotaScope("account", user._id));
        if (upload.cryptoClientId) scopes.push(quotaScope("device", upload.cryptoClientId));
        const quotaStorageState = upload.lifecycleState === "temporary"
          ? "temporary"
          : "persistent";
        const result = await AttachmentUpload.updateOne(
          { _id: upload._id, $or: UNTRACKED_QUERY.$or },
          {
            $set: {
              ciphertextBytes: bytes,
              quotaBytes: bytes,
              quotaScopes: scopes,
              quotaStorageState
            }
          }
        );
        migrated += result.modifiedCount;
      }
      const cursor = uploads.at(-1)._id;
      await checkpointBatch(migrations, MIGRATION_ID, owner, {
        cursor,
        counter: "objectsBackfilled",
        count: migrated
      });
      await hooks.afterBatch?.({ phase: "uploads", count: uploads.length, cursor });
      state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    }

    state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    if (state.phase === "verification") {
      const remaining = await AttachmentUpload.countDocuments(UNTRACKED_QUERY);
      if (remaining) {
        const error = new Error("media quota lifecycle migration left untracked MLS objects");
        error.code = "MEDIA_QUOTA_MIGRATION_VERIFICATION_FAILED";
        throw error;
      }
      await advancePhase(migrations, MIGRATION_ID, owner, "reconciliation");
    }

    state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    let reconciliation = state.reconciliation || null;
    if (state.phase === "reconciliation") {
      reconciliation = await reconcileMediaQuota({ apply: true });
      const verification = await reconcileMediaQuota({ apply: false });
      if (verification.discrepancies) {
        const error = new Error("media quota counters do not match durable object state");
        error.code = "MEDIA_QUOTA_RECONCILIATION_FAILED";
        throw error;
      }
      await migrations.updateOne(
        { _id: MIGRATION_ID, leaseOwner: owner, phase: "reconciliation" },
        { $set: { reconciliation, updatedAt: new Date() } }
      );
    }

    state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    const result = {
      objectsBackfilled: Number(state.counters?.objectsBackfilled || 0),
      quotaKeysCorrected: Number(state.reconciliation?.corrected || reconciliation?.corrected || 0)
    };
    await migrations.updateOne(
      { _id: MIGRATION_ID, status: "running", leaseOwner: owner, phase: "reconciliation" },
      {
        $set: {
          status: "completed",
          phase: "completed",
          completedAt: new Date(),
          result,
          leaseOwner: "",
          leaseExpiresAt: null,
          lastErrorCode: ""
        }
      }
    );
    return { alreadyApplied: false, ...result };
  } catch (error) {
    await pauseOrFail(migrations, MIGRATION_ID, owner, error).catch(() => {});
    throw error;
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && process.env.LIOTAN_MEDIA_QUOTA_MIGRATION_CONFIRM !== CONFIRMATION) {
    throw new Error(
      `Set LIOTAN_MEDIA_QUOTA_MIGRATION_CONFIRM=${CONFIRMATION} to apply`
    );
  }
  if (apply && process.env.NODE_ENV === "production" &&
      process.env.LIOTAN_MAINTENANCE_MODE !== "true") {
    throw new Error("Production migration requires LIOTAN_MAINTENANCE_MODE=true");
  }
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const result = apply ? await applyMigration() : await inspect();
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
    process.stderr.write(`media quota migration failed: ${String(error?.message || error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  CONFIRMATION,
  MIGRATION_ID,
  UNTRACKED_QUERY,
  applyMigration,
  inspect,
  objectBytes
};
