"use strict";

const path = require("node:path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const MediaTransferReservation = require("../models/MediaTransferReservation");
const MediaQuotaState = require("../models/MediaQuotaState");
const { reconcileMediaQuota } = require("../services/mediaQuotaReconciliation");

const MIGRATION_ID = "57.4.0-media-reservation-recovery";
const CONFIRMATION = "APPLY_57_4_0_MEDIA_RESERVATION_RECOVERY";
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

async function inspect() {
  const indexes = await MediaTransferReservation.collection.indexes();
  const unsafeTtl = indexes.some(index =>
    index.key?.expiresAt === 1 && Number(index.expireAfterSeconds) === 0
  );
  return {
    migration: MIGRATION_ID,
    unsafeReservationTtlIndexes: unsafeTtl ? 1 : 0,
    activeWithPurgeAt: await MediaTransferReservation.countDocuments({
      state: { $in: ["reserving", "reserved"] },
      purgeAt: { $type: "date" }
    }),
    terminalWithoutPurgeAt: await MediaTransferReservation.countDocuments({
      state: { $in: ["completed", "released"] },
      $or: [{ purgeAt: null }, { purgeAt: { $exists: false } }]
    })
  };
}

async function applyMigration() {
  const migrations = mongoose.connection.collection("system_migrations");
  const prior = await migrations.findOne({ _id: MIGRATION_ID, status: "completed" });
  if (prior) return { alreadyApplied: true, ...(prior.result || {}) };
  const indexes = await MediaTransferReservation.collection.indexes();
  for (const index of indexes) {
    if (index.key?.expiresAt === 1 && Number(index.expireAfterSeconds) === 0) {
      await MediaTransferReservation.collection.dropIndex(index.name);
    }
  }
  await MediaTransferReservation.updateMany(
    { state: { $in: ["reserving", "reserved"] } },
    { $unset: { purgeAt: "" } }
  );
  const terminal = await MediaTransferReservation.find({
    state: { $in: ["completed", "released"] },
    $or: [{ purgeAt: null }, { purgeAt: { $exists: false } }]
  }, "updatedAt").lean();
  for (const reservation of terminal) {
    await MediaTransferReservation.updateOne(
      { _id: reservation._id, $or: [{ purgeAt: null }, { purgeAt: { $exists: false } }] },
      { $set: { purgeAt: new Date(new Date(reservation.updatedAt).getTime() + RETENTION_MS) } }
    );
  }
  await MediaTransferReservation.createIndexes();
  await MediaQuotaState.createIndexes();
  const reconciliation = await reconcileMediaQuota({ apply: true });
  const verification = await reconcileMediaQuota({ apply: false });
  if (verification.discrepancies) throw new Error("media reservation counters failed reconciliation");
  const result = {
    terminalBackfilled: terminal.length,
    quotaKeysCorrected: reconciliation.corrected
  };
  await migrations.updateOne({ _id: MIGRATION_ID }, { $set: {
    status: "completed",
    completedAt: new Date(),
    result
  } }, { upsert: true });
  return { alreadyApplied: false, ...result };
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && process.env.LIOTAN_MEDIA_RESERVATION_MIGRATION_CONFIRM !== CONFIRMATION) {
    throw new Error(`Set LIOTAN_MEDIA_RESERVATION_MIGRATION_CONFIRM=${CONFIRMATION} to apply`);
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
    process.stderr.write(`media reservation migration failed: ${String(error?.message || error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = { CONFIRMATION, MIGRATION_ID, inspect, applyMigration };
