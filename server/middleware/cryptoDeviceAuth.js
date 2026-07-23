"use strict";

const CryptoDevice = require("../models/CryptoDevice");
const CryptoRequestNonce = require("../models/CryptoRequestNonce");
const { transitionUserConversations } = require("../security/cryptoRosterState");
const { canonicalJson } = require("../utils/canonicalJson");
const { decodeBase64Url, sha256Base64Url, verifyEd25519, isDeviceId } = require("../security/cryptoV4");
const { hashSessionId } = require("../utils/sessionSecurity");
const {
  requestSignatureInput,
  sessionBindingId
} = require("../security/deviceAuthProtocol");

const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000;
const NONCE_RE = /^[A-Za-z0-9_-]{22,96}$/;

function authenticatedBody(req) {
  const encoded = String(req.get("x-liotan-crypto-body") || "");
  if (!encoded) {
    if (/^multipart\/form-data(?:;|$)/i.test(String(req.get("content-type") || ""))) {
      throw new TypeError("signed crypto body required for multipart request");
    }
    req.cryptoSignedBody = req.body || {};
    return req.cryptoSignedBody;
  }
  if (encoded.length > 4096) throw new TypeError("invalid signed crypto body");
  const canonical = decodeBase64Url(encoded, 0, "signed crypto body").toString("utf8");
  const value = JSON.parse(canonical);
  if (!value || Array.isArray(value) || typeof value !== "object" || canonicalJson(value) !== canonical) {
    throw new TypeError("invalid signed crypto body");
  }
  req.cryptoSignedBody = value;
  return value;
}

async function cryptoDeviceAuth(req, res, next) {
  try {
    const deviceId = String(req.get("x-liotan-crypto-device") || "").toLowerCase();
    const timestampRaw = String(req.get("x-liotan-crypto-timestamp") || "");
    const nonce = String(req.get("x-liotan-crypto-nonce") || "");
    const signature = String(req.get("x-liotan-crypto-signature") || "");
    const timestamp = Number(timestampRaw);

    if (!isDeviceId(deviceId) || !Number.isInteger(timestamp) || Math.abs(Date.now() - timestamp) > MAX_CLOCK_SKEW_MS || !NONCE_RE.test(nonce)) {
      return res.status(401).json({ error: "valid crypto device signature required" });
    }

    const device = await CryptoDevice.findOne({
      userId: req.user.userId,
      username: req.user.username,
      deviceId,
      sessionIdHash: hashSessionId(req.user.sid),
      status: "active"
    });

    if (!device) return res.status(401).json({ error: "valid crypto device signature required" });
    const manifestExpiresAt = Date.parse(device.manifestExpiresAt || device.manifest?.expiresAt || "");
    if (!Number.isFinite(manifestExpiresAt) || manifestExpiresAt <= Date.now()) {
      await transitionUserConversations(req.user.userId, {
        removeClientIds: [device.clientId],
        reason: "cryptographic device manifest expired"
      });
      await CryptoDevice.updateOne({ _id: device._id, status: "active" }, {
        $set: { status: "expired", manifestExpiresAt: Number.isFinite(manifestExpiresAt) ? new Date(manifestExpiresAt) : null }
      });
      return res.status(401).json({ error: "crypto device manifest expired" });
    }

    const bodyHash = sha256Base64Url(Buffer.from(canonicalJson(authenticatedBody(req)), "utf8"));
    const bindingId = sessionBindingId(req.user.sid);
    if (Number(device.authVersion) === 2 && device.sessionBindingId !== bindingId) {
      return res.status(401).json({ error: "cryptographic device session binding changed" });
    }
    const signedInput = requestSignatureInput({
      method: String(req.method || "GET").toUpperCase(),
      path: String(req.originalUrl || req.url || ""),
      timestamp,
      nonce,
      bodyHash,
      deviceId,
      bindingId,
      authVersion: Number(device.authVersion) || 1
    });

    if (!verifyEd25519({
      publicKey: device.requestPublicKey,
      signature,
      value: signedInput.value,
      domain: signedInput.domain
    })) {
      return res.status(401).json({ error: "valid crypto device signature required" });
    }

    try {
      await CryptoRequestNonce.create({
        clientId: device.clientId,
        nonce,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      });
    } catch (err) {
      if (err?.code === 11000) return res.status(409).json({ error: "replayed crypto request" });
      throw err;
    }

    device.lastSeenAt = new Date();
    device.manifestExpiresAt = new Date(manifestExpiresAt);
    await device.save();
    req.cryptoDevice = device;
    return next();
  } catch (err) {
    if (err instanceof TypeError) return res.status(401).json({ error: "valid crypto device signature required" });
    return next(err);
  }
}

module.exports = cryptoDeviceAuth;
