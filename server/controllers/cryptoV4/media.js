"use strict";

const AttachmentUpload = require("../../models/AttachmentUpload");
const { uploadToR2, streamFromR2, deleteFromR2 } = require("../../utils/uploadToR2");
const { registerAttachmentUpload } = require("../../services/attachmentOwnership");
const { sha256Base64Url } = require("../../security/cryptoV4");
const { randomId } = require("./shared");
const { MAX_ENCRYPTED_MEDIA_SIZE } = require("../../middleware/uploadSecurity");
const {
  reserveMediaTransfer,
  completeMediaTransfer,
  releaseMediaTransfer
} = require("../../services/mediaQuota");

async function removeTempFile(file) {
  if (typeof file?.removeManagedFile !== "function") return;
  try { await file.removeManagedFile(); } catch {}
}

async function uploadMedia(req, res, next) {
  let uploadedObject = null;
  let createdUpload = null;
  let quotaCompleted = false;
  try {
    const {
      conversationId,
      bindingId,
      ciphertextHash,
      clientMessageId,
      declaredBytes
    } = req.cryptoMediaUpload;
    if (!req.file || req.file.mimetype !== "application/octet-stream" || !String(req.file.originalname || "").endsWith(".liotanmedia")) {
      return res.status(415).json({ error: "MLS ciphertext media required" });
    }
    if (declaredBytes !== req.file.size) {
      return res.status(400).json({ error: "invalid encrypted media binding" });
    }
    const actualHash = String(req.file.ciphertextHash || "");
    if (!/^[A-Za-z0-9_-]{43}$/.test(actualHash)) {
      return res.status(400).json({ error: "encrypted media hash unavailable" });
    }
    if (actualHash !== ciphertextHash) return res.status(400).json({ error: "encrypted media hash mismatch" });
    const result = await uploadToR2(req.file, {
      folder: `liotan/mls/${sha256Base64Url(Buffer.from(conversationId)).slice(0, 32)}`,
      mimeType: "application/octet-stream",
      storageClass: "private-media"
    });
    uploadedObject = result;
    const uploadCommitToken = randomId(32);
    const uploadDeleteToken = randomId(32);
    const upload = await registerAttachmentUpload({
      owner: req.user.username,
      result,
      name: "Liotan MLS encrypted media",
      type: "file",
      mimeType: "application/octet-stream",
      size: req.file.size,
      ciphertextBytes: req.file.size,
      encrypted: true,
      protocol: "mls-media-1",
      cryptoConversationId: conversationId,
      cryptoClientId: req.cryptoDevice.clientId,
      bindingId,
      ciphertextHash,
      boundClientMessageId: clientMessageId,
      commitTokenHash: sha256Base64Url(Buffer.from(uploadCommitToken, "utf8")),
      deleteTokenHash: sha256Base64Url(Buffer.from(uploadDeleteToken, "utf8")),
      lifecycleState: "temporary"
    });
    createdUpload = upload;
    const completed = await completeMediaTransfer(
      req.mediaQuotaReservation.reservationId,
      req.file.size,
      { uploadId: upload.uploadId }
    );
    if (!completed) throw new Error("media quota reservation expired before upload completion");
    quotaCompleted = true;
    req.settleMediaQuota?.();
    const response = res.status(201).json({
      uploadId: upload.uploadId,
      uploadCommitToken,
      uploadDeleteToken,
      bindingId,
      ciphertextHash,
      bytes: req.file.size,
      protocol: "mls-media-1"
    });
    uploadedObject = null;
    return response;
  } catch (err) {
    if (createdUpload?._id && !quotaCompleted) {
      await AttachmentUpload.deleteOne({ _id: createdUpload._id }).catch(() => {});
    }
    if (uploadedObject?.key && !quotaCompleted) {
      try {
        await deleteFromR2(uploadedObject.key, { storageClass: "private-media" });
      } catch {
        // The scheduled detached-object audit is the final recovery layer when
        // both metadata creation and immediate compensation fail.
      }
    }
    if (req.mediaQuotaReservation?.reservationId) {
      await releaseMediaTransfer(req.mediaQuotaReservation.reservationId).catch(() => {});
      req.settleMediaQuota?.();
    }
    if (err.status) return res.status(err.status).json({ error: err.message });
    return next(err);
  } finally {
    await removeTempFile(req.file);
  }
}

const MAX_RANGE_BYTES = 8 * 1024 * 1024;

function parseRangeForQuota(rangeHeader, totalBytes) {
  if (!rangeHeader) return { range: "", bytes: totalBytes };
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match || (!match[1] && !match[2])) return null;
  if (match[1]) {
    const start = Number(match[1]);
    const requestedEnd = match[2] ? Number(match[2]) : Math.min(totalBytes - 1, start + MAX_RANGE_BYTES - 1);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) ||
      start < 0 || requestedEnd < start || start >= totalBytes) return null;
    const end = Math.min(requestedEnd, totalBytes - 1);
    if (end - start + 1 > MAX_RANGE_BYTES) return null;
    return { range: `bytes=${start}-${end}`, bytes: end - start + 1 };
  }
  const suffix = Number(match[2]);
  if (!Number.isSafeInteger(suffix) || suffix <= 0 || suffix > MAX_RANGE_BYTES) return null;
  return { range: `bytes=-${Math.min(suffix, totalBytes)}`, bytes: Math.min(suffix, totalBytes) };
}

async function downloadMedia(req, res, next) {
  let quota = null;
  try {
    const uploadId = String(req.params.uploadId || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
    const upload = await AttachmentUpload.findOne({
      uploadId,
      protocol: "mls-media-1",
      encrypted: true,
      lifecycleState: { $in: ["committed", "legacy-unverified"] }
    }).lean();
    if (!upload) return res.status(404).json({ error: "media not found" });
    const conversation = await assertConversationAccess(req, upload.cryptoConversationId);
    const activeIds = normalizeClientIds(conversation.activeClientIds);
    const policyIds = authorizedClientIds(conversation);
    if (!activeIds.includes(req.cryptoDevice.clientId) || !policyIds.includes(req.cryptoDevice.clientId)) {
      return res.status(403).json({ error: "crypto device is not an active MLS member" });
    }
    const totalBytes = Number(upload.ciphertextBytes) > 0
      ? Number(upload.ciphertextBytes)
      : MAX_ENCRYPTED_MEDIA_SIZE;
    const parsedRange = parseRangeForQuota(String(req.headers.range || "").trim(), totalBytes);
    if (!parsedRange) {
      res.setHeader("Content-Range", `bytes */${totalBytes}`);
      return res.status(416).json({ error: "invalid or excessive encrypted media range" });
    }
    quota = await reserveMediaTransfer(req, {
      direction: "download",
      bytes: parsedRange.bytes,
      conversationId: upload.cryptoConversationId,
      uploadId: upload.uploadId
    });
    await streamFromR2(upload.storageKey, res, {
      range: parsedRange.range,
      storageClass: "private-media",
      onResponse: object => {
        res.status(object.statusCode === 206 ? 206 : 200);
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Cache-Control", "private, no-store, max-age=0");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Disposition", "attachment; filename=liotan-encrypted-media.bin");
        res.setHeader("Accept-Ranges", "bytes");
        if (object.headers?.["content-range"]) res.setHeader("Content-Range", object.headers["content-range"]);
        if (object.headers?.["content-length"]) res.setHeader("Content-Length", object.headers["content-length"]);
      }
    });
    await completeMediaTransfer(quota.reservationId, parsedRange.bytes);
    quota = null;
    return undefined;
  } catch (err) {
    if (quota?.reservationId) {
      await releaseMediaTransfer(quota.reservationId).catch(() => {});
    }
    if (err.status) return res.status(err.status).json({ error: err.message });
    return next(err);
  }
}

module.exports = {
  uploadMedia,
  downloadMedia
};
