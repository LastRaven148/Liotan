const fs = require("fs").promises;
const cloudinary = require("../config/cloudinary");
const privacy = require("../config/privacy");
const uploadToCloudinary = require("../utils/uploadToCloudinary");
const {
  normalizeMime,
  assertAllowedAttachment,
  assertSafeFileBuffer,
  hasEncryptedAttachmentExtension
} = require("../middleware/uploadSecurity");
const { hmac } = require("../utils/privacy");
const { sanitizeAttachmentName } = require("../utils/attachmentSafety");
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

function getAttachmentType(mimeType = "") {
  if (mimeType.startsWith("image/")) return "photo";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

function getResourceType(type) {
  if (type === "photo") return "image";
  if (type === "video" || type === "audio") return "video";
  return "raw";
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

    if (!hasEncryptedAttachmentExtension(fixedName)) {
      const magic = await readMagicBytes(req.file);
      assertSafeFileBuffer({ buffer: magic, mimeType });
    }

    const type = getAttachmentType(mimeType);
    const result = await uploadToCloudinary(req.file, {
      folder: getFolder(type, getUploadOwnerSegment(req)),
      resourceType: getResourceType(type),
      attachmentType: type
    });

    const upload = await registerAttachmentUpload({
      owner: req.user.username,
      result,
      name: fixedName,
      type,
      mimeType,
      size: req.file.size
    });

    res.json(publicAttachmentView(upload));
  } catch (err) {
    next(err);
  } finally {
    await removeTempFile(req.file);
  }
}

module.exports = {
  uploadAttachment,
  signAttachmentUpload,
  fixFileName,
  getAttachmentType
};
