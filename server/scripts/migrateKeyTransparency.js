"use strict";

const path = require("node:path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const CryptoIdentity = require("../models/CryptoIdentity");
const CryptoDirectoryEntry = require("../models/CryptoDirectoryEntry");
const CryptoTransparencyState = require("../models/CryptoTransparencyState");
const CryptoTransparencyLeaf = require("../models/CryptoTransparencyLeaf");
const CryptoTransparencyNode = require("../models/CryptoTransparencyNode");
const CryptoTransparencyCheckpoint = require("../models/CryptoTransparencyCheckpoint");
const { appendDirectoryTransparency } = require("../security/keyTransparency");
const {
  acquireLease,
  advancePhase,
  checkpointBatch,
  migrationOwner,
  pauseOrFail,
  renewLease
} = require("../utils/durableMigration");

const MIGRATION_ID = "50.2.0-key-transparency-v1";
const CONFIRMATION = "APPLY_50_2_0_KEY_TRANSPARENCY_MIGRATION";

async function inspect() {
  const [directoryEntries, transparencyLeaves, state, missing] = await Promise.all([
    CryptoDirectoryEntry.countDocuments(),
    CryptoTransparencyLeaf.countDocuments(),
    CryptoTransparencyState.findById("global-v1").lean(),
    CryptoDirectoryEntry.aggregate([
      {
        $lookup: {
          from: CryptoTransparencyLeaf.collection.collectionName,
          let: { cryptoUserId: "$cryptoUserId", version: "$version" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$cryptoUserId", "$$cryptoUserId"] },
                    { $eq: ["$directoryVersion", "$$version"] }
                  ]
                }
              }
            },
            { $limit: 1 }
          ],
          as: "transparencyMatch"
        }
      },
      { $match: { transparencyMatch: { $size: 0 } } },
      { $count: "count" }
    ])
  ]);
  return {
    migration: MIGRATION_ID,
    directoryEntries,
    transparencyLeaves,
    missingLeaves: Number(missing[0]?.count || 0),
    treeSize: Number(state?.treeSize || 0),
    signingKeyId: state?.signingKeyId || ""
  };
}

function cursorQuery(cursor) {
  if (!cursor?.createdAt || !cursor?.id) return {};
  const createdAt = new Date(cursor.createdAt);
  return {
    $or: [
      { createdAt: { $gt: createdAt } },
      { createdAt, _id: { $gt: new mongoose.Types.ObjectId(cursor.id) } }
    ]
  };
}

async function applyMigration({
  batchSize = 100,
  owner = migrationOwner(),
  hooks = {}
} = {}) {
  batchSize = Math.max(1, Math.min(Number(batchSize) || 100, 500));
  const migrations = mongoose.connection.collection("system_migrations");
  const lease = await acquireLease(migrations, MIGRATION_ID, { owner, version: 1 });
  if (lease.completed) return { alreadyApplied: true, ...(lease.state.result || {}) };
  let state = lease.state;
  try {
    if (state.phase === "indexes") {
      await Promise.all([
        CryptoTransparencyState.createIndexes(),
        CryptoTransparencyLeaf.createIndexes(),
        CryptoTransparencyNode.createIndexes(),
        CryptoTransparencyCheckpoint.createIndexes()
      ]);
      await advancePhase(migrations, MIGRATION_ID, owner, "entries");
    }

    state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    while (state.phase === "entries") {
      await renewLease(migrations, MIGRATION_ID, owner);
      const entries = await CryptoDirectoryEntry.find(cursorQuery(state.cursor))
        .sort({ createdAt: 1, _id: 1 })
        .limit(batchSize)
        .lean();
      if (!entries.length) {
        await advancePhase(migrations, MIGRATION_ID, owner, "verification");
        break;
      }
      let appended = 0;
      for (const entry of entries) {
        if (await CryptoTransparencyLeaf.exists({
          cryptoUserId: entry.cryptoUserId,
          directoryVersion: Number(entry.version)
        })) {
          continue;
        }
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            const duplicate = await CryptoTransparencyLeaf.exists({
              cryptoUserId: entry.cryptoUserId,
              directoryVersion: Number(entry.version)
            }).session(session);
            if (duplicate) return;
            const identity = await CryptoIdentity.findOne({
              userId: entry.userId,
              cryptoUserId: entry.cryptoUserId
            }).session(session);
            if (!identity) {
              const error = new Error("directory entry has no owning crypto identity");
              error.code = "KEY_TRANSPARENCY_IDENTITY_MISSING";
              throw error;
            }
            await appendDirectoryTransparency(identity, {
              statement: entry.statement,
              signature: entry.signature,
              hash: entry.hash
            }, session);
            appended += 1;
          });
        } finally {
          await session.endSession();
        }
      }
      const last = entries.at(-1);
      const cursor = {
        createdAt: new Date(last.createdAt).toISOString(),
        id: String(last._id)
      };
      await checkpointBatch(migrations, MIGRATION_ID, owner, {
        cursor,
        counter: "entriesAppended",
        count: appended
      });
      await hooks.afterBatch?.({ count: entries.length, appended, cursor });
      state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    }

    state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    if (state.phase === "verification") {
      const verification = await inspect();
      if (verification.missingLeaves !== 0 ||
        verification.treeSize !== verification.transparencyLeaves) {
        const error = new Error("key transparency migration reconciliation failed");
        error.code = "KEY_TRANSPARENCY_RECONCILIATION_FAILED";
        throw error;
      }
      const result = {
        entriesAppended: Number(state.counters?.entriesAppended || 0),
        treeSize: verification.treeSize,
        signingKeyId: verification.signingKeyId
      };
      await migrations.updateOne(
        { _id: MIGRATION_ID, status: "running", leaseOwner: owner, phase: "verification" },
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
    }
    throw new Error("key transparency migration entered an unknown phase");
  } catch (error) {
    await pauseOrFail(migrations, MIGRATION_ID, owner, error).catch(() => {});
    throw error;
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && process.env.LIOTAN_KEY_TRANSPARENCY_MIGRATION_CONFIRM !== CONFIRMATION) {
    throw new Error(
      `Set LIOTAN_KEY_TRANSPARENCY_MIGRATION_CONFIRM=${CONFIRMATION} to apply`
    );
  }
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  await mongoose.connect(process.env.MONGO_URI);
  try {
    if (!apply) {
      process.stdout.write(`${JSON.stringify({ dryRun: true, ...(await inspect()) }, null, 2)}\n`);
      return;
    }
    const batchArg = process.argv.find(value => value.startsWith("--batch-size="));
    const result = await applyMigration({
      batchSize: batchArg ? Number(batchArg.split("=")[1]) : 100
    });
    process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`key transparency migration failed: ${String(error?.message || error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  MIGRATION_ID,
  CONFIRMATION,
  inspect,
  applyMigration
};
