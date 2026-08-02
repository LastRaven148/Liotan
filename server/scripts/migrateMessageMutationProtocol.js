"use strict";

const path = require("node:path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const CryptoConversation = require("../models/CryptoConversation");
const {
  acquireLease,
  checkpointBatch,
  migrationOwner,
  pauseOrFail,
  renewLease
} = require("../utils/durableMigration");

const MIGRATION_ID = "50.5.0-message-mutation-chain";
const CONFIRMATION = "APPLY_50_5_0_MESSAGE_MUTATION_CHAIN";
const MISSING = { legacyMutationCutoffSequence: { $exists: false } };

async function inspect() {
  const collection = CryptoConversation.collection;
  return {
    migration: MIGRATION_ID,
    conversationsWithoutCutoff: await collection.countDocuments(MISSING),
    containsRawIdentifiers: false
  };
}

async function applyMigration({
  batchSize = 200,
  owner = migrationOwner(),
  hooks = {}
} = {}) {
  batchSize = Math.max(1, Math.min(Number(batchSize) || 200, 1000));
  const migrations = mongoose.connection.collection("system_migrations");
  const conversations = CryptoConversation.collection;
  const lease = await acquireLease(migrations, MIGRATION_ID, { owner, version: 1 });
  if (lease.completed) return { alreadyApplied: true, ...(lease.state.result || {}) };
  let state = lease.state;
  try {
    while (true) {
      await renewLease(migrations, MIGRATION_ID, owner);
      const query = {
        ...MISSING,
        ...(state.cursor ? { _id: { $gt: new mongoose.Types.ObjectId(state.cursor) } } : {})
      };
      const batch = await conversations.find(query).sort({ _id: 1 }).limit(batchSize).toArray();
      if (!batch.length) break;
      let updated = 0;
      for (const conversation of batch) {
        const result = await conversations.updateOne(
          { _id: conversation._id, ...MISSING },
          { $set: { legacyMutationCutoffSequence: Math.max(0, Number(conversation.sequence) || 0) } }
        );
        updated += result.modifiedCount;
      }
      const cursor = String(batch.at(-1)._id);
      await checkpointBatch(migrations, MIGRATION_ID, owner, {
        cursor,
        counter: "conversationsMigrated",
        count: updated
      });
      await hooks.afterBatch?.({ count: batch.length, updated, cursor });
      state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    }
    const remaining = await conversations.countDocuments(MISSING);
    if (remaining) throw new Error("message mutation cutoff migration did not converge");
    state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    const result = {
      conversationsMigrated: Number(state.counters?.conversationsMigrated || 0)
    };
    await migrations.updateOne(
      { _id: MIGRATION_ID, status: "running", leaseOwner: owner },
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
  if (apply && process.env.LIOTAN_MESSAGE_MUTATION_MIGRATION_CONFIRM !== CONFIRMATION) {
    throw new Error(`Set LIOTAN_MESSAGE_MUTATION_MIGRATION_CONFIRM=${CONFIRMATION} to apply`);
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
      ...result
    }, null, 2)}\n`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`message mutation migration failed: ${String(error?.message || error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  CONFIRMATION,
  MIGRATION_ID,
  applyMigration,
  inspect
};
