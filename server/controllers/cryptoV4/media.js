"use strict";

const crypto = require("crypto");
const fs = require("fs/promises");
const AttachmentUpload = require("../../models/AttachmentUpload");
const { uploadToR2, streamFromR2 } = require("../../utils/uploadToR2");
const { registerAttachmentUpload } = require("../../services/attachmentOwnership");
const { sha256Base64Url } = require("../../security/cryptoV4");
const { canonicalJson } = require("../../utils/canonicalJson");
const { assertConversationAccess } = require("./shared");

const BINDING_ID_RE = /^[A-Za-z0-9_-]{22,96}$/;
const MLS_MEDIA_MAGIC = Buffer.from("LIOTANMLS1\0\0", "binary");

async function hashFile(filePath) {
  const handle = await fs.open(filePath, "r");
  const hash = crypto.createHash("sha256");
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    return hash.digest("base64url");
  } finally {
    await handle.close();
  }
}

async function removeTempFile(file) {
  if (!file?.path) return;
  try { await fs.unlink(file.path); } catch {}
}

async function uploadMedia(req, res, next) {
  try {
    if (!req.cryptoSignedBody || canonicalJson(req.body || {}) !== canonicalJson(req.cryptoSignedBody)) {
      return res.status(400).json({ error: "multipart fields do not match the signed crypto body" });
    }
    if (!req.file || req.file.mimetype !== "application/octet-stream" || !String(req.file.originalname || "").endsWith(".liotanmedia")) {
      return res.status(415).json({ error: "MLS ciphertext media required" });
    }
    const conversationId = String(req.body.conversationId || "");
    const bindingId = String(req.body.bindingId || "");
    const ciphertextHash = String(req.body.ciphertextHash || "");
    const declaredBytes = Number(req.body.bytes);
    if (!BINDING_ID_RE.test(bindingId) || !/^[A-Za-z0-9_-]{43}$/.test(ciphertextHash) ||
      !Number.isSafeInteger(declaredBytes) || declaredBytes !== req.file.size) {
      return res.status(400).json({ error: "invalid encrypted media binding" });
    }
    const conversation = await assertConversationAccess(req, conversationId);
    if (!conversation.initialized || conversation.blockedForEpochChange || !conversation.activeClientIds.includes(req.cryptoDevice.clientId)) {
      return res.status(409).json({ error: "MLS conversation is not ready for media" });
    }
    const actualHash = await hashFile(req.file.path);
    if (actualHash !== ciphertextHash) return res.status(400).json({ error: "encrypted media hash mismatch" });
    const handle = await fs.open(req.file.path, "r");
    let magic;
    try {
      magic = Buffer.alloc(MLS_MEDIA_MAGIC.length);
      const result = await handle.read(magic, 0, magic.length, 0);
      if (result.bytesRead !== MLS_MEDIA_MAGIC.length || !crypto.timingSafeEqual(magic, MLS_MEDIA_MAGIC)) {
        return res.status(415).json({ error: "invalid MLS media ciphertext framing" });
      }
    } finally {
      await handle.close();
    }
    if (await AttachmentUpload.exists({ cryptoConversationId: conversationId, bindingId })) {
      return res.status(409).json({ error: "encrypted media binding already used" });
    }
    const result = await uploadToR2(req.file, {
      folder: `liotan/mls/${sha256Base64Url(Buffer.from(conversationId)).slice(0, 32)}`,
      mimeType: "application/octet-stream",
      storageClass: "private-media"
    });
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
      ciphertextHash
    });
    return res.status(201).json({
      uploadId: upload.uploadId,
      bindingId,
      ciphertextHash,
      bytes: req.file.size,
      protocol: "mls-media-1"
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return next(err);
  } finally {
    await removeTempFile(req.file);
  }
}

async function downloadMedia(req, res, next) {
  try {
    const uploadId = String(req.params.uploadId || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
    const upload = await AttachmentUpload.findOne({ uploadId, protocol: "mls-media-1", encrypted: true }).lean();
    if (!upload) return res.status(404).json({ error: "media not found" });
    const conversation = await assertConversationAccess(req, upload.cryptoConversationId);
    if (!conversation.activeClientIds.includes(req.cryptoDevice.clientId)) {
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
