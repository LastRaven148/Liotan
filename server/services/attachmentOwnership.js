const crypto = require("crypto");
const AttachmentUpload = require("../models/AttachmentUpload");
const { sanitizeAttachment } = require("../utils/attachmentSecurity");

const UPLOAD_TTL_MS = Number(process.env.ATTACHMENT_UPLOAD_RECORD_TTL_MS) || 1000 * 60 * 60 * 24 * 7;

function createUploadId() {
  return crypto.randomBytes(24).toString("base64url");
}

function getExpiresAt() {
  return new Date(Date.now() + UPLOAD_TTL_MS);
}

function isEncryptedUpload(upload) {
  return upload?.encrypted === true || upload?.mimeType === "application/octet-stream";
}

function mediaDownloadPath(uploadId) {
  return `/attachments/${encodeURIComponent(uploadId)}/download`;
}

function publicAttachmentView(upload) {
  const encrypted = isEncryptedUpload(upload);

  return {
    uploadId: upload.uploadId,
    mediaId: upload.uploadId,
    url: mediaDownloadPath(upload.uploadId),
    name: encrypted ? "Liotan encrypted media" : upload.name,
    type: encrypted ? "file" : upload.type,
    mimeType: encrypted ? "application/octet-stream" : upload.mimeType,
    size: encrypted ? 0 : Number(upload.size) || 0,
    width: encrypted ? 0 : upload.width || 0,
    height: encrypted ? 0 : upload.height || 0,
    duration: encrypted ? 0 : upload.duration || 0
  };
}

async function registerAttachmentUpload({
  owner,
  result,
  name,
  type,
  mimeType,
  size,
  encrypted = false,
  protocol = "legacy-v3",
  cryptoConversationId = "",
  cryptoClientId = "",
  bindingId = "",
  ciphertextHash = "",
  boundClientMessageId = "",
  commitTokenHash = "",
  deleteTokenHash = "",
  lifecycleState = "temporary"
}) {
  const upload = await AttachmentUpload.create({
    uploadId: createUploadId(),
    owner,
    url: "",
    mediaUrl: mediaDownloadPath("pending"),
    name: encrypted ? "Liotan encrypted media" : name,
    type: encrypted ? "file" : type,
    mimeType: encrypted ? "application/octet-stream" : mimeType,
    size: encrypted ? 0 : size,
    encrypted,
    protocol,
    cryptoConversationId,
    cryptoClientId,
    bindingId,
    ciphertextHash,
    boundClientMessageId,
    commitTokenHash,
    deleteTokenHash,
    lifecycleState,
    width: encrypted ? 0 : result.width || 0,
    height: encrypted ? 0 : result.height || 0,
    duration: encrypted ? 0 : result.duration || 0,
    storageKey: result.key,
    storageType: result.storageType || "auto",
    expiresAt: getExpiresAt()
  });

  upload.mediaUrl = mediaDownloadPath(upload.uploadId);
  await upload.save();

  return upload;
}

async function resolveOwnedAttachment(input, owner) {
  const sanitized = sanitizeAttachment(input);
  if (!sanitized) return null;

  const uploadId = String(input?.uploadId || input?.mediaId || sanitized.uploadId || sanitized.mediaId || "").trim();
  if (!uploadId) return null;

  const upload = await AttachmentUpload.findOne({
    uploadId,
    owner,
    encrypted: true,
    usedAt: null,
    expiresAt: { $gt: new Date() }
  }).lean();

  if (!upload) return null;

  const expectedUrl = mediaDownloadPath(upload.uploadId);
  const isEncryptedClientView = Boolean(sanitized.e2eeMedia?.v);

  if (sanitized.url !== expectedUrl) {
    return null;
  }

  if (!isEncryptedClientView || !isEncryptedUpload(upload)) {
    return null;
  }

  if (!isEncryptedClientView) {
    if (
      upload.name !== sanitized.name ||
      upload.type !== sanitized.type ||
      upload.mimeType !== sanitized.mimeType ||
      Number(upload.size || 0) !== Number(sanitized.size || 0)
    ) {
      return null;
    }
  }

  return {
    ...sanitized,
    uploadId: upload.uploadId,
    mediaId: upload.uploadId,
    url: expectedUrl,
    name: isEncryptedClientView ? sanitized.name : upload.name,
    type: isEncryptedClientView ? "file" : (sanitized.type || upload.type),
    mimeType: isEncryptedClientView ? "application/octet-stream" : upload.mimeType,
    size: isEncryptedClientView ? 0 : sanitized.size,
    width: isEncryptedClientView ? 0 : sanitized.width,
    height: isEncryptedClientView ? 0 : sanitized.height,
    duration: isEncryptedClientView ? 0 : sanitized.duration,
    waveform: isEncryptedClientView ? [] : sanitized.waveform,
    storageKey: upload.storageKey,
    storageType: upload.storageType || "auto"
  };
}

async function markAttachmentUploadUsed(input, owner) {
  const uploadId = String(input?.uploadId || input?.mediaId || "").trim();
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
  markAttachmentUploadUsed,
  mediaDownloadPath
};
