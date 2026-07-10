const path = require("path");
const fs = require("fs/promises");
const logger = require("./logger");
const AttachmentUpload = require("../models/AttachmentUpload");
const { deleteFromR2 } = require("./uploadToR2");

const uploadsDir = path.resolve(__dirname, "..", "uploads");

function normalizeValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeR2Key(key) {
  const clean = normalizeValue(key).replace(/^\/+/, "");
  if (!clean || clean.includes("..")) return "";
  return clean;
}

function getPublicR2BaseUrl() {
  return normalizeValue(process.env.R2_AVATAR_PUBLIC_URL).replace(/\/+$/, "");
}

function storageClassFor(file) {
  if (file?.storageType === "r2:public-avatar") return "public-avatar";
  const publicBase = getPublicR2BaseUrl();
  return publicBase && String(file?.url || "").startsWith(`${publicBase}/`)
    ? "public-avatar"
    : "private-media";
}

function extractR2KeyFromUrl(fileUrl) {
  const rawUrl = normalizeValue(fileUrl);
  if (!rawUrl) return "";

  const publicBase = getPublicR2BaseUrl();

  try {
    if (publicBase && rawUrl.startsWith(`${publicBase}/`)) {
      const parsed = new URL(rawUrl);
      return normalizeR2Key(decodeURIComponent(parsed.pathname.replace(/^\/+/, "")));
    }

    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();

    if (host === "media.liotan.com" || host === "media.liotan.ru") {
      return normalizeR2Key(decodeURIComponent(parsed.pathname.replace(/^\/+/, "")));
    }
  } catch (err) {
    return "";
  }

  return "";
}

async function deleteLocalFile(fileUrl) {
  try {
    if (!fileUrl || !fileUrl.startsWith("/uploads/")) return;

    const relative = fileUrl.replace("/uploads/", "");
    const filePath = path.resolve(uploadsDir, relative);

    if (!filePath.startsWith(uploadsDir + path.sep)) return;

    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== "ENOENT") {
      logger.warn("delete local file failed", { code: err.code });
    }
  }
}

function collectAttachmentIds(file) {
  const uploadId = normalizeValue(file?.uploadId || file?.mediaId);
  const mediaUrl = normalizeValue(file?.mediaUrl || file?.url);

  return {
    uploadId,
    mediaId: uploadId,
    url: mediaUrl
  };
}

async function removeAttachmentUploadMetadata(file, storageKeys) {
  const ids = collectAttachmentIds(file);
  const or = [];

  if (ids.uploadId) {
    or.push({ uploadId: ids.uploadId });
    or.push({ mediaUrl: `/attachments/${encodeURIComponent(ids.uploadId)}/download` });
  }

  if (ids.url) {
    or.push({ url: ids.url });
    or.push({ mediaUrl: ids.url });
  }

  for (const key of storageKeys) {
    or.push({ storageKey: key });
  }

  if (!or.length) return;

  try {
    await AttachmentUpload.deleteMany({ $or: or });
  } catch (err) {
    logger.warn("delete attachment upload metadata failed", { code: err.code });
  }
}

async function deleteUploadedFile(file) {
  if (!file) return { deletedR2: 0, deletedLocal: false };

  if (typeof file === "string") {
    await deleteLocalFile(file);
    const key = extractR2KeyFromUrl(file);
    if (key) {
      try {
        await deleteFromR2(key, { storageClass: "public-avatar" });
        return { deletedR2: 1, deletedLocal: false };
      } catch (err) {
        logger.warn("delete R2 file failed", { code: err.code, status: err.status });
      }
    }
    return { deletedR2: 0, deletedLocal: true };
  }

  const storageKeys = new Set();
  const directKey = normalizeR2Key(file.storageKey);
  const urlKey = extractR2KeyFromUrl(file.url);
  const mediaUrlKey = extractR2KeyFromUrl(file.mediaUrl);

  if (directKey) storageKeys.add(directKey);
  if (urlKey) storageKeys.add(urlKey);
  if (mediaUrlKey) storageKeys.add(mediaUrlKey);

  let deletedR2 = 0;

  for (const key of storageKeys) {
    try {
      await deleteFromR2(key, { storageClass: storageClassFor(file) });
      deletedR2 += 1;
    } catch (err) {
      logger.warn("delete R2 file failed", { code: err.code, status: err.status });
    }
  }

  await removeAttachmentUploadMetadata(file, storageKeys);

  if (file.url) {
    await deleteLocalFile(file.url);
  }

  if (file.mediaUrl && file.mediaUrl !== file.url) {
    await deleteLocalFile(file.mediaUrl);
  }

  return {
    deletedR2,
    deletedLocal: Boolean(file.url || file.mediaUrl)
  };
}

module.exports = deleteUploadedFile;
module.exports.extractR2KeyFromUrl = extractR2KeyFromUrl;
module.exports.normalizeR2Key = normalizeR2Key;
