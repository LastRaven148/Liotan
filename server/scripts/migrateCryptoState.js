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

async function applyMigration() {
  const migrations = mongoose.connection.collection("system_migrations");
  const completed = await migrations.findOne({ _id: MIGRATION_ID, status: "completed" });
  if (completed) return { alreadyApplied: true };
  const before = await inspect();
  const backupFile = await writeBackup({ createdAt: new Date().toISOString(), before });
  await migrations.updateOne(
    { _id: MIGRATION_ID },
    { $set: { status: "running", startedAt: new Date(), backupFile: backupFile || "" } },
    { upsert: true }
  );
  try {
    for (const index of before.attachmentIndexes.filter(isTtlExpiresIndex)) {
      await AttachmentUpload.collection.dropIndex(index.name);
    }
    const media = await AttachmentUpload.updateMany(
      { protocol: "mls-media-1", lifecycleState: { $exists: false } },
      { $set: { lifecycleState: "legacy-unverified", expiresAt: null } }
    );
    const conversations = await CryptoConversation.collection.updateMany(
      { authorizedClientIds: { $exists: false } },
      [{ $set: {
        authorizedClientIds: { $ifNull: ["$activeClientIds", []] },
        rosterVersion: { $cond: [{ $gt: [{ $ifNull: ["$rosterVersion", 0] }, 0] }, "$rosterVersion", 1] }
      } }]
    );
    const devices = await CryptoDevice.updateMany(
      { activationMode: { $exists: false } },
      { $set: { activationMode: "legacy-migrated" } }
    );
    const identities = await CryptoIdentity.updateMany(
      { directoryVersion: { $exists: false } },
      { $set: {
        directoryVersion: 0,
        directoryHash: "",
        directoryStatement: null,
        directorySignature: ""
      } }
    );
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
    const result = {
      alreadyApplied: false,
      mediaQuarantined: media.modifiedCount,
      conversationsBackfilled: conversations.modifiedCount,
      devicesBackfilled: devices.modifiedCount,
      identitiesBackfilled: identities.modifiedCount
    };
    await migrations.updateOne(
      { _id: MIGRATION_ID },
      { $set: { status: "completed", completedAt: new Date(), result } }
    );
    return result;
  } catch (error) {
    await migrations.updateOne(
      { _id: MIGRATION_ID },
      { $set: { status: "failed", failedAt: new Date(), errorName: String(error?.name || "Error") } }
    );
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
    process.stdout.write(`${JSON.stringify({ ok: true, ...(await applyMigration()) })}\n`);
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
