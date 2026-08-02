"use strict";

const path = require("node:path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const MediaTransferReservation = require("../models/MediaTransferReservation");
const MediaQuotaState = require("../models/MediaQuotaState");
const { reconcileMediaQuota } = require("../services/mediaQuotaReconciliation");
const {
  acquireLease,
  advancePhase,
  checkpointBatch,
  migrationOwner,
  pauseOrFail,
  renewLease
} = require("../utils/durableMigration");

const MIGRATION_ID = "57.4.0-media-reservation-recovery";
const CONFIRMATION = "APPLY_57_4_0_MEDIA_RESERVATION_RECOVERY";
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const TERMINAL_WITHOUT_PURGE_QUERY = {
  state: { $in: ["completed", "released"] },
  $or: [{ purgeAt: null }, { purgeAt: { $exists: false } }]
};

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
    terminalWithoutPurgeAt: await MediaTransferReservation.countDocuments(
      TERMINAL_WITHOUT_PURGE_QUERY
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
      await MediaTransferReservation.createIndexes();
      await MediaQuotaState.createIndexes();
      await renewLease(migrations, MIGRATION_ID, owner, { leaseMs });
      await advancePhase(migrations, MIGRATION_ID, owner, "terminal-records");
    }

    state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    while (state.phase === "terminal-records") {
      await renewLease(migrations, MIGRATION_ID, owner, { leaseMs });
      const query = { ...TERMINAL_WITHOUT_PURGE_QUERY };
      if (state.cursor) query._id = { $gt: state.cursor };
      const terminal = await MediaTransferReservation.find(query, "updatedAt")
        .sort({ _id: 1 })
        .limit(batchSize)
        .lean();
      if (!terminal.length) {
        await advancePhase(migrations, MIGRATION_ID, owner, "verification");
        break;
      }
      let migrated = 0;
      for (const reservation of terminal) {
        const updatedAt = new Date(reservation.updatedAt);
        const base = Number.isFinite(updatedAt.getTime()) ? updatedAt : new Date();
        const update = await MediaTransferReservation.updateOne(
          { _id: reservation._id, ...TERMINAL_WITHOUT_PURGE_QUERY },
          { $set: { purgeAt: new Date(base.getTime() + RETENTION_MS) } }
        );
        migrated += update.modifiedCount;
      }
      const cursor = terminal.at(-1)._id;
      await checkpointBatch(migrations, MIGRATION_ID, owner, {
        cursor,
        counter: "terminalBackfilled",
        count: migrated
      });
      await hooks.afterBatch?.({ phase: "terminal-records", count: terminal.length, cursor });
      state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    }

    state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    if (state.phase === "verification") {
      const [indexes, activeWithPurgeAt, terminalWithoutPurgeAt] = await Promise.all([
        MediaTransferReservation.collection.indexes(),
        MediaTransferReservation.countDocuments({
          state: { $in: ["reserving", "reserved"] },
          purgeAt: { $type: "date" }
        }),
        MediaTransferReservation.countDocuments(TERMINAL_WITHOUT_PURGE_QUERY)
      ]);
      if (indexes.some(index =>
        index.key?.expiresAt === 1 && Number(index.expireAfterSeconds) === 0
      ) || activeWithPurgeAt || terminalWithoutPurgeAt) {
        const error = new Error("media reservation lifecycle backfill verification failed");
        error.code = "MEDIA_RESERVATION_MIGRATION_VERIFICATION_FAILED";
        throw error;
      }
      await advancePhase(migrations, MIGRATION_ID, owner, "reconciliation");
    }

    state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    let reconciliation = state.reconciliation || null;
    if (state.phase === "reconciliation") {
      await renewLease(migrations, MIGRATION_ID, owner, { leaseMs });
      reconciliation = await reconcileMediaQuota({ apply: true });
      const verification = await reconcileMediaQuota({ apply: false });
      if (verification.discrepancies) {
        const error = new Error("media reservation counters failed reconciliation");
        error.code = "MEDIA_RESERVATION_RECONCILIATION_FAILED";
        throw error;
      }
      await migrations.updateOne(
        { _id: MIGRATION_ID, leaseOwner: owner, phase: "reconciliation" },
        { $set: { reconciliation, updatedAt: new Date() } }
      );
    }

    state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    const result = {
      terminalBackfilled: Number(state.counters?.terminalBackfilled || 0),
      quotaKeysCorrected: Number(state.reconciliation?.corrected || reconciliation?.corrected || 0)
    };
    const completed = await migrations.updateOne(
      { _id: MIGRATION_ID, status: "running", leaseOwner: owner, phase: "reconciliation" },
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
      const error = new Error("media reservation migration lease was lost before completion");
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
