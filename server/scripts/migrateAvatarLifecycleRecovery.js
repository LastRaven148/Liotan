"use strict";

const path = require("node:path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const AvatarObject = require("../models/AvatarObject");

const MIGRATION_ID = "57.4.0-avatar-uploaded-recovery";
const CONFIRMATION = "APPLY_57_4_0_AVATAR_UPLOADED_RECOVERY";

async function inspect() {
  return {
    migration: MIGRATION_ID,
    uploadedWithoutTimestamp: await AvatarObject.countDocuments({
      state: "uploaded",
      $or: [{ uploadedAt: null }, { uploadedAt: { $exists: false } }]
    })
  };
}

async function applyMigration() {
  const migrations = mongoose.connection.collection("system_migrations");
  const prior = await migrations.findOne({ _id: MIGRATION_ID, status: "completed" });
  if (prior) return { alreadyApplied: true, ...(prior.result || {}) };
  const records = await AvatarObject.find({
    state: "uploaded",
    $or: [{ uploadedAt: null }, { uploadedAt: { $exists: false } }]
  }, "createdAt").lean();
  for (const record of records) {
    await AvatarObject.updateOne(
      { _id: record._id, state: "uploaded", $or: [{ uploadedAt: null }, { uploadedAt: { $exists: false } }] },
      { $set: { uploadedAt: record.createdAt || new Date(), nextAttemptAt: new Date() } }
    );
  }
  await AvatarObject.createIndexes();
  const result = { uploadedTimestampsBackfilled: records.length };
  await migrations.updateOne({ _id: MIGRATION_ID }, { $set: {
    status: "completed",
    completedAt: new Date(),
    result
  } }, { upsert: true });
  return { alreadyApplied: false, ...result };
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
