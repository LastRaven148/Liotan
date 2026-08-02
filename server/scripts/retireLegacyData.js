"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const AttachmentUpload = require("../models/AttachmentUpload");
const E2EEConversation = require("../models/E2EEConversation");
const E2EEKey = require("../models/E2EEKey");
const Group = require("../models/Group");
const LegacyRetirementObjectTask = require("../models/LegacyRetirementObjectTask");
const Message = require("../models/Messages");
const User = require("../models/User");
const { runMongoTransaction } = require("../utils/mongoTransaction");
const { deleteFromR2 } = require("../utils/uploadToR2");
const { extractR2KeyFromUrl, normalizeR2Key } = require("../utils/deleteUploadedFile");
const {
  acquireLease,
  advancePhase,
  migrationOwner,
  pauseOrFail,
  renewLease
} = require("../utils/durableMigration");

const MIGRATION_ID = "50.4.0-legacy-data-retirement";
const CONFIRMATION = "APPLY_50_4_0_LEGACY_DATA_RETIREMENT";
const PRODUCT_DECISION = "APPROVED_DELETE_LEGACY_DATA";
const RETENTION_ACK = "RETENTION_WINDOW_EXPIRED";
const TASK_BATCH_SIZE = 100;
const MAX_ATTEMPTS = 12;
const LEGACY_UPLOAD_QUERY = { protocol: { $ne: "mls-media-1" } };

function locatorHash(storageType, locator) {
  return crypto.createHash("sha256")
    .update(`${storageType}:${locator}`, "utf8")
    .digest("base64url");
}

function addCandidate(target, storageType, locator) {
  const normalized = storageType === "r2"
    ? normalizeR2Key(locator)
    : String(locator || "").trim();
  if (!normalized) return false;
  if (storageType === "local" && !normalized.startsWith("/uploads/")) return false;
  const key = `${storageType}:${normalized}`;
  target.set(key, {
    storageType,
    locator: normalized,
    storageClass: "private-media",
    locatorHash: locatorHash(storageType, normalized)
  });
  return true;
}

function candidatesFromFile(file) {
  const candidates = new Map();
  addCandidate(candidates, "r2", file?.storageKey);
  for (const value of [file?.url, file?.mediaUrl]) {
    const raw = String(value || "").trim();
    addCandidate(candidates, "r2", extractR2KeyFromUrl(raw));
    if (raw.startsWith("/uploads/")) addCandidate(candidates, "local", raw);
  }
  return [...candidates.values()];
}

async function collectObjectPlan() {
  const [messages, legacyUploads, mlsUploads, users, groups] = await Promise.all([
    Message.find({}, "attachment").lean(),
    AttachmentUpload.find(LEGACY_UPLOAD_QUERY, "storageKey url mediaUrl").lean(),
    AttachmentUpload.find(
      { protocol: "mls-media-1" },
      "storageKey url mediaUrl"
    ).lean(),
    User.find({}, "avatar avatarStorageKey").lean(),
    Group.find({}, "avatar avatarStorageKey").lean()
  ]);
  const candidates = new Map();
  let attachmentReferences = 0;
  let unlocatableAttachmentReferences = 0;
  for (const message of messages) {
    const file = message.attachment || {};
    const hasReference = Boolean(file.storageKey || file.url || file.mediaUrl);
    if (!hasReference) continue;
    attachmentReferences += 1;
    const located = candidatesFromFile(file);
    if (!located.length) unlocatableAttachmentReferences += 1;
    for (const candidate of located) {
      candidates.set(`${candidate.storageType}:${candidate.locator}`, candidate);
    }
  }
  for (const upload of legacyUploads) {
    for (const candidate of candidatesFromFile(upload)) {
      candidates.set(`${candidate.storageType}:${candidate.locator}`, candidate);
    }
  }

  const shared = new Set();
  for (const file of [...mlsUploads, ...users.map(user => ({
    storageKey: user.avatarStorageKey,
    url: user.avatar
  })), ...groups.map(group => ({
    storageKey: group.avatarStorageKey,
    url: group.avatar
  }))]) {
    for (const candidate of candidatesFromFile(file)) {
      shared.add(`${candidate.storageType}:${candidate.locator}`);
    }
  }
  const exclusive = [...candidates.entries()]
    .filter(([key]) => !shared.has(key))
    .map(([, value]) => value);
  return {
    tasks: exclusive,
    counts: {
      attachmentReferences,
      unlocatableAttachmentReferences,
      uniqueObjectCandidates: candidates.size,
      exclusiveObjectCandidates: exclusive.length,
      retainedSharedObjects: candidates.size - exclusive.length
    }
  };
}

async function inspect() {
  const objectPlan = await collectObjectPlan();
  return {
    migration: MIGRATION_ID,
    outputMode: "aggregate-counts-only",
    containsRawIdentifiers: false,
    legacy: {
      messages: await Message.countDocuments({}),
      plaintextMessages: await Message.countDocuments({ contentMode: { $ne: "e2ee" } }),
      encryptedV3Messages: await Message.countDocuments({ contentMode: "e2ee" }),
      e2eeKeys: await E2EEKey.countDocuments({}),
      e2eeConversations: await E2EEConversation.countDocuments({}),
      legacyUploads: await AttachmentUpload.countDocuments(LEGACY_UPLOAD_QUERY),
      usersWithLegacyPublicKeys: await User.countDocuments({
        e2eePublicKey: { $ne: null }
      })
    },
    objects: objectPlan.counts,
    retirementTasks: {
      pending: await LegacyRetirementObjectTask.countDocuments({
        migrationId: MIGRATION_ID,
        state: "pending"
      }),
      deadLetter: await LegacyRetirementObjectTask.countDocuments({
        migrationId: MIGRATION_ID,
        state: "dead-letter"
      })
    }
  };
}

async function resolveUploadsRoot() {
  const configured = path.resolve(__dirname, "..", "uploads");
  try {
    const root = await fs.realpath(configured);
    if (path.basename(root) !== "uploads") {
      throw new Error("local uploads root failed its boundary check");
    }
    return root;
  } catch (error) {
    if (error.code === "ENOENT") return configured;
    throw error;
  }
}

async function deleteLocalUpload(locator) {
  const root = await resolveUploadsRoot();
  const relative = locator.replace(/^\/uploads\//, "");
  const target = path.resolve(root, relative);
  if (!relative || !target.startsWith(`${root}${path.sep}`)) {
    throw new Error("legacy local object escaped the uploads root");
  }
  try {
    const realTarget = await fs.realpath(target);
    if (!realTarget.startsWith(`${root}${path.sep}`)) {
      throw new Error("legacy local object resolves outside the uploads root");
    }
    const stat = await fs.lstat(realTarget);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error("legacy local object is not a regular file");
    }
    await fs.unlink(realTarget);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function retryDelay(attempts) {
  return Math.min(6 * 60 * 60 * 1000, 1000 * (2 ** Math.min(12, attempts)));
}

async function planTasks(plan) {
  if (!plan.tasks.length) return;
  await LegacyRetirementObjectTask.insertMany(
    plan.tasks.map(task => ({ migrationId: MIGRATION_ID, ...task })),
    { ordered: false }
  ).catch(error => {
    const writeErrors = error?.writeErrors || [];
    if (!writeErrors.length || writeErrors.some(item => item.code !== 11000)) throw error;
  });
}

async function deleteTaskBatch({ deleteR2 = deleteFromR2, deleteLocal = deleteLocalUpload } = {}) {
  const tasks = await LegacyRetirementObjectTask.find({
    migrationId: MIGRATION_ID,
    state: "pending",
    nextAttemptAt: { $lte: new Date() }
  }).sort({ createdAt: 1 }).limit(TASK_BATCH_SIZE);
  for (const task of tasks) {
    try {
      if (task.storageType === "r2") {
        await deleteR2(task.locator, { storageClass: task.storageClass });
      } else {
        await deleteLocal(task.locator);
      }
      task.state = "deleted";
      task.deletedAt = new Date();
      task.lastErrorCode = "";
      await task.save();
    } catch (error) {
      task.attempts += 1;
      task.lastErrorCode = String(error?.code || error?.name || "DELETE_FAILED").slice(0, 80);
      task.nextAttemptAt = new Date(Date.now() + retryDelay(task.attempts));
      if (task.attempts >= MAX_ATTEMPTS) task.state = "dead-letter";
      await task.save();
      error.code = task.state === "dead-letter"
        ? "LEGACY_OBJECT_DELETE_DEAD_LETTER"
        : "LEGACY_OBJECT_DELETE_RETRY";
      throw error;
    }
  }
  return tasks.length;
}

async function deleteLegacyMongoData() {
  return runMongoTransaction(async session => {
    const messages = await Message.deleteMany({}, { session });
    const keys = await E2EEKey.deleteMany({}, { session });
    const conversations = await E2EEConversation.deleteMany({}, { session });
    const uploads = await AttachmentUpload.deleteMany(LEGACY_UPLOAD_QUERY, { session });
    const users = await User.updateMany(
      { e2eePublicKey: { $ne: null } },
      { $set: { e2eePublicKey: null } },
      { session }
    );
    return {
      messages: messages.deletedCount,
      keys: keys.deletedCount,
      conversations: conversations.deletedCount,
      uploads: uploads.deletedCount,
      userKeysScrubbed: users.modifiedCount
    };
  });
}

async function applyMigration({
  owner = migrationOwner(),
  adapters = {},
  hooks = {}
} = {}) {
  const migrations = mongoose.connection.collection("system_migrations");
  const lease = await acquireLease(migrations, MIGRATION_ID, { owner, version: 1 });
  if (lease.completed) return { alreadyApplied: true, ...(lease.state.result || {}) };
  let state = lease.state;
  try {
    if (state.phase === "indexes") {
      await LegacyRetirementObjectTask.createIndexes();
      await advancePhase(migrations, MIGRATION_ID, owner, "planning");
    }

    state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    if (state.phase === "planning") {
      const plan = await collectObjectPlan();
      await planTasks(plan);
      await migrations.updateOne(
        { _id: MIGRATION_ID, leaseOwner: owner, phase: "planning" },
        { $set: { inventoryCounts: plan.counts, updatedAt: new Date() } }
      );
      await advancePhase(migrations, MIGRATION_ID, owner, "objects");
      await hooks.afterPlanning?.(plan.counts);
    }

    state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    while (state.phase === "objects") {
      await renewLease(migrations, MIGRATION_ID, owner);
      const deleted = await deleteTaskBatch(adapters);
      await hooks.afterObjectBatch?.(deleted);
      if (deleted) {
        state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
        continue;
      }
      const deadLetter = await LegacyRetirementObjectTask.exists({
        migrationId: MIGRATION_ID,
        state: "dead-letter"
      });
      if (deadLetter) {
        const error = new Error("legacy object deletion contains dead-letter tasks");
        error.code = "LEGACY_OBJECT_DELETE_DEAD_LETTER";
        throw error;
      }
      const pending = await LegacyRetirementObjectTask.findOne({
        migrationId: MIGRATION_ID,
        state: "pending"
      }).lean();
      if (pending) {
        const error = new Error("legacy object deletion retry is not due");
        error.code = "LEGACY_OBJECT_DELETE_RETRY_NOT_DUE";
        throw error;
      }
      await advancePhase(migrations, MIGRATION_ID, owner, "mongo");
      break;
    }

    state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    let deleted = state.deletedCounts || null;
    if (state.phase === "mongo") {
      deleted = await deleteLegacyMongoData();
      await migrations.updateOne(
        { _id: MIGRATION_ID, leaseOwner: owner, phase: "mongo" },
        { $set: { deletedCounts: deleted, updatedAt: new Date() } }
      );
      await advancePhase(migrations, MIGRATION_ID, owner, "verification");
    }

    state = await migrations.findOne({ _id: MIGRATION_ID, leaseOwner: owner });
    if (state.phase === "verification") {
      const verification = await inspect();
      const residual = Object.values(verification.legacy).reduce(
        (sum, value) => sum + Number(value || 0),
        0
      ) + verification.retirementTasks.pending + verification.retirementTasks.deadLetter;
      if (residual) {
        const error = new Error("legacy data retirement verification found residual data");
        error.code = "LEGACY_RETIREMENT_VERIFICATION_FAILED";
        throw error;
      }
      const result = {
        ...(state.deletedCounts || deleted || {}),
        objectsDeleted: await LegacyRetirementObjectTask.countDocuments({
          migrationId: MIGRATION_ID,
          state: "deleted"
        })
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
    throw new Error("legacy data retirement reached an invalid migration phase");
  } catch (error) {
    await pauseOrFail(migrations, MIGRATION_ID, owner, error).catch(() => {});
    throw error;
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && process.env.LIOTAN_LEGACY_RETIREMENT_CONFIRM !== CONFIRMATION) {
    throw new Error(`Set LIOTAN_LEGACY_RETIREMENT_CONFIRM=${CONFIRMATION} to apply`);
  }
  if (apply && process.env.LIOTAN_LEGACY_RETIREMENT_PRODUCT_DECISION !== PRODUCT_DECISION) {
    throw new Error(
      `Set LIOTAN_LEGACY_RETIREMENT_PRODUCT_DECISION=${PRODUCT_DECISION} after the explicit product decision`
    );
  }
  if (apply && process.env.LIOTAN_LEGACY_RETENTION_ACK !== RETENTION_ACK) {
    throw new Error(`Set LIOTAN_LEGACY_RETENTION_ACK=${RETENTION_ACK} after retention review`);
  }
  if (apply && process.env.NODE_ENV === "production" &&
      process.env.LIOTAN_MAINTENANCE_MODE !== "true") {
    throw new Error("Production retirement requires LIOTAN_MAINTENANCE_MODE=true");
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
    process.stderr.write(`legacy data retirement failed: ${String(error?.message || error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  CONFIRMATION,
  LEGACY_UPLOAD_QUERY,
  MIGRATION_ID,
  PRODUCT_DECISION,
  RETENTION_ACK,
  applyMigration,
  collectObjectPlan,
  inspect
};
