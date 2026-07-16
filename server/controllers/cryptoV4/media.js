"use strict";

const fs = require("fs/promises");
const AttachmentUpload = require("../../models/AttachmentUpload");
const { uploadToR2, streamFromR2, deleteFromR2 } = require("../../utils/uploadToR2");
const { registerAttachmentUpload } = require("../../services/attachmentOwnership");
const { sha256Base64Url, isUuid } = require("../../security/cryptoV4");
const { randomId } = require("./shared");
const { authorizedClientIds, clientIdsHash, normalizeClientIds } = require("../../security/cryptoRosterState");
const { assertConversationAccess } = require("./shared");

const BINDING_ID_RE = /^[A-Za-z0-9_-]{22,96}$/;
async function removeTempFile(file) {
  if (!file?.path) return;
  try { await fs.unlink(file.path); } catch {}
}

async function uploadMedia(req, res, next) {
  let uploadedObject = null;
  try {
    const signedBody = req.cryptoSignedBody;
    const conversationId = String(signedBody.conversationId || "");
    const bindingId = String(signedBody.bindingId || "");
    const ciphertextHash = String(signedBody.ciphertextHash || "");
    const clientMessageId = String(signedBody.clientMessageId || "").toLowerCase();
    const declaredBytes = Number(signedBody.bytes);
    if (!BINDING_ID_RE.test(bindingId) || !isUuid(clientMessageId) || !/^[A-Za-z0-9_-]{43}$/.test(ciphertextHash) ||
      !Number.isSafeInteger(declaredBytes) || declaredBytes <= 0) {
      return res.status(400).json({ error: "invalid encrypted media binding" });
    }
    const conversation = await assertConversationAccess(req, conversationId);
    const activeIds = normalizeClientIds(conversation.activeClientIds);
    const policyIds = authorizedClientIds(conversation);
    if (!conversation.initialized || conversation.blockedForEpochChange ||
      clientIdsHash(activeIds) !== clientIdsHash(policyIds) ||
      !activeIds.includes(req.cryptoDevice.clientId) || !policyIds.includes(req.cryptoDevice.clientId)) {
      return res.status(409).json({ error: "MLS conversation is not ready for media" });
    }
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
    if (await AttachmentUpload.exists({ cryptoConversationId: conversationId, bindingId })) {
      return res.status(409).json({ error: "encrypted media binding already used" });
    }
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
    uploadedObject = null;
    return res.status(201).json({
      uploadId: upload.uploadId,
      uploadCommitToken,
      uploadDeleteToken,
      bindingId,
      ciphertextHash,
      bytes: req.file.size,
      protocol: "mls-media-1"
    });
  } catch (err) {
    if (uploadedObject?.key) {
      try {
        await deleteFromR2(uploadedObject.key, { storageClass: "private-media" });
      } catch {
        // The scheduled detached-object audit is the final recovery layer when
        // both metadata creation and immediate compensation fail.
      }
    }
    if (err.status) return res.status(err.status).json({ error: err.message });
    return next(err);
  } finally {
    await removeTempFile(req.file);
  }
}

async function downloadMedia(req, res, next) {
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
    const rangeHeader = String(req.headers.range || "").trim();
    const safeRange = /^bytes=\d*-\d*$/.test(rangeHeader) ? rangeHeader : "";
    await streamFromR2(upload.storageKey, res, {
      range: safeRange,
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
    return undefined;
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return next(err);
  }
}

module.exports = {
  uploadMedia,
  downloadMedia
};
