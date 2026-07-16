"use strict";

require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env")
});

const fs = require("fs/promises");
const path = require("path");
const mongoose = require("mongoose");
const connectDb = require("../config/db");
const deleteAccountData = require("../utils/deleteAccountData");
const { listR2Objects, deleteFromR2 } = require("../utils/uploadToR2");

const User = require("../models/User");
const Message = require("../models/Messages");
const Group = require("../models/Group");
const EmailCode = require("../models/EmailCode");
const E2EEKey = require("../models/E2EEKey");
const E2EEConversation = require("../models/E2EEConversation");
const Session = require("../models/Session");
const UserSecurity = require("../models/UserSecurity");
const RegistrationCancel = require("../models/RegistrationCancel");
const PendingEmailChange = require("../models/PendingEmailChange");
const AttachmentUpload = require("../models/AttachmentUpload");
const CryptoIdentity = require("../models/CryptoIdentity");
const CryptoDevice = require("../models/CryptoDevice");
const CryptoKeyPackage = require("../models/CryptoKeyPackage");
const CryptoConversation = require("../models/CryptoConversation");
const CryptoOperation = require("../models/CryptoOperation");
const CryptoEvent = require("../models/CryptoEvent");
const CryptoRequestNonce = require("../models/CryptoRequestNonce");
const CryptoDirectoryEntry = require("../models/CryptoDirectoryEntry");

const CONFIRMATION = "DELETE_ALL_ACCOUNTS_AND_DATA";
const DELETE_CONCURRENCY = 8;
const MAX_R2_OBJECTS = 1_000_000;

const DATA_MODELS = [
  User,
  Message,
  Group,
  EmailCode,
  E2EEKey,
  E2EEConversation,
  Session,
  UserSecurity,
  RegistrationCancel,
  PendingEmailChange,
  AttachmentUpload,
  CryptoIdentity,
  CryptoDevice,
  CryptoKeyPackage,
  CryptoConversation,
  CryptoOperation,
  CryptoEvent,
  CryptoRequestNonce,
  CryptoDirectoryEntry
];

const STORAGE_SCOPES = [
  {
    storageClass: "private-media",
    prefixes: ["liotan/mls/", "liotan/u/", "liotan/uploads/", "files/", "photos/", "videos/", "audio/"]
  },
  {
    storageClass: "public-avatar",
    prefixes: ["liotan/avatars/", "liotan/groups/"]
  }
];

function isConfirmed() {
  return process.env.LIOTAN_PURGE_CONFIRM === CONFIRMATION;
}

async function listAllR2Keys(storageClass, prefix) {
  let continuationToken = "";
  const keys = [];

  do {
    const page = await listR2Objects({
      prefix,
      continuationToken,
      storageClass
    });
    keys.push(...page.keys);
    if (keys.length > MAX_R2_OBJECTS) {
      throw new Error(`Refusing purge: ${storageClass}/${prefix} exceeds the ${MAX_R2_OBJECTS} object safety limit`);
    }
    continuationToken = page.nextContinuationToken;
    if (!page.isTruncated) break;
  } while (continuationToken);

  return keys;
}

async function inventoryR2() {
  const scopes = [];
  for (const scope of STORAGE_SCOPES) {
    const keys = new Set();
    for (const prefix of scope.prefixes) {
      for (const key of await listAllR2Keys(scope.storageClass, prefix)) keys.add(key);
    }
    scopes.push({ ...scope, keys: [...keys] });
  }
  return scopes;
}

async function mapBatches(values, worker) {
  for (let offset = 0; offset < values.length; offset += DELETE_CONCURRENCY) {
    await Promise.all(values.slice(offset, offset + DELETE_CONCURRENCY).map(worker));
  }
}

async function purgeR2(scopes) {
  for (const scope of scopes) {
    await mapBatches(scope.keys, key => deleteFromR2(key, { storageClass: scope.storageClass }));
  }
}

async function resolveUploadsRoot() {
  const configuredRoot = path.resolve(__dirname, "..", "uploads");
  try {
    const resolvedRoot = await fs.realpath(configuredRoot);
    const parsed = path.parse(resolvedRoot);
    if (parsed.root === resolvedRoot || path.basename(resolvedRoot) !== "uploads") {
      throw new Error("Refusing purge: shared uploads path failed its boundary check");
    }
    if (
      process.env.NODE_ENV === "production" &&
      !resolvedRoot.includes(`${path.sep}Liotan-deploy${path.sep}shared${path.sep}uploads`)
    ) {
      throw new Error("Refusing purge: production uploads do not resolve inside Liotan-deploy/shared/uploads");
    }
    return resolvedRoot;
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

async function countLocalEntries(root) {
  if (!root) return 0;
  let count = 0;
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) pending.push(path.join(current, entry.name));
      else count += 1;
    }
  }
  return count;
}

async function purgeLocalUploads(root) {
  if (!root) return;
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const target = path.resolve(root, entry.name);
    if (!target.startsWith(`${root}${path.sep}`)) {
      throw new Error("Refusing purge: local upload escaped its storage root");
    }
    if (entry.isDirectory() && !entry.isSymbolicLink() && ["attachments", "avatars"].includes(entry.name)) {
      for (const child of await fs.readdir(target)) {
        await fs.rm(path.resolve(target, child), { recursive: true, force: false });
      }
    } else {
      await fs.rm(target, { recursive: true, force: false });
    }
  }
}

async function countDocuments() {
  const counts = {};
  for (const model of DATA_MODELS) counts[model.modelName] = await model.countDocuments({});
  return counts;
}

async function deleteDatabaseData(usernames) {
  for (const username of usernames) {
    const result = await deleteAccountData(username);
    if (!result.ok) throw new Error("An account disappeared while the purge was running; retry the idempotent purge");
  }
  for (const model of DATA_MODELS) await model.deleteMany({});
}

function printPlan({ counts, r2Scopes, localEntries, confirmed }) {
  const r2Counts = Object.fromEntries(r2Scopes.map(scope => [scope.storageClass, scope.keys.length]));
  console.log(JSON.stringify({
    ok: true,
    mode: confirmed ? "delete" : "dry-run",
    databaseDocuments: counts,
    r2Objects: r2Counts,
    localUploadEntries: localEntries,
    nextStep: confirmed
      ? "Purge completed; run the dry-run again and require every count to be zero."
      : `Dry-run only. Set LIOTAN_PURGE_CONFIRM=${CONFIRMATION} to execute this exact full-account purge.`
  }, null, 2));
}

async function main() {
  await connectDb();

  // Complete all external-storage reads before the first destructive action.
  // Missing credentials or an inaccessible bucket must leave MongoDB intact.
  const [counts, users, r2Scopes, uploadsRoot] = await Promise.all([
    countDocuments(),
    User.find({}, "username").lean(),
    inventoryR2(),
    resolveUploadsRoot()
  ]);
  const localEntries = await countLocalEntries(uploadsRoot);
  const confirmed = isConfirmed();

  if (!confirmed) {
    printPlan({ counts, r2Scopes, localEntries, confirmed });
    return;
  }

  // R2 and local uploads are erased first. If either fails, database ownership
  // metadata remains available for a safe idempotent retry.
  await purgeR2(r2Scopes);
  await purgeLocalUploads(uploadsRoot);
  await deleteDatabaseData(users.map(user => user.username));

  const verification = {
    counts: await countDocuments(),
    r2Scopes: await inventoryR2(),
    localEntries: await countLocalEntries(uploadsRoot),
    confirmed
  };
  printPlan(verification);
}

if (require.main === module) {
  main()
    .catch(error => {
      console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

module.exports = {
  CONFIRMATION,
  isConfirmed
};
