"use strict";

const fs = require("fs/promises");
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const AttachmentUpload = require("../models/AttachmentUpload");
const CryptoConversation = require("../models/CryptoConversation");
const CryptoDevice = require("../models/CryptoDevice");
const CryptoIdentity = require("../models/CryptoIdentity");
const CryptoDirectoryEntry = require("../models/CryptoDirectoryEntry");
const {
  acquireLease,
  advancePhase,
  checkpointBatch,
  migrationOwner,
  pauseOrFail,
  renewLease
} = require("../utils/durableMigration");

const MIGRATION_ID = "50.1.0-crypto-state-v4";
const CONFIRMATION = "APPLY_50_1_0_CRYPTO_STATE_MIGRATION";

function isTtlExpiresIndex(index) {
  return index?.key?.expiresAt === 1 && Number.isFinite(Number(index.expireAfterSeconds));
}

async function writeBackup(summary) {
  const configured = String(process.env.LIOTAN_MIGRATION_BACKUP_DIR || "").trim();
  if (!configured) return "";
  const directory = path.resolve(configured);
  if (!path.isAbsolute(configured)) throw new Error("LIOTAN_MIGRATION_BACKUP_DIR must be absolute");
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("migration backup directory is unsafe");
  const target = path.join(directory, `${MIGRATION_ID}-${Date.now()}.json`);
  await fs.writeFile(target, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  return target;
}

async function inspect() {
  const indexes = await AttachmentUpload.collection.indexes();
  return {
    migration: MIGRATION_ID,
    attachmentIndexes: indexes.map(index => ({
      name: index.name,
      key: index.key,
      ...(index.expireAfterSeconds !== undefined ? { expireAfterSeconds: index.expireAfterSeconds } : {})
    })),
    legacyUnversionedMedia: await AttachmentUpload.countDocuments({
      protocol: "mls-media-1",
      lifecycleState: { $exists: false }
    }),
    conversationsWithoutPolicyRoster: await CryptoConversation.countDocuments({
      authorizedClientIds: { $exists: false }
    }),
    devicesWithoutActivationMode: await CryptoDevice.countDocuments({
      activationMode: { $exists: false }
    }),
    identitiesWithoutDirectoryVersion: await CryptoIdentity.countDocuments({
      directoryVersion: { $exists: false }
    })
  };
}

async function applyMigration({ batchSize = 100, owner = migrationOwner(), hooks = {} } = {}) {
  batchSize = Math.max(1, Math.min(Number(batchSize) || 100, 500));
  const migrations = mongoose.connection.collection("system_migrations");
  const lease = await acquireLease(migrations, MIGRATION_ID, { owner, version: 1 });
  if (lease.completed) return { alreadyApplied: true, ...(lease.state.result || {}) };
  let state = lease.state;
  try {
    if (state.phase === "indexes") {
      const before = await inspect();
      const backupFile = await writeBackup({ createdAt: new Date().toISOString(), before });
      for (const index of before.attachmentIndexes.filter(isTtlExpiresIndex)) {
        await AttachmentUpload.collection.dropIndex(index.name).catch(error => {
          if (error?.codeName !== "IndexNotFound") throw error;
        });
      }
      await migrations.updateOne(
        { _id: MIGRATION_ID, leaseOwner: owner },
        { $set: { backupCreated: Boolean(backupFile), updatedAt: new Date() } }
      );
      await advancePhase(migrations, MIGRATION_ID, owner, "media");
      state = await migrations.findOne({ _id: MIGRATION_ID });
    }

    const phases = [
      {
        name: "media",
        next: "conversations",
        collection: AttachmentUpload.collection,
        query: { protocol: "mls-media-1", lifecycleState: { $exists: false } },
        counter: "mediaQuarantined",
        update: { $set: { lifecycleState: "legacy-unverified", expiresAt: null } }
      },
      {
        name: "conversations",
        next: "devices",
        collection: CryptoConversation.collection,
        query: { authorizedClientIds: { $exists: false } },
        counter: "conversationsBackfilled",
        update: [{ $set: {
          authorizedClientIds: { $ifNull: ["$activeClientIds", []] },
          rosterVersion: { $cond: [{ $gt: [{ $ifNull: ["$rosterVersion", 0] }, 0] }, "$rosterVersion", 1] }
        } }]
      },
      {
        name: "devices",
        next: "identities",
        collection: CryptoDevice.collection,
        query: { activationMode: { $exists: false } },
        counter: "devicesBackfilled",
        update: { $set: { activationMode: "legacy-migrated" } }
      },
      {
        name: "identities",
        next: "verification",
        collection: CryptoIdentity.collection,
        query: { directoryVersion: { $exists: false } },
        counter: "identitiesBackfilled",
        update: { $set: { directoryVersion: 0, directoryHash: "", directoryStatement: null, directorySignature: "" } }
      }
    ];
    for (const phase of phases) {
      state = await migrations.findOne({ _id: MIGRATION_ID });
      if (state.phase !== phase.name) continue;
      while (true) {
        await renewLease(migrations, MIGRATION_ID, owner);
        state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
        const query = { ...phase.query };
        if (state.cursor) query._id = { $gt: state.cursor };
        const documents = await phase.collection.find(query, { projection: { _id: 1 } }).sort({ _id: 1 }).limit(batchSize).toArray();
        if (!documents.length) {
          await advancePhase(migrations, MIGRATION_ID, owner, phase.next);
          break;
        }
        const ids = documents.map(document => document._id);
        const result = await phase.collection.updateMany({ _id: { $in: ids }, ...phase.query }, phase.update);
        await checkpointBatch(migrations, MIGRATION_ID, owner, {
          cursor: ids.at(-1),
          counter: phase.counter,
          count: result.modifiedCount
        });
        await hooks.afterBatch?.({ phase: phase.name, count: documents.length, cursor: ids.at(-1) });
      }
    }

    state = await migrations.findOne({ _id: MIGRATION_ID });
    if (state.phase === "verification") {
      const verification = await inspect();
      if (verification.legacyUnversionedMedia || verification.conversationsWithoutPolicyRoster ||
          verification.devicesWithoutActivationMode || verification.identitiesWithoutDirectoryVersion) {
        const error = new Error("migration verification found remaining documents");
        error.code = "MIGRATION_VERIFICATION_FAILED";
        throw error;
      }
      await advancePhase(migrations, MIGRATION_ID, owner, "reconciliation");
    }

    state = await migrations.findOne({ _id: MIGRATION_ID });
    if (state.phase === "reconciliation") {
      await AttachmentUpload.collection.createIndex({ expiresAt: 1 }, { name: "expiresAt_1" });
      await AttachmentUpload.collection.createIndex(
        { lifecycleState: 1, expiresAt: 1 },
        { name: "lifecycleState_1_expiresAt_1" }
      );
      await Promise.all([
        CryptoConversation.createIndexes(),
        CryptoDevice.createIndexes(),
        CryptoIdentity.createIndexes(),
        CryptoDirectoryEntry.createIndexes()
      ]);
      const indexes = await AttachmentUpload.collection.indexes();
      if (indexes.some(isTtlExpiresIndex)) {
        const error = new Error("unsafe attachment TTL index survived reconciliation");
        error.code = "MIGRATION_RECONCILIATION_FAILED";
        throw error;
      }
    }
    state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    const result = {
      mediaQuarantined: Number(state.counters?.mediaQuarantined || 0),
      conversationsBackfilled: Number(state.counters?.conversationsBackfilled || 0),
      devicesBackfilled: Number(state.counters?.devicesBackfilled || 0),
      identitiesBackfilled: Number(state.counters?.identitiesBackfilled || 0)
    };
    await migrations.updateOne(
      { _id: MIGRATION_ID, status: "running", leaseOwner: owner, phase: "reconciliation" },
      { $set: { status: "completed", phase: "completed", completedAt: new Date(), result, leaseOwner: "", leaseExpiresAt: null, lastErrorCode: "" } }
    );
    return { alreadyApplied: false, ...result };
  } catch (error) {
    await pauseOrFail(migrations, MIGRATION_ID, owner, error).catch(() => {});
    throw error;
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && process.env.LIOTAN_CRYPTO_MIGRATION_CONFIRM !== CONFIRMATION) {
    throw new Error(`Set LIOTAN_CRYPTO_MIGRATION_CONFIRM=${CONFIRMATION} to apply`);
  }
  await mongoose.connect(process.env.MONGO_URI);
  try {
    if (!apply) {
      process.stdout.write(`${JSON.stringify({ dryRun: true, ...(await inspect()) }, null, 2)}\n`);
      return;
    }
    const batchArg = process.argv.find(value => value.startsWith("--batch-size="));
    const batchSize = batchArg ? Number(batchArg.split("=")[1]) : 100;
    process.stdout.write(`${JSON.stringify({ ok: true, ...(await applyMigration({ batchSize })) })}\n`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`crypto state migration failed: ${String(error?.message || error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = { MIGRATION_ID, CONFIRMATION, inspect, applyMigration, isTtlExpiresIndex };
