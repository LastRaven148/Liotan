"use strict";

const path = require("node:path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const AvatarObject = require("../models/AvatarObject");
const {
  acquireLease,
  advancePhase,
  checkpointBatch,
  migrationOwner,
  pauseOrFail,
  renewLease
} = require("../utils/durableMigration");

const MIGRATION_ID = "57.4.0-avatar-uploaded-recovery";
const CONFIRMATION = "APPLY_57_4_0_AVATAR_UPLOADED_RECOVERY";
const UPLOADED_WITHOUT_TIMESTAMP_QUERY = {
  state: "uploaded",
  $or: [{ uploadedAt: null }, { uploadedAt: { $exists: false } }]
};

async function inspect() {
  return {
    migration: MIGRATION_ID,
    uploadedWithoutTimestamp: await AvatarObject.countDocuments(
      UPLOADED_WITHOUT_TIMESTAMP_QUERY
    )
  };
}

async function applyMigration({
  batchSize = 100,
  owner = migrationOwner(),
  leaseMs = 5 * 60 * 1000,
  hooks = {}
} = {}) {
  batchSize = Math.max(1, Math.min(Number(batchSize) || 100, 500));
  const migrations = mongoose.connection.collection("system_migrations");
  const lease = await acquireLease(migrations, MIGRATION_ID, {
    owner,
    version: 1,
    leaseMs
  });
  if (lease.completed) return { alreadyApplied: true, ...(lease.state.result || {}) };
  let state = lease.state;
  try {
    if (state.phase === "indexes") {
      await AvatarObject.createIndexes();
      await renewLease(migrations, MIGRATION_ID, owner, { leaseMs });
      await advancePhase(migrations, MIGRATION_ID, owner, "uploaded-records");
    }

    state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    while (state.phase === "uploaded-records") {
      await renewLease(migrations, MIGRATION_ID, owner, { leaseMs });
      const query = { ...UPLOADED_WITHOUT_TIMESTAMP_QUERY };
      if (state.cursor) query._id = { $gt: state.cursor };
      const records = await AvatarObject.find(query, "createdAt")
        .sort({ _id: 1 })
        .limit(batchSize)
        .lean();
      if (!records.length) {
        await advancePhase(migrations, MIGRATION_ID, owner, "verification");
        break;
      }
      let migrated = 0;
      for (const record of records) {
        const update = await AvatarObject.updateOne(
          { _id: record._id, ...UPLOADED_WITHOUT_TIMESTAMP_QUERY },
          { $set: {
            uploadedAt: record.createdAt || new Date(),
            nextAttemptAt: new Date()
          } }
        );
        migrated += update.modifiedCount;
      }
      const cursor = records.at(-1)._id;
      await checkpointBatch(migrations, MIGRATION_ID, owner, {
        cursor,
        counter: "uploadedTimestampsBackfilled",
        count: migrated
      });
      await hooks.afterBatch?.({ phase: "uploaded-records", count: records.length, cursor });
      state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    }

    state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    if (state.phase === "verification") {
      if (await AvatarObject.countDocuments(UPLOADED_WITHOUT_TIMESTAMP_QUERY)) {
        const error = new Error("avatar uploaded timestamp backfill verification failed");
        error.code = "AVATAR_LIFECYCLE_MIGRATION_VERIFICATION_FAILED";
        throw error;
      }
    }

    state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    const result = {
      uploadedTimestampsBackfilled: Number(
        state.counters?.uploadedTimestampsBackfilled || 0
      )
    };
    const completed = await migrations.updateOne(
      { _id: MIGRATION_ID, status: "running", leaseOwner: owner, phase: "verification" },
      { $set: {
        status: "completed",
        phase: "completed",
        completedAt: new Date(),
        result,
        leaseOwner: "",
        leaseExpiresAt: null,
        lastErrorCode: ""
      } }
    );
    if (completed.matchedCount !== 1) {
      const error = new Error("avatar lifecycle migration lease was lost before completion");
      error.code = "MIGRATION_LEASE_LOST";
      throw error;
    }
    return { alreadyApplied: false, ...result };
  } catch (error) {
    await pauseOrFail(migrations, MIGRATION_ID, owner, error).catch(() => {});
    throw error;
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && process.env.LIOTAN_AVATAR_LIFECYCLE_MIGRATION_CONFIRM !== CONFIRMATION) {
    throw new Error(`Set LIOTAN_AVATAR_LIFECYCLE_MIGRATION_CONFIRM=${CONFIRMATION} to apply`);
  }
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const result = apply ? await applyMigration() : await inspect();
    process.stdout.write(`${JSON.stringify({ ok: true, mode: apply ? "apply" : "dry-run", ...result }, null, 2)}\n`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`avatar lifecycle migration failed: ${String(error?.message || error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = { CONFIRMATION, MIGRATION_ID, inspect, applyMigration };
