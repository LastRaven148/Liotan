const crypto = require("crypto");
const AttachmentUpload = require("../models/AttachmentUpload");
const { sanitizeAttachment } = require("../utils/attachmentSecurity");

const UPLOAD_TTL_MS = 1000 * 60 * 60 * 24;

function createUploadId() {
  return crypto.randomBytes(24).toString("base64url");
}

function getExpiresAt() {
  return new Date(Date.now() + UPLOAD_TTL_MS);
}

function publicAttachmentView(upload) {
  return {
    uploadId: upload.uploadId,
    url: upload.url,
    name: upload.name,
    type: upload.type,
    mimeType: upload.mimeType,
    size: upload.size,
    width: upload.width || 0,
    height: upload.height || 0,
    duration: upload.duration || 0
  };
}

async function registerAttachmentUpload({ owner, result, name, type, mimeType, size }) {
  const upload = await AttachmentUpload.create({
    uploadId: createUploadId(),
    owner,
    url: result.url,
    name,
    type,
    mimeType,
    size,
    width: result.width || 0,
    height: result.height || 0,
    duration: result.duration || 0,
    storageKey: result.key,
    storageType: result.storageType || "auto",
    expiresAt: getExpiresAt()
  });

  return upload;
}

async function resolveOwnedAttachment(input, owner) {
  const sanitized = sanitizeAttachment(input);
  if (!sanitized) return null;

  const uploadId = String(input?.uploadId || sanitized.uploadId || "").trim();
  if (!uploadId) return null;

  const upload = await AttachmentUpload.findOne({
    uploadId,
    owner,
    usedAt: null,
    expiresAt: { $gt: new Date() }
  }).lean();

  if (!upload) return null;

  const isEncryptedClientView = Boolean(sanitized.e2eeMedia?.v);

  if (upload.url !== sanitized.url) {
    return null;
  }

  if (!isEncryptedClientView && (
    upload.name !== sanitized.name ||
    upload.type !== sanitized.type ||
    upload.mimeType !== sanitized.mimeType ||
    Number(upload.size || 0) !== Number(sanitized.size || 0)
  )) {
    return null;
  }

  return {
    ...sanitized,
    storageKey: upload.storageKey,
    storageType: upload.storageType || "auto"
  };
}

async function markAttachmentUploadUsed(input, owner) {
  const uploadId = String(input?.uploadId || "").trim();
  if (!uploadId) return;

  await AttachmentUpload.updateOne(
    {
      uploadId,
      owner,
      usedAt: null
    },
    {
      $set: {
        usedAt: new Date()
      }
    }
  );
}

module.exports = {
  publicAttachmentView,
  registerAttachmentUpload,
  resolveOwnedAttachment,
  markAttachmentUploadUsed
};
