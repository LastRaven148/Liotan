const fs = require("fs").promises;
const privacy = require("../config/privacy");
const { uploadToR2, getFromR2 } = require("../utils/uploadToR2");
const {
  normalizeMime,
  assertAllowedAttachment,
  assertSafeFileBuffer,
  hasEncryptedAttachmentExtension
} = require("../middleware/uploadSecurity");
const { hmac } = require("../utils/privacy");
const { sanitizeAttachmentName } = require("../utils/attachmentSafety");
const { findAccessibleAttachment, safeUploadId } = require("../services/attachmentAccess");
const {
  publicAttachmentView,
  registerAttachmentUpload
} = require("../services/attachmentOwnership");

async function removeTempFile(file) {
  if (!file?.path) return;
  try { await fs.unlink(file.path); } catch {}
}

function fixFileName(name) {
  if (!name) return "file";
  try {
    const fixed = Buffer.from(name, "latin1").toString("utf8");
    return sanitizeAttachmentName(fixed && !fixed.includes("�") ? fixed : name);
  } catch {
    return sanitizeAttachmentName(name);
  }
}

function getAttachmentType(mimeType = "", fileName = "") {
  if (hasEncryptedAttachmentExtension(fileName)) {
    return "file";
  }
  if (mimeType.startsWith("image/")) return "photo";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

function getUploadOwnerSegment(req) {
  if (privacy.anonymizeUploadFolders) {
    return hmac(req.user?.userId || req.user?.username || "user").slice(0, 32);
  }

  return String(req.user?.username || "user")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 40);
}

function getFolder(type, ownerSegment = "user") {
  const safeOwner = String(ownerSegment || "user")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 64);

  if (type === "photo") return `liotan/u/${safeOwner}/photos`;
  if (type === "video") return `liotan/u/${safeOwner}/videos`;
  if (type === "audio") return `liotan/u/${safeOwner}/audio`;
  return `liotan/u/${safeOwner}/files`;
}

async function signAttachmentUpload(req, res) {
  res.status(410).json({
    error: "direct upload disabled"
  });
}


async function readMagicBytes(file) {
  if (file.buffer) return file.buffer;
  if (!file.path) return Buffer.alloc(0);
  const handle = await fs.open(file.path, "r");
  try {
    const buffer = Buffer.alloc(64);
    const { bytesRead } = await handle.read(buffer, 0, 64, 0);
    return buffer.slice(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function uploadAttachment(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: "no file" });

    const mimeType = normalizeMime(req.file.mimetype);
    const fixedName = fixFileName(req.file.originalname);

    assertAllowedAttachment({ mimeType, fileName: fixedName, size: req.file.size });

    const encryptedUpload = hasEncryptedAttachmentExtension(fixedName);

    if (!encryptedUpload) {
      const magic = await readMagicBytes(req.file);
      assertSafeFileBuffer({ buffer: magic, mimeType });
    }

    const type = getAttachmentType(mimeType, fixedName);
    const result = await uploadToR2(req.file, {
      folder: getFolder(type, getUploadOwnerSegment(req)),
      attachmentType: type,
      mimeType
    });

    const upload = await registerAttachmentUpload({
      owner: req.user.username,
      result,
      name: fixedName,
      type,
      mimeType: encryptedUpload ? "application/octet-stream" : mimeType,
      size: req.file.size,
      encrypted: encryptedUpload
    });

    res.json(publicAttachmentView(upload));
  } catch (err) {
    next(err);
  } finally {
    await removeTempFile(req.file);
  }
}

async function downloadAttachment(req, res, next) {
  try {
    const uploadId = safeUploadId(req.params.uploadId);
    const access = await findAccessibleAttachment({
      uploadId,
      username: req.user?.username
    });

    if (!access) {
      return res.status(404).json({ error: "media not found" });
    }

    const attachment = access.attachment;
    const contentType = attachment.mimeType || "application/octet-stream";
    const rangeHeader = String(req.headers.range || "").trim();
    const safeRange = /^bytes=\d*-\d*$/.test(rangeHeader) ? rangeHeader : "";
    const object = await getFromR2(attachment.storageKey, { range: safeRange });
    const statusCode = object.statusCode === 206 ? 206 : 200;

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Accept-Ranges", "bytes");
    if (object.headers?.["content-range"]) {
      res.setHeader("Content-Range", object.headers["content-range"]);
    }
    if (object.headers?.["content-length"]) {
      res.setHeader("Content-Length", object.headers["content-length"]);
    } else {
      res.setHeader("Content-Length", String(object.buffer.length));
    }

    return res.status(statusCode).send(object.buffer);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadAttachment,
  downloadAttachment,
  signAttachmentUpload,
  fixFileName,
  getAttachmentType
};
