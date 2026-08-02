"use strict";

const AvatarObject = require("../models/AvatarObject");
const User = require("../models/User");
const Group = require("../models/Group");
const deleteUploadedFile = require("../utils/deleteUploadedFile");
const { listR2Objects, deleteFromR2, headFromR2 } = require("../utils/uploadToR2");
const crypto = require("node:crypto");

const MAX_DELETE_ATTEMPTS = 12;
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
const UPLOADED_GRACE_MS = 10 * 60 * 1000;
const LEASE_MS = 60 * 1000;

function avatarFile(value) {
  return {
    url: value.avatar || "",
    storageKey: value.avatarStorageKey || "",
    storageType: value.avatarStorageType || ""
  };
}

async function markForDeletion(file, metadata) {
  if (!file.storageKey) return null;
  return AvatarObject.findOneAndUpdate(
    { storageKey: file.storageKey },
    {
      $setOnInsert: {
        storageKey: file.storageKey,
        url: file.url || "",
        storageType: file.storageType || "r2:public-avatar",
        ownerType: metadata.ownerType,
        ownerId: metadata.ownerId,
        avatarVersion: Math.max(1, Number(metadata.avatarVersion) || 1)
      },
      $set: {
        state: "deletion-pending",
        nextAttemptAt: new Date()
      }
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
}

async function deleteTrackedAvatar(record, { deleteFile = deleteUploadedFile } = {}) {
  const now = new Date();
  const owner = `${process.pid}:${crypto.randomBytes(12).toString("base64url")}`;
  const claimed = await AvatarObject.findOneAndUpdate({
    _id: record._id,
    state: "deletion-pending",
    nextAttemptAt: { $lte: now },
    $or: [
      { leaseExpiresAt: null },
      { leaseExpiresAt: { $exists: false } },
      { leaseExpiresAt: { $lte: now } }
    ]
  }, { $set: {
    leaseOwner: owner,
    leaseExpiresAt: new Date(now.getTime() + LEASE_MS)
  } }, { returnDocument: "after" });
  if (!claimed) return false;
  try {
    await deleteFile({
      url: claimed.url,
      storageKey: claimed.storageKey,
      storageType: claimed.storageType
    }, { strict: true });
    const deleted = await AvatarObject.updateOne(
      { _id: claimed._id, state: "deletion-pending", leaseOwner: owner },
      {
        $set: {
          state: "deleted",
          deletedAt: new Date(),
          lastErrorCode: "",
          leaseOwner: "",
          leaseExpiresAt: null
        }
      }
    );
    return deleted.modifiedCount === 1;
  } catch (err) {
    const attempts = Number(claimed.attempts || 0) + 1;
    await AvatarObject.updateOne(
      { _id: claimed._id, state: "deletion-pending", leaseOwner: owner },
      {
        $set: {
          state: attempts >= MAX_DELETE_ATTEMPTS ? "dead-letter" : "deletion-pending",
          nextAttemptAt: new Date(Date.now() + Math.min(24 * 60 * 60 * 1000, 1000 * (2 ** attempts))),
          lastErrorCode: String(err.code || "avatar_delete_failed").slice(0, 80),
          leaseOwner: "",
          leaseExpiresAt: null
        },
        $inc: { attempts: 1 }
      }
    );
    return false;
  }
}

async function replaceAvatar({
  model,
  selector,
  current,
  ownerType,
  result,
  avatarUrl,
  deleteFile = deleteUploadedFile
}) {
  const oldAvatar = avatarFile(current);
  const expectedVersion = Number(current.avatarVersion) || 0;
  const nextVersion = expectedVersion + 1;
  let tracked;
  try {
    tracked = await AvatarObject.create({
      storageKey: result.key,
      url: avatarUrl,
      storageType: result.storageType,
      ownerType,
      ownerId: current._id,
      avatarVersion: nextVersion
    });
  } catch (err) {
    await deleteFile({
      url: result.url,
      storageKey: result.key,
      storageType: result.storageType
    }, { strict: true }).catch(() => {});
    throw err;
  }

  const versionSelector = expectedVersion === 0
    ? { $or: [{ avatarVersion: 0 }, { avatarVersion: { $exists: false } }] }
    : { avatarVersion: expectedVersion };
  let updated;
  try {
    updated = await model.findOneAndUpdate(
      { $and: [selector, versionSelector] },
      {
        $set: {
          avatar: avatarUrl,
          avatarStorageKey: result.key,
          avatarStorageType: result.storageType,
          avatarVersion: nextVersion
        }
      },
      { returnDocument: "after" }
    );
  } catch (err) {
    tracked.state = "deletion-pending";
    tracked.nextAttemptAt = new Date();
    await tracked.save().catch(() => {});
    await deleteTrackedAvatar(tracked, { deleteFile });
    throw err;
  }
  if (!updated) {
    tracked.state = "deletion-pending";
    tracked.nextAttemptAt = new Date();
    await tracked.save();
    await deleteTrackedAvatar(tracked, { deleteFile });
    const error = new Error("avatar changed concurrently; retry with the current profile");
    error.status = 409;
    throw error;
  }

  await AvatarObject.updateOne(
    { _id: tracked._id },
    { $set: { state: "active", activatedAt: new Date() } }
  );
  if (oldAvatar.storageKey && oldAvatar.storageKey !== result.key) {
    const oldTracked = await markForDeletion(oldAvatar, {
      ownerType,
      ownerId: current._id,
      avatarVersion: expectedVersion
    });
    if (oldTracked) await deleteTrackedAvatar(oldTracked, { deleteFile });
  }
  return updated;
}

async function cleanupPendingAvatars(now = new Date()) {
  const pending = await AvatarObject.find({
    state: "deletion-pending",
    nextAttemptAt: { $lte: now }
  }).sort({ nextAttemptAt: 1 }).limit(200);
  const results = await Promise.all(pending.map(deleteTrackedAvatar));
  return results.filter(Boolean).length;
}

async function ownerReferences(record) {
  const model = record.ownerType === "group" ? Group : User;
  return model.exists({
    _id: record.ownerId,
    avatarStorageKey: record.storageKey,
    avatarVersion: record.avatarVersion
  });
}

async function cleanupStaleUploadedAvatars({
  now = new Date(),
  headObject = headFromR2,
  deleteFile = deleteUploadedFile,
  limit = 200
} = {}) {
  const owner = `${process.pid}:${crypto.randomBytes(12).toString("base64url")}`;
  let activated = 0;
  let deleted = 0;
  let retried = 0;
  for (let index = 0; index < limit; index += 1) {
    const claimed = await AvatarObject.findOneAndUpdate({
      state: "uploaded",
      uploadedAt: { $lte: new Date(now.getTime() - UPLOADED_GRACE_MS) },
      nextAttemptAt: { $lte: now },
      $or: [
        { leaseExpiresAt: null },
        { leaseExpiresAt: { $exists: false } },
        { leaseExpiresAt: { $lte: now } }
      ]
    }, { $set: {
      leaseOwner: owner,
      leaseExpiresAt: new Date(now.getTime() + LEASE_MS)
    } }, { returnDocument: "after", sort: { uploadedAt: 1 } });
    if (!claimed) break;

    let objectExists = false;
    try {
      await headObject(claimed.storageKey, { storageClass: "public-avatar" });
      objectExists = true;
    } catch (error) {
      if (![404].includes(Number(error?.upstreamStatus || error?.status))) {
        const attempts = Number(claimed.attempts || 0) + 1;
        await AvatarObject.updateOne(
          { _id: claimed._id, state: "uploaded", leaseOwner: owner },
          { $set: {
            state: attempts >= MAX_DELETE_ATTEMPTS ? "dead-letter" : "uploaded",
            nextAttemptAt: new Date(now.getTime() + Math.min(24 * 60 * 60 * 1000, 1000 * (2 ** attempts))),
            lastErrorCode: String(error.code || "avatar_head_failed").slice(0, 80),
            leaseOwner: "",
            leaseExpiresAt: null
          }, $inc: { attempts: 1 } }
        );
        retried += 1;
        continue;
      }
    }

    if (objectExists && await ownerReferences(claimed)) {
      const result = await AvatarObject.updateOne(
        { _id: claimed._id, state: "uploaded", leaseOwner: owner },
        { $set: {
          state: "active",
          activatedAt: now,
          lastErrorCode: "",
          leaseOwner: "",
          leaseExpiresAt: null
        } }
      );
      activated += result.modifiedCount;
      continue;
    }

    const pending = await AvatarObject.findOneAndUpdate(
      { _id: claimed._id, state: "uploaded", leaseOwner: owner },
      { $set: {
        state: "deletion-pending",
        nextAttemptAt: now,
        leaseOwner: "",
        leaseExpiresAt: null
      } },
      { returnDocument: "after" }
    );
    if (pending && await deleteTrackedAvatar(pending, { deleteFile })) deleted += 1;
  }
  return { activated, deleted, retried };
}

async function referencedAvatarKeys() {
  const [users, groups] = await Promise.all([
    User.find({ avatarStorageKey: { $ne: "" } }, "avatarStorageKey").lean(),
    Group.find({ avatarStorageKey: { $ne: "" } }, "avatarStorageKey").lean()
  ]);
  return new Set([...users, ...groups].map(item => item.avatarStorageKey).filter(Boolean));
}

async function inspectDetachedAvatars({
  prefix = "liotan/",
  now = new Date(),
  maxObjects = 10_000,
  listObjects = listR2Objects
} = {}) {
  const referenced = await referencedAvatarKeys();
  const tracked = new Set(
    (await AvatarObject.find({ state: { $ne: "deleted" } }, "storageKey").lean())
      .map(item => item.storageKey)
  );
  const detached = [];
  let continuationToken = "";
  do {
    const page = await listObjects({
      prefix,
      continuationToken,
      storageClass: "public-avatar"
    });
    for (const object of page.objects || []) {
      const modifiedAt = new Date(object.lastModified || 0).getTime();
      if (!referenced.has(object.key) && !tracked.has(object.key) &&
        modifiedAt > 0 && now.getTime() - modifiedAt >= ORPHAN_GRACE_MS) {
        detached.push(object.key);
        if (detached.length >= maxObjects) break;
      }
    }
    continuationToken = detached.length < maxObjects && page.isTruncated
      ? String(page.nextContinuationToken || "")
      : "";
  } while (continuationToken);
  return detached;
}

async function cleanupDetachedAvatars(options = {}) {
  const detached = await inspectDetachedAvatars(options);
  if (options.dryRun === true) {
    return { found: detached.length, deleted: 0, keys: detached };
  }
  let deleted = 0;
  for (const key of detached) {
    try {
      await (options.deleteObject || deleteFromR2)(key, { storageClass: "public-avatar" });
      deleted += 1;
    } catch {
      // The next reconciliation pass retries; detached keys are never removed
      // from the report merely because a provider call failed.
    }
  }
  return { found: detached.length, deleted, keys: detached };
}

module.exports = {
  replaceAvatar,
  cleanupPendingAvatars,
  cleanupStaleUploadedAvatars,
  inspectDetachedAvatars,
  cleanupDetachedAvatars,
  deleteTrackedAvatar
};
