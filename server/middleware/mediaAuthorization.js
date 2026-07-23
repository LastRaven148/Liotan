"use strict";

const { MAX_ENCRYPTED_MEDIA_SIZE } = require("./uploadSecurity");
const { isUuid } = require("../security/cryptoV4");
const {
  authorizedClientIds,
  clientIdsHash,
  normalizeClientIds
} = require("../security/cryptoRosterState");
const { assertConversationAccess } = require("../controllers/cryptoV4/shared");
const AttachmentUpload = require("../models/AttachmentUpload");
const {
  reserveMediaTransfer,
  releaseMediaTransfer
} = require("../services/mediaQuota");

const BINDING_ID_RE = /^[A-Za-z0-9_-]{22,96}$/;
const HASH_RE = /^[A-Za-z0-9_-]{43}$/;

async function authorizeMediaUpload(req, res, next) {
  try {
    const signedBody = req.cryptoSignedBody || {};
    const metadata = {
      conversationId: String(signedBody.conversationId || ""),
      bindingId: String(signedBody.bindingId || ""),
      ciphertextHash: String(signedBody.ciphertextHash || ""),
      clientMessageId: String(signedBody.clientMessageId || "").toLowerCase(),
      declaredBytes: Number(signedBody.bytes)
    };
    if (
      !BINDING_ID_RE.test(metadata.bindingId) ||
      !HASH_RE.test(metadata.ciphertextHash) ||
      !isUuid(metadata.clientMessageId) ||
      !Number.isSafeInteger(metadata.declaredBytes) ||
      metadata.declaredBytes <= 0 ||
      metadata.declaredBytes > MAX_ENCRYPTED_MEDIA_SIZE
    ) {
      return res.status(400).json({ error: "invalid encrypted media binding" });
    }

    const conversation = await assertConversationAccess(req, metadata.conversationId);
    const activeIds = normalizeClientIds(conversation.activeClientIds);
    const policyIds = authorizedClientIds(conversation);
    if (
      !conversation.initialized ||
      conversation.blockedForEpochChange ||
      clientIdsHash(activeIds) !== clientIdsHash(policyIds) ||
      !activeIds.includes(req.cryptoDevice.clientId) ||
      !policyIds.includes(req.cryptoDevice.clientId)
    ) {
      return res.status(409).json({ error: "MLS conversation is not ready for media" });
    }
    if (await AttachmentUpload.exists({
      cryptoConversationId: metadata.conversationId,
      bindingId: metadata.bindingId
    })) {
      return res.status(409).json({ error: "encrypted media binding already used" });
    }

    req.cryptoMediaUpload = { ...metadata, conversation };
    return next();
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return next(err);
  }
}

async function reserveMediaUpload(req, res, next) {
  try {
    const quota = await reserveMediaTransfer(req, {
      direction: "upload",
      bytes: req.cryptoMediaUpload.declaredBytes,
      conversationId: req.cryptoMediaUpload.conversationId
    });
    req.mediaQuotaReservation = quota;

    let settled = false;
    const release = () => {
      if (settled) return;
      settled = true;
      releaseMediaTransfer(quota.reservationId).catch(() => {});
    };
    res.once("finish", release);
    res.once("close", release);
    req.settleMediaQuota = () => {
      settled = true;
      res.off("finish", release);
      res.off("close", release);
    };
    return next();
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return next(err);
  }
}

module.exports = {
  authorizeMediaUpload,
  reserveMediaUpload
};
