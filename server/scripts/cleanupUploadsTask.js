const path =
  require("path");

const fs =
  require("fs/promises");

const User =
  require("../models/User");

const Message =
  require("../models/Messages");

const Group =
  require("../models/Group");

const AttachmentUpload =
  require("../models/AttachmentUpload");

const { deleteFromR2 } =
  require("../utils/uploadToR2");
const {
  cleanupPendingAvatars,
  cleanupDetachedAvatars
} = require("../services/avatarLifecycle");
const {
  releaseAndDeleteMediaUpload,
  releaseExpiredMediaTransfers
} = require("../services/mediaQuota");

const uploadsDir =
  path.resolve(
    __dirname,
    "..",
    "uploads"
  );

function safeChildPath(parent, name) {
  if (typeof name !== "string" || name.includes("/") || name.includes("\\")) {
    throw new Error("Unsafe filesystem entry name");
  }

  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(resolvedParent, name);
  const relative = path.relative(resolvedParent, resolvedChild);

  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Refusing to traverse outside uploads root");
  }

  return resolvedChild;
}

function urlToPath(fileUrl) {

  if (
    !fileUrl ||
    !fileUrl.startsWith("/uploads/")
  ) {
    return null;
  }

  const relative =
    fileUrl.replace(
      "/uploads/",
      ""
    );

  const filePath =
    path.resolve(
      uploadsDir,
      relative
    );

  if (
    !filePath.startsWith(
      uploadsDir + path.sep
    )
  ) {
    return null;
  }

  return filePath;

}

async function walk(dir) {

  const result = [];

  try {

    const entries =
      await fs.readdir(
        dir,
        {
          withFileTypes: true
        }
      );

    for (const entry of entries) {

      const fullPath =
        safeChildPath(
          dir,
          entry.name
        );

      if (entry.isDirectory()) {
        result.push(
          ...(await walk(fullPath))
        );
      } else {
        result.push(fullPath);
      }

    }

  } catch (err) {

    if (err.code !== "ENOENT") {
      throw err;
    }

  }

  return result;

}

async function cleanupR2OrphanUploads({ deleteObject = deleteFromR2, now = new Date() } = {}) {

  const orphanUploads = await AttachmentUpload.find({
    $or: [
      { lifecycleState: "temporary", expiresAt: { $lte: now } },
      { lifecycleState: "deletion-pending" }
    ],
    storageType: /^r2(?::|$)/,
    storageKey: { $type: "string", $ne: "" }
  }).limit(200);

  let deleted = 0;

  for (const upload of orphanUploads) {
    try {
      await deleteObject(upload.storageKey, { storageClass: "private-media" });
      await releaseAndDeleteMediaUpload(upload.uploadId);
      deleted += 1;
    } catch (err) {
      await AttachmentUpload.updateOne(
        { _id: upload._id },
        { $inc: { cleanupAttempts: 1 }, $set: { cleanupLastErrorAt: new Date() } }
      );
      console.warn("R2 attachment cleanup failed", {
        uploadId: upload.uploadId,
        attempt: Number(upload.cleanupAttempts || 0) + 1,
        error: err.message
      });
    }
  }

  return deleted;
}

async function cleanupUploads() {

  const usedFiles =
    new Set();

  const users =
    await User.find(
      {},
      "avatar"
    );

  for (const user of users) {
    const filePath =
      urlToPath(user.avatar);

    if (filePath) {
      usedFiles.add(filePath);
    }
  }

  const messages =
    await Message.find(
      {},
      "attachment.url"
    );

  for (const message of messages) {
    const filePath =
      urlToPath(
        message.attachment?.url
      );

    if (filePath) {
      usedFiles.add(filePath);
    }
  }

  const groups =
    await Group.find(
      {},
      "avatar"
    );

  for (const group of groups) {
    const filePath =
      urlToPath(group.avatar);

    if (filePath) {
      usedFiles.add(filePath);
    }
  }

  const allFiles =
    await walk(uploadsDir);

  let deleted = 0;

  for (const filePath of allFiles) {

    if (usedFiles.has(filePath)) {
      continue;
    }

    await fs.unlink(filePath);
    deleted += 1;

    console.log(
      "Deleted:",
      filePath
    );

  }

  const deletedR2Orphans =
    await cleanupR2OrphanUploads();
  const deletedTrackedAvatars = await cleanupPendingAvatars();
  const detachedAvatarResult = process.env.AVATAR_ORPHAN_CLEANUP_ENABLED === "true"
    ? await cleanupDetachedAvatars()
    : { found: 0, deleted: 0 };
  const expiredMediaReservations = await releaseExpiredMediaTransfers();

  console.log(
    `Cleanup finished. Deleted local files: ${deleted}. Deleted R2 orphan uploads: ${deletedR2Orphans}. Deleted tracked avatars: ${deletedTrackedAvatars}. Deleted detached avatars: ${detachedAvatarResult.deleted}. Released media reservations: ${expiredMediaReservations}`
  );

  return {
    ok: true,
    deleted,
    deletedR2Orphans,
    deletedTrackedAvatars,
    detachedAvatars: detachedAvatarResult,
    expiredMediaReservations
  };

}

module.exports =
  cleanupUploads;

module.exports.cleanupR2OrphanUploads = cleanupR2OrphanUploads;
