"use strict";

const AvatarObject = require("../models/AvatarObject");
const User = require("../models/User");
const Group = require("../models/Group");
const deleteUploadedFile = require("../utils/deleteUploadedFile");
const { listR2Objects, deleteFromR2 } = require("../utils/uploadToR2");

const MAX_DELETE_ATTEMPTS = 12;
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

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
  try {
    await deleteFile({
      url: record.url,
      storageKey: record.storageKey,
      storageType: record.storageType
    }, { strict: true });
    await AvatarObject.updateOne(
      { _id: record._id, state: "deletion-pending" },
      {
        $set: {
          state: "deleted",
          deletedAt: new Date(),
          lastErrorCode: ""
        }
      }
    );
    return true;
  } catch (err) {
    const attempts = Number(record.attempts || 0) + 1;
    await AvatarObject.updateOne(
      { _id: record._id, state: "deletion-pending" },
      {
        $set: {
          state: attempts >= MAX_DELETE_ATTEMPTS ? "dead-letter" : "deletion-pending",
          nextAttemptAt: new Date(Date.now() + Math.min(24 * 60 * 60 * 1000, 1000 * (2 ** attempts))),
          lastErrorCode: String(err.code || "avatar_delete_failed").slice(0, 80)
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
  inspectDetachedAvatars,
  cleanupDetachedAvatars,
  deleteTrackedAvatar
};
