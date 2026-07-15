"use strict";

const CryptoIdentity = require("../../models/CryptoIdentity");
const CryptoDevice = require("../../models/CryptoDevice");
const CryptoKeyPackage = require("../../models/CryptoKeyPackage");
const { transitionUserConversations } = require("../../security/cryptoRosterState");
const {
  decodeBase64Url, sha256Base64Url, verifyEd25519, parseClientId,
  isUuid, isDeviceId, cryptoDomain, isFreshIsoDate
} = require("../../security/cryptoV4");
const { canonicalJson } = require("../../utils/canonicalJson");
const {
  getIdentityForUser, identityView, deviceView, safeB64, emitCryptoRosterChanged
} = require("./shared");

const MAX_KEY_PACKAGE_BYTES = 64 * 1024;

async function bootstrap(req, res, next) {
  try {
    const identity = await getIdentityForUser(req.user);
    const deviceId = String(req.query.deviceId || "").toLowerCase();
    const device = isDeviceId(deviceId)
      ? await CryptoDevice.findOne({ userId: req.user.userId, deviceId }).lean()
      : null;

    return res.json({
      protocol: "mls-1.0",
      cipherSuite: 1,
      domain: cryptoDomain(),
      identity: identityView(identity),
      device: device ? deviceView(device) : null,
      recovery: {
        serverEscrow: false,
        passwordDerivedKeysAccepted: false
      }
    });
  } catch (err) {
    return next(err);
  }
}

async function pinIdentity(req, res, next) {
  try {
    const identity = await getIdentityForUser(req.user);
    const cryptoUserId = String(req.body.cryptoUserId || "").toLowerCase();
    const rootPublicKey = String(req.body.rootPublicKey || "");
    const proof = req.body.proof;

    decodeBase64Url(rootPublicKey, 32, "root public key");
    if (!isUuid(cryptoUserId) || cryptoUserId !== identity.cryptoUserId || !proof || !isFreshIsoDate(proof.createdAt)) {
      return res.status(400).json({ error: "invalid identity proof" });
    }

    const proofValue = {
      cryptoUserId,
      username: req.user.username,
      rootPublicKey,
      createdAt: String(proof.createdAt),
      nonce: String(proof.nonce || "")
    };
    if (!/^[A-Za-z0-9_-]{22,96}$/.test(proofValue.nonce) || !verifyEd25519({
      publicKey: rootPublicKey,
      signature: proof.signature,
      value: proofValue,
      domain: "liotan-account-root-v1"
    })) {
      return res.status(400).json({ error: "invalid identity proof" });
    }

    if (identity.rootPublicKey && identity.rootPublicKey !== rootPublicKey) {
      return res.status(409).json({
        error: "account root already pinned; verified recovery reset required",
        rootFingerprint: identity.rootFingerprint
      });
    }

    const fingerprint = sha256Base64Url(decodeBase64Url(rootPublicKey, 32, "root public key"));
    const updated = await CryptoIdentity.findOneAndUpdate(
      { _id: identity._id, $or: [{ rootPublicKey: "" }, { rootPublicKey }] },
      { $set: { rootPublicKey, rootFingerprint: fingerprint, rootCreatedAt: new Date(proof.createdAt) } },
      { returnDocument: "after" }
    );
    if (!updated) return res.status(409).json({ error: "account root pin race rejected" });
    return res.status(identity.rootPublicKey ? 200 : 201).json({ ok: true, identity: identityView(updated) });
  } catch (err) {
    if (err instanceof TypeError) return res.status(400).json({ error: err.message });
    return next(err);
  }
}

async function registerDevice(req, res, next) {
  try {
    const identity = await getIdentityForUser(req.user);
    const manifest = req.body.manifest;
    const signature = String(req.body.signature || "");
    if (!identity.rootPublicKey || !manifest || typeof manifest !== "object") {
      return res.status(409).json({ error: "account root must be pinned first" });
    }

    const parsed = parseClientId(manifest.clientId, cryptoDomain());
    const expiresAt = Date.parse(String(manifest.expiresAt || ""));
    const createdAt = Date.parse(String(manifest.createdAt || ""));
    if (
      manifest.v !== 1 ||
      parsed.cryptoUserId !== identity.cryptoUserId ||
      parsed.deviceId !== String(manifest.deviceId || "").toLowerCase() ||
      manifest.cryptoUserId !== identity.cryptoUserId ||
      manifest.username !== req.user.username ||
      !Number.isFinite(createdAt) || Math.abs(Date.now() - createdAt) > 10 * 60 * 1000 ||
      !Number.isFinite(expiresAt) || expiresAt < Date.now() + 24 * 60 * 60 * 1000 || expiresAt > Date.now() + 400 * 24 * 60 * 60 * 1000
    ) {
      return res.status(400).json({ error: "invalid device manifest" });
    }
    decodeBase64Url(manifest.requestPublicKey, 32, "request public key");
    decodeBase64Url(manifest.credentialThumbprint, 32, "credential thumbprint");
    if (!verifyEd25519({
      publicKey: identity.rootPublicKey,
      signature,
      value: manifest,
      domain: "liotan-device-manifest-v1"
    })) {
      return res.status(400).json({ error: "invalid device manifest signature" });
    }

    const existing = await CryptoDevice.findOne({ userId: req.user.userId, deviceId: parsed.deviceId });
    if (!existing && await CryptoDevice.countDocuments({ userId: req.user.userId, status: "active" }) >= 20) {
      return res.status(409).json({ error: "active crypto device limit reached; revoke an old device first" });
    }
    if (existing && (
      existing.clientId !== manifest.clientId ||
      existing.requestPublicKey !== manifest.requestPublicKey ||
      existing.credentialThumbprint !== manifest.credentialThumbprint
    )) {
      return res.status(409).json({ error: "device id already bound to different keys" });
    }
    if (existing?.status === "revoked") {
      return res.status(409).json({ error: "revoked device id cannot be reused" });
    }

    let rosterConversations = [];
    if (!existing || existing.status !== "active") {
      rosterConversations = await transitionUserConversations(req.user.userId, {
        addClientIds: [manifest.clientId],
        reason: "cryptographic device registered"
      });
    }

    const device = await CryptoDevice.findOneAndUpdate(
      { userId: req.user.userId, deviceId: parsed.deviceId },
      {
        $setOnInsert: {
          userId: req.user.userId,
          username: req.user.username,
          cryptoUserId: identity.cryptoUserId,
          deviceId: parsed.deviceId,
          clientId: manifest.clientId,
          requestPublicKey: manifest.requestPublicKey,
          credentialThumbprint: manifest.credentialThumbprint
        },
        $set: {
          manifest,
          manifestSignature: signature,
          manifestExpiresAt: new Date(expiresAt),
          lastSeenAt: new Date(),
          status: "active",
          revokedAt: null
        }
      },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
    );
    if (rosterConversations.length) emitCryptoRosterChanged(req, rosterConversations);
    return res.status(existing ? 200 : 201).json({ ok: true, device: deviceView(device) });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "device registration conflict" });
    if (err instanceof TypeError) return res.status(400).json({ error: err.message });
    return next(err);
  }
}

async function publishKeyPackages(req, res, next) {
  try {
    const identity = await CryptoIdentity.findOne({ userId: req.user.userId }).lean();
    const batch = req.body.batch;
    const signature = String(req.body.signature || "");
    if (!identity?.rootPublicKey || !batch || typeof batch !== "object" || batch.v !== 1) {
      return res.status(400).json({ error: "invalid key package batch" });
    }
    if (
      batch.cryptoUserId !== identity.cryptoUserId ||
      batch.deviceId !== req.cryptoDevice.deviceId ||
      batch.clientId !== req.cryptoDevice.clientId ||
      !Array.isArray(batch.packages) || !batch.packages.length || batch.packages.length > 100
    ) {
      return res.status(400).json({ error: "invalid key package batch" });
    }
    const expiresAt = Date.parse(String(batch.expiresAt || ""));
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now() + 24 * 60 * 60 * 1000 || expiresAt > Date.now() + 100 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: "invalid key package expiry" });
    }
    if (!verifyEd25519({
      publicKey: identity.rootPublicKey,
      signature,
      value: batch,
      domain: "liotan-key-package-batch-v1"
    })) {
      return res.status(400).json({ error: "invalid key package batch signature" });
    }

    const batchHash = sha256Base64Url(Buffer.from(canonicalJson(batch), "utf8"));
    const documents = batch.packages.map(item => {
      const payload = safeB64(item.payload, MAX_KEY_PACKAGE_BYTES, "key package");
      const packageHash = sha256Base64Url(decodeBase64Url(payload, undefined, "key package"));
      if (item.packageHash !== packageHash) throw new TypeError("key package hash mismatch");
      return {
        userId: req.user.userId,
        cryptoUserId: identity.cryptoUserId,
        deviceId: req.cryptoDevice.deviceId,
        clientId: req.cryptoDevice.clientId,
        packageHash,
        payload,
        batchHash,
        batchSignature: signature,
        expiresAt: new Date(expiresAt)
      };
    });
    const uniqueHashes = new Set(documents.map(item => item.packageHash));
    if (uniqueHashes.size !== documents.length) return res.status(400).json({ error: "duplicate key package" });

    try {
      await CryptoKeyPackage.insertMany(documents, { ordered: true });
    } catch (err) {
      if (err?.code === 11000) return res.status(409).json({ error: "key package already published" });
      throw err;
    }
    return res.status(201).json({ ok: true, accepted: documents.length });
  } catch (err) {
    if (err instanceof TypeError) return res.status(400).json({ error: err.message });
    return next(err);
  }
}

async function keyPackageStatus(req, res, next) {
  try {
    const available = await CryptoKeyPackage.countDocuments({
      clientId: req.cryptoDevice.clientId,
      claimedAt: null,
      expiresAt: { $gt: new Date(Date.now() + 24 * 60 * 60 * 1000) }
    });
    return res.json({ available: Math.min(available, 1000) });
  } catch (err) {
    return next(err);
  }
}

async function revokeDevice(req, res, next) {
  try {
    const targetDeviceId = String(req.params.deviceId || "").toLowerCase();
    const identity = await CryptoIdentity.findOne({ userId: req.user.userId });
    const revocation = req.body.revocation;
    if (!identity?.rootPublicKey || !isDeviceId(targetDeviceId) || !revocation ||
      revocation.cryptoUserId !== identity.cryptoUserId || revocation.deviceId !== targetDeviceId ||
      !isFreshIsoDate(revocation.revokedAt) || !/^[A-Za-z0-9_-]{22,96}$/.test(String(revocation.nonce || "")) ||
      !verifyEd25519({
        publicKey: identity.rootPublicKey,
        signature: req.body.signature,
        value: revocation,
        domain: "liotan-device-revocation-v1"
      })) {
      return res.status(400).json({ error: "invalid device revocation" });
    }

    const targetDevice = await CryptoDevice.findOne({
      userId: req.user.userId,
      deviceId: targetDeviceId,
      status: "active"
    }, "clientId").lean();
    if (!targetDevice) return res.status(404).json({ error: "active crypto device not found" });
    const conversations = await transitionUserConversations(req.user.userId, {
      removeClientIds: [targetDevice.clientId],
      reason: "cryptographic device revoked"
    });
    const device = await CryptoDevice.findOneAndUpdate(
      { userId: req.user.userId, deviceId: targetDeviceId, status: "active" },
      { $set: { status: "revoked", revokedAt: new Date(revocation.revokedAt) } },
      { returnDocument: "after" }
    );
    if (!device) return res.status(409).json({ error: "crypto device changed during revocation" });
    await CryptoKeyPackage.deleteMany({ clientId: device.clientId, claimedAt: null });
    emitCryptoRosterChanged(req, conversations);
    return res.json({ ok: true, device: deviceView(device), conversationsBlocked: true });
  } catch (err) {
    if (err instanceof TypeError) return res.status(400).json({ error: err.message });
    return next(err);
  }
}

async function listDevices(req, res, next) {
  try {
    const devices = await CryptoDevice.find({ userId: req.user.userId })
      .sort({ lastSeenAt: -1 })
      .limit(50)
      .lean();
    return res.json({ devices: devices.map(deviceView) });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  bootstrap,
  pinIdentity,
  registerDevice,
  publishKeyPackages,
  keyPackageStatus,
  revokeDevice,
  listDevices
};
