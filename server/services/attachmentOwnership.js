const crypto = require("crypto");
const AttachmentUpload = require("../models/AttachmentUpload");

const UPLOAD_TTL_MS = Number(process.env.ATTACHMENT_UPLOAD_RECORD_TTL_MS) || 1000 * 60 * 60 * 24 * 7;

function createUploadId() {
  return crypto.randomBytes(24).toString("base64url");
}

function getExpiresAt() {
  return new Date(Date.now() + UPLOAD_TTL_MS);
}

function mediaDownloadPath(uploadId) {
  return `/attachments/${encodeURIComponent(uploadId)}/download`;
}

async function registerAttachmentUpload({
  owner,
  result,
  ciphertextBytes = 0,
  encrypted = true,
  protocol = "mls-media-1",
  cryptoConversationId = "",
  cryptoClientId = "",
  bindingId = "",
  ciphertextHash = "",
  boundClientMessageId = "",
  commitTokenHash = "",
  deleteTokenHash = "",
  lifecycleState = "temporary"
}) {
  if (!encrypted || protocol !== "mls-media-1") {
    throw new TypeError("only MLS v4 encrypted media may be registered");
  }
  const upload = await AttachmentUpload.create({
    uploadId: createUploadId(),
    owner,
    url: "",
    mediaUrl: mediaDownloadPath("pending"),
    name: "Liotan encrypted media",
    type: "file",
    mimeType: "application/octet-stream",
    size: 0,
    ciphertextBytes,
    encrypted: true,
    protocol: "mls-media-1",
    cryptoConversationId,
    cryptoClientId,
    bindingId,
    ciphertextHash,
    boundClientMessageId,
    commitTokenHash,
    deleteTokenHash,
    lifecycleState,
    width: 0,
    height: 0,
    duration: 0,
    storageKey: result.key,
    storageType: result.storageType || "auto",
    expiresAt: getExpiresAt()
  });

  upload.mediaUrl = mediaDownloadPath(upload.uploadId);
  await upload.save();

  return upload;
}

module.exports = {
  registerAttachmentUpload,
  mediaDownloadPath
};
