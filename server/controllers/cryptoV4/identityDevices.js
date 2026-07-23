"use strict";

const crypto = require("crypto");
const mongoose = require("mongoose");
const CryptoIdentity = require("../../models/CryptoIdentity");
const CryptoDevice = require("../../models/CryptoDevice");
const CryptoDirectoryEntry = require("../../models/CryptoDirectoryEntry");
const CryptoKeyPackage = require("../../models/CryptoKeyPackage");
const ClientInvalidation = require("../../models/ClientInvalidation");
const CryptoDeviceSecurityEvent = require("../../models/CryptoDeviceSecurityEvent");
const Session = require("../../models/Session");
const { transitionUserConversations } = require("../../security/cryptoRosterState");
const {
  decodeBase64Url, sha256Base64Url, verifyEd25519, parseClientId,
  isUuid, isDeviceId, cryptoDomain, isFreshIsoDate
} = require("../../security/cryptoV4");
const { canonicalJson } = require("../../utils/canonicalJson");
const { hashSessionId } = require("../../utils/sessionSecurity");
const { disconnectSessionHash, userRoom } = require("../../sockets/sessionRegistry");
const {
  directoryDeviceCommitment,
  directoryStateView,
  validateDirectoryMutation
} = require("../../security/cryptoDirectoryState");
const {
  getIdentityForUser, identityView, deviceView, directoryLogView, safeB64, emitCryptoRosterChanged
} = require("./shared");
const {
  DEVICE_AUTH_PROTOCOL_V2,
  sessionBindingId,
  legacyEnrollmentAllowed
} = require("../../security/deviceAuthProtocol");

const MAX_KEY_PACKAGE_BYTES = 64 * 1024;
const DIRECTORY_LOG_WINDOW = 1024;
const MANIFEST_RENEWAL_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;

function encodeDeviceCursor(device) {
  return device ? Buffer.from(JSON.stringify({ createdAt: device.createdAt, id: device._id }), "utf8").toString("base64url") : "";
}

function decodeDeviceCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    const createdAt = new Date(parsed.createdAt);
    if (!mongoose.isValidObjectId(parsed.id) || !Number.isFinite(createdAt.getTime())) throw new Error();
    return { createdAt, id: new mongoose.Types.ObjectId(parsed.id) };
  } catch {
    const error = new Error("invalid cursor"); error.status = 400; throw error;
  }
}

async function createDeviceListInvalidation(req, session) {
  const devices = await CryptoDevice.find({
    userId: req.user.userId,
    status: "active",
    manifestExpiresAt: { $gt: new Date() }
  }, "clientId").session(session).lean();
  const [invalidation] = await ClientInvalidation.create([{
    eventId: crypto.randomBytes(24).toString("base64url"),
    recipientUserId: req.user.userId,
    kind: "device-list-updated",
    pendingClientIds: devices.map(device => device.clientId)
  }], { session });
  return invalidation;
}

function emitDeviceListUpdate(req, invalidation) {
  req.app.get("io")?.to(userRoom(String(req.user.userId))).emit("clientInvalidationAvailable", {
    eventId: invalidation.eventId,
    kind: invalidation.kind
  });
}

function securityEventView(event) {
  return {
    eventId: event.eventId,
    type: event.type,
    targetDeviceId: event.targetDeviceId,
    targetClientId: event.targetClientId,
    priorActiveDeviceCount: Number(event.priorActiveDeviceCount) || 0,
    createdAt: event.createdAt || null
  };
}

async function persistDirectoryHead(identity, verifiedDirectory, session) {
  const currentDirectory = directoryStateView(identity);
  const versionSelector = currentDirectory.version === 0
    ? { $or: [{ directoryVersion: 0 }, { directoryVersion: { $exists: false } }] }
    : { directoryVersion: currentDirectory.version, directoryHash: currentDirectory.hash };
  const directoryWrite = await CryptoIdentity.updateOne(
    { _id: identity._id, ...versionSelector },
    { $set: {
      directoryVersion: verifiedDirectory.statement.version,
      directoryHash: verifiedDirectory.hash,
      directoryStatement: verifiedDirectory.statement,
      directorySignature: verifiedDirectory.signature
    } },
    { session }
  );
  if (directoryWrite.modifiedCount !== 1) {
    const error = new Error("device directory changed concurrently"); error.status = 409; throw error;
  }
  await CryptoDirectoryEntry.create([{
    userId: identity.userId,
    cryptoUserId: identity.cryptoUserId,
    version: verifiedDirectory.statement.version,
    previousHash: verifiedDirectory.statement.previousHash,
    hash: verifiedDirectory.hash,
    statement: verifiedDirectory.statement,
    signature: verifiedDirectory.signature
  }], { session });
}

async function bootstrap(req, res, next) {
  try {
    const identity = await getIdentityForUser(req.user);
    const deviceId = String(req.query.deviceId || "").toLowerCase();
    const [devices, directoryEntries, securityEvents] = await Promise.all([
      CryptoDevice.find({ userId: req.user.userId }).sort({ createdAt: 1 }).lean(),
      CryptoDirectoryEntry.find({ userId: req.user.userId }).sort({ version: -1 }).limit(DIRECTORY_LOG_WINDOW).lean(),
      CryptoDeviceSecurityEvent.find({ userId: req.user.userId }).sort({ createdAt: -1 }).limit(50).lean()
    ]);
    const device = isDeviceId(deviceId)
      ? devices.find(item => item.deviceId === deviceId) || null
      : null;

    return res.json({
      protocol: "mls-1.0",
      cipherSuite: 1,
      domain: cryptoDomain(),
      identity: { ...identityView(identity), directoryLog: directoryLogView(directoryEntries) },
      device: device ? deviceView(device) : null,
      accountDevices: devices.map(deviceView),
      deviceCommitments: devices.map(directoryDeviceCommitment),
      securityEvents: securityEvents.map(securityEventView),
      recovery: {
        serverEscrow: false,
        passwordDerivedKeysAccepted: false
      },
      sessionBindingId: sessionBindingId(req.user.sid),
      deviceAuth: {
        currentVersion: 2,
        protocol: DEVICE_AUTH_PROTOCOL_V2,
        legacyEnrollmentCutoff: process.env.DEVICE_AUTH_V2_ENFORCED_AT || "2026-08-01T00:00:00.000Z"
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
  const session = await mongoose.startSession();
  try {
    const manifest = req.body.manifest;
    const signature = String(req.body.signature || "");
    const directoryUpdate = req.body.directoryUpdate;
    const directorySignature = String(req.body.directorySignature || "");
    const identity = await getIdentityForUser(req.user);
    if (!identity.rootPublicKey || !manifest || typeof manifest !== "object") {
      return res.status(409).json({ error: "account root must be pinned first" });
    }

    const parsed = parseClientId(manifest.clientId, cryptoDomain());
    const expiresAt = Date.parse(String(manifest.expiresAt || ""));
    const createdAt = Date.parse(String(manifest.createdAt || ""));
    const authVersion = Number(manifest.v);
    const expectedSessionBindingId = sessionBindingId(req.user.sid);
    if (
      ![1, 2].includes(authVersion) ||
      parsed.cryptoUserId !== identity.cryptoUserId ||
      parsed.deviceId !== String(manifest.deviceId || "").toLowerCase() ||
      manifest.cryptoUserId !== identity.cryptoUserId ||
      manifest.username !== req.user.username ||
      !Number.isFinite(createdAt) || Math.abs(Date.now() - createdAt) > 10 * 60 * 1000 ||
      !Number.isFinite(expiresAt) || expiresAt < Date.now() + 24 * 60 * 60 * 1000 || expiresAt > Date.now() + 400 * 24 * 60 * 60 * 1000
    ) {
      return res.status(400).json({ error: "invalid device manifest" });
    }
    if (authVersion === 1 && !legacyEnrollmentAllowed(new Date(createdAt))) {
      return res.status(426).json({ error: "device authentication v2 is required for new enrollment" });
    }
    if (authVersion === 2 && (
      manifest.authProtocol !== DEVICE_AUTH_PROTOCOL_V2 ||
      manifest.sessionBindingId !== expectedSessionBindingId
    )) {
      return res.status(400).json({ error: "invalid device session binding" });
    }
    decodeBase64Url(manifest.requestPublicKey, 32, "request public key");
    decodeBase64Url(manifest.credentialThumbprint, 32, "credential thumbprint");
    if (!verifyEd25519({
      publicKey: identity.rootPublicKey,
      signature,
      value: manifest,
      domain: authVersion === 2 ? "liotan-device-manifest-v2" : "liotan-device-manifest-v1"
    })) {
      return res.status(400).json({ error: "invalid device manifest signature" });
    }
    let device;
    let rosterConversations = [];
    let created = false;
    let deviceListInvalidation;
    await session.withTransaction(async () => {
      const currentIdentity = await CryptoIdentity.findById(identity._id).session(session);
      const devices = await CryptoDevice.find({ userId: req.user.userId }).session(session);
      const existing = devices.find(item => item.deviceId === parsed.deviceId) || null;
      if (!currentIdentity?.rootPublicKey || currentIdentity.rootPublicKey !== identity.rootPublicKey) {
        const error = new Error("account root changed during device registration"); error.status = 409; throw error;
      }
      if (!existing && devices.filter(item => ["active", "pending"].includes(item.status)).length >= 20) {
        const error = new Error("crypto device limit reached; revoke an old device first"); error.status = 409; throw error;
      }
      if (existing && (
        existing.clientId !== manifest.clientId ||
        existing.requestPublicKey !== manifest.requestPublicKey ||
        existing.credentialThumbprint !== manifest.credentialThumbprint
      )) {
        const error = new Error("device id already bound to different keys"); error.status = 409; throw error;
      }
      if (existing?.status === "revoked") {
        const error = new Error("revoked device id cannot be reused"); error.status = 409; throw error;
      }

      const activeCount = devices.filter(item => item.status === "active").length;
      const status = existing?.status === "active" || devices.length === 0 ? "active" : "pending";
      const activationMode = existing?.activationMode || (devices.length === 0
        ? "initial"
        : activeCount > 0 ? "device-approval" : "recovery-bootstrap");
      const approvalChallenge = status === "pending"
        ? existing?.approvalChallenge || crypto.randomBytes(32).toString("base64url")
        : "";
      const prospective = {
        ...(existing?.toObject?.() || {}),
        userId: req.user.userId,
        username: req.user.username,
        cryptoUserId: currentIdentity.cryptoUserId,
        deviceId: parsed.deviceId,
        clientId: manifest.clientId,
        requestPublicKey: manifest.requestPublicKey,
        authVersion,
        authProtocol: authVersion === 2 ? DEVICE_AUTH_PROTOCOL_V2 : "liotan-device-auth-v1",
        sessionBindingId: authVersion === 2 ? expectedSessionBindingId : "",
        authMigrationState: authVersion === 2 ? "v2-active" : "legacy",
        credentialThumbprint: manifest.credentialThumbprint,
        manifest,
        manifestSignature: signature,
        manifestExpiresAt: new Date(expiresAt),
        status,
        activationMode,
        approvalChallenge
      };
      const prospectiveDevices = devices
        .filter(item => item.deviceId !== parsed.deviceId)
        .map(item => item.toObject())
        .concat(prospective);
      const verifiedDirectory = validateDirectoryMutation({
        identity: currentIdentity,
        devices: prospectiveDevices,
        update: directoryUpdate,
        signature: directorySignature,
        action: "register-device",
        targetDeviceId: parsed.deviceId
      });

      device = await CryptoDevice.findOneAndUpdate(
        { userId: req.user.userId, deviceId: parsed.deviceId },
        {
          $setOnInsert: {
            userId: req.user.userId,
            username: req.user.username,
            cryptoUserId: currentIdentity.cryptoUserId,
            deviceId: parsed.deviceId,
            clientId: manifest.clientId,
            requestPublicKey: manifest.requestPublicKey,
            authVersion,
            authProtocol: authVersion === 2 ? DEVICE_AUTH_PROTOCOL_V2 : "liotan-device-auth-v1",
            sessionBindingId: authVersion === 2 ? expectedSessionBindingId : "",
            authMigrationState: authVersion === 2 ? "v2-active" : "legacy",
            credentialThumbprint: manifest.credentialThumbprint
          },
          $set: {
            manifest,
            manifestSignature: signature,
            manifestExpiresAt: new Date(expiresAt),
            lastSeenAt: new Date(),
            status,
            activationMode,
            approvalChallenge,
            sessionIdHash: hashSessionId(req.user.sid),
            revokedAt: null
          }
        },
        { returnDocument: "after", upsert: true, setDefaultsOnInsert: true, session }
      );
      created = !existing;
      await persistDirectoryHead(currentIdentity, verifiedDirectory, session);
      if (status === "active" && existing?.status !== "active") {
        rosterConversations = await transitionUserConversations(req.user.userId, {
          addClientIds: [manifest.clientId],
          reason: "cryptographic device registered",
          session
        });
      }
      deviceListInvalidation = await createDeviceListInvalidation(req, session);
    });
    if (rosterConversations.length) emitCryptoRosterChanged(req, rosterConversations);
    emitDeviceListUpdate(req, deviceListInvalidation);
    const updatedIdentity = await CryptoIdentity.findById(identity._id).lean();
    return res.status(created ? 201 : 200).json({
      ok: true,
      device: deviceView(device),
      directory: directoryStateView(updatedIdentity),
      approvalRequired: device.status === "pending",
      recoveryBootstrapRequired: device.status === "pending" && device.activationMode === "recovery-bootstrap"
    });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "device registration conflict" });
    if (err?.status) return res.status(err.status).json({ error: err.message });
    if (err instanceof TypeError) return res.status(400).json({ error: err.message });
    return next(err);
  } finally {
    await session.endSession();
  }
}

async function migrateDeviceAuthentication(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const targetDeviceId = String(req.params.deviceId || "").toLowerCase();
    const migration = req.body.migration;
    const oldProof = String(req.body.oldProof || "");
    const newProof = String(req.body.newProof || "");
    const manifest = req.body.manifest;
    const manifestSignature = String(req.body.manifestSignature || "");
    const expectedBindingId = sessionBindingId(req.user.sid);
    let migrated;
    let deviceListInvalidation;

    await session.withTransaction(async () => {
      const identity = await CryptoIdentity.findOne({ userId: req.user.userId }).session(session);
      const devices = await CryptoDevice.find({ userId: req.user.userId }).session(session);
      const target = devices.find(item => item.deviceId === targetDeviceId);
      const expiresAt = Date.parse(String(migration?.expiresAt || ""));
      if (!identity?.rootPublicKey || !target || target.status !== "active" ||
        target.clientId !== req.cryptoDevice.clientId ||
        Number(target.authVersion) !== 1) {
        const error = new Error("legacy current device is not available for authentication migration");
        error.status = 409;
        throw error;
      }
      if (!migration || migration.v !== 2 ||
        migration.action !== "migrate-device-auth" ||
        migration.protocol !== DEVICE_AUTH_PROTOCOL_V2 ||
        migration.cryptoUserId !== identity.cryptoUserId ||
        migration.deviceId !== target.deviceId ||
        migration.clientId !== target.clientId ||
        migration.oldRequestPublicKey !== target.requestPublicKey ||
        migration.newRequestPublicKey !== manifest?.requestPublicKey ||
        migration.sessionBindingId !== expectedBindingId ||
        !isFreshIsoDate(migration.createdAt) ||
        !Number.isFinite(expiresAt) || expiresAt <= Date.now() ||
        expiresAt > Date.now() + 10 * 60 * 1000 ||
        !/^[A-Za-z0-9_-]{22,96}$/.test(String(migration.nonce || ""))) {
        const error = new Error("invalid device authentication migration");
        error.status = 400;
        throw error;
      }
      decodeBase64Url(migration.newRequestPublicKey, 32, "new request public key");
      if (!verifyEd25519({
        publicKey: target.requestPublicKey,
        signature: oldProof,
        value: migration,
        domain: "liotan-device-auth-migration-v2"
      }) || !verifyEd25519({
        publicKey: migration.newRequestPublicKey,
        signature: newProof,
        value: migration,
        domain: "liotan-device-auth-migration-v2"
      })) {
        const error = new Error("device authentication migration requires old and new key proofs");
        error.status = 400;
        throw error;
      }
      const manifestExpiresAt = Date.parse(String(manifest?.expiresAt || ""));
      if (!manifest || manifest.v !== 2 ||
        manifest.authProtocol !== DEVICE_AUTH_PROTOCOL_V2 ||
        manifest.sessionBindingId !== expectedBindingId ||
        manifest.cryptoUserId !== target.cryptoUserId ||
        manifest.username !== target.username ||
        manifest.deviceId !== target.deviceId ||
        manifest.clientId !== target.clientId ||
        manifest.credentialThumbprint !== target.credentialThumbprint ||
        manifest.requestPublicKey !== migration.newRequestPublicKey ||
        manifest.createdAt !== target.manifest.createdAt ||
        !Number.isFinite(manifestExpiresAt) ||
        manifestExpiresAt < Date.now() + 24 * 60 * 60 * 1000 ||
        manifestExpiresAt > Date.now() + 400 * 24 * 60 * 60 * 1000 ||
        !verifyEd25519({
          publicKey: identity.rootPublicKey,
          signature: manifestSignature,
          value: manifest,
          domain: "liotan-device-manifest-v2"
        })) {
        const error = new Error("invalid v2 device manifest");
        error.status = 400;
        throw error;
      }

      const prospectiveTarget = {
        ...target.toObject(),
        requestPublicKey: migration.newRequestPublicKey,
        authVersion: 2,
        authProtocol: DEVICE_AUTH_PROTOCOL_V2,
        sessionBindingId: expectedBindingId,
        authMigrationState: "v2-active",
        authMigratedAt: new Date(),
        manifest,
        manifestSignature,
        manifestExpiresAt: new Date(manifestExpiresAt)
      };
      const prospectiveDevices = devices
        .filter(item => item.deviceId !== targetDeviceId)
        .map(item => item.toObject())
        .concat(prospectiveTarget);
      const verifiedDirectory = validateDirectoryMutation({
        identity,
        devices: prospectiveDevices,
        update: req.body.directoryUpdate,
        signature: req.body.directorySignature,
        action: "migrate-device-auth",
        targetDeviceId
      });
      migrated = await CryptoDevice.findOneAndUpdate(
        {
          _id: target._id,
          status: "active",
          authVersion: { $ne: 2 },
          requestPublicKey: target.requestPublicKey,
          sessionIdHash: hashSessionId(req.user.sid)
        },
        {
          $set: {
            requestPublicKey: migration.newRequestPublicKey,
            authVersion: 2,
            authProtocol: DEVICE_AUTH_PROTOCOL_V2,
            sessionBindingId: expectedBindingId,
            authMigrationState: "v2-active",
            authMigratedAt: new Date(),
            manifest,
            manifestSignature,
            manifestExpiresAt: new Date(manifestExpiresAt),
            lastSeenAt: new Date()
          }
        },
        { returnDocument: "after", session }
      );
      if (!migrated) {
        const error = new Error("device authentication changed during migration");
        error.status = 409;
        throw error;
      }
      await persistDirectoryHead(identity, verifiedDirectory, session);
      deviceListInvalidation = await createDeviceListInvalidation(req, session);
    });

    emitDeviceListUpdate(req, deviceListInvalidation);
    const updatedIdentity = await CryptoIdentity.findOne({ userId: req.user.userId }).lean();
    return res.json({
      ok: true,
      device: deviceView(migrated),
      directory: directoryStateView(updatedIdentity)
    });
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.message });
    if (err instanceof TypeError) return res.status(400).json({ error: err.message });
    return next(err);
  } finally {
    await session.endSession();
  }
}

async function approveDevice(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const targetDeviceId = String(req.params.deviceId || "").toLowerCase();
    const approval = req.body.approval;
    const approvalSignature = String(req.body.approvalSignature || "");
    let approvedDevice;
    let conversations = [];
    let deviceListInvalidation;
    await session.withTransaction(async () => {
      const identity = await CryptoIdentity.findOne({ userId: req.user.userId }).session(session);
      const devices = await CryptoDevice.find({ userId: req.user.userId }).session(session);
      const target = devices.find(item => item.deviceId === targetDeviceId);
      if (!identity?.rootPublicKey || !target || target.status !== "pending" ||
        target.activationMode !== "device-approval") {
        const error = new Error("pending crypto device approval not found"); error.status = 404; throw error;
      }
      if (req.cryptoDevice.clientId === target.clientId) {
        const error = new Error("a pending device cannot approve itself"); error.status = 403; throw error;
      }
      const expiresAt = Date.parse(String(approval?.expiresAt || ""));
      const useV2 = Number(approval?.v) === 2;
      if (Number(target.authVersion) === 2 && (
        !useV2 ||
        Number(req.cryptoDevice.authVersion) !== 2
      )) {
        const error = new Error("device authentication v2 approval is required");
        error.status = 426;
        throw error;
      }
      if (!useV2 && !legacyEnrollmentAllowed(target.createdAt)) {
        const error = new Error("legacy device approvals are no longer accepted");
        error.status = 426;
        throw error;
      }
      if (!approval || ![1, 2].includes(Number(approval.v)) ||
        approval.cryptoUserId !== identity.cryptoUserId ||
        approval.newDeviceId !== target.deviceId ||
        approval.newClientId !== target.clientId ||
        approval.requestPublicKey !== target.requestPublicKey ||
        approval.credentialThumbprint !== target.credentialThumbprint ||
        approval.challenge !== target.approvalChallenge ||
        approval.approverClientId !== req.cryptoDevice.clientId ||
        (useV2 && (
          approval.action !== "approve-device" ||
          approval.protocol !== DEVICE_AUTH_PROTOCOL_V2 ||
          approval.approverDeviceId !== req.cryptoDevice.deviceId ||
          approval.approverSessionBindingId !== sessionBindingId(req.user.sid) ||
          approval.newSessionBindingId !== target.sessionBindingId ||
          !isFreshIsoDate(approval.createdAt)
        )) ||
        !/^[A-Za-z0-9_-]{22,96}$/.test(String(approval.nonce || "")) ||
        !Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + 10 * 60 * 1000 ||
        !verifyEd25519({
          publicKey: req.cryptoDevice.requestPublicKey,
          signature: approvalSignature,
          value: approval,
          domain: useV2 ? "liotan-device-approval-v2" : "liotan-device-approval-v1"
        })) {
        const error = new Error("invalid cryptographic device approval"); error.status = 400; throw error;
      }
      const prospectiveTarget = {
        ...target.toObject(),
        status: "active",
        approval,
        approvalSignature,
        approvedByClientId: req.cryptoDevice.clientId,
        approvedAt: new Date(),
        approvalChallenge: ""
      };
      const prospectiveDevices = devices
        .filter(item => item.deviceId !== targetDeviceId)
        .map(item => item.toObject())
        .concat(prospectiveTarget);
      const verifiedDirectory = validateDirectoryMutation({
        identity,
        devices: prospectiveDevices,
        update: req.body.directoryUpdate,
        signature: req.body.directorySignature,
        action: "approve-device",
        targetDeviceId
      });
      approvedDevice = await CryptoDevice.findOneAndUpdate(
        { _id: target._id, status: "pending", approvalChallenge: target.approvalChallenge },
        { $set: {
          status: "active",
          approval,
          approvalSignature,
          approvedByClientId: req.cryptoDevice.clientId,
          approvedAt: new Date(),
          approvalChallenge: ""
        } },
        { returnDocument: "after", session }
      );
      if (!approvedDevice) {
        const error = new Error("pending device changed during approval"); error.status = 409; throw error;
      }
      await persistDirectoryHead(identity, verifiedDirectory, session);
      conversations = await transitionUserConversations(req.user.userId, {
        addClientIds: [target.clientId],
        reason: "cryptographic device approved",
        session
      });
      deviceListInvalidation = await createDeviceListInvalidation(req, session);
    });
    emitCryptoRosterChanged(req, conversations);
    emitDeviceListUpdate(req, deviceListInvalidation);
    return res.json({
      ok: true,
      device: deviceView(approvedDevice),
      conversationsBlocked: conversations.length,
      reconcileRequired: conversations.length > 0
    });
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.message });
    if (err instanceof TypeError) return res.status(400).json({ error: err.message });
    return next(err);
  } finally {
    await session.endSession();
  }
}

async function confirmRecoveryBootstrap(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const targetDeviceId = String(req.params.deviceId || "").toLowerCase();
    const confirmation = req.body.confirmation;
    const confirmationSignature = String(req.body.confirmationSignature || "");
    let activatedDevice;
    let conversations = [];
    let deviceListInvalidation;
    await session.withTransaction(async () => {
      const identity = await CryptoIdentity.findOne({ userId: req.user.userId }).session(session);
      const devices = await CryptoDevice.find({ userId: req.user.userId }).session(session);
      const target = devices.find(item => item.deviceId === targetDeviceId);
      const activeCount = devices.filter(item => item.status === "active").length;
      if (!identity?.rootPublicKey || !target || target.status !== "pending" ||
        target.activationMode !== "recovery-bootstrap" || activeCount !== 0) {
        const error = new Error("recovery bootstrap is not available for this device"); error.status = 409; throw error;
      }
      if (!confirmation || confirmation.v !== 1 || confirmation.warningAcknowledged !== true ||
        confirmation.cryptoUserId !== identity.cryptoUserId ||
        confirmation.deviceId !== target.deviceId ||
        confirmation.clientId !== target.clientId ||
        confirmation.challenge !== target.approvalChallenge ||
        !isFreshIsoDate(confirmation.timestamp) ||
        !/^[A-Za-z0-9_-]{22,96}$/.test(String(confirmation.nonce || "")) ||
        !verifyEd25519({
          publicKey: identity.rootPublicKey,
          signature: confirmationSignature,
          value: confirmation,
          domain: "liotan-recovery-bootstrap-v1"
        })) {
        const error = new Error("invalid recovery bootstrap confirmation"); error.status = 400; throw error;
      }
      const prospectiveTarget = {
        ...target.toObject(),
        status: "active",
        approval: confirmation,
        approvalSignature: confirmationSignature,
        approvedByClientId: "recovery-bootstrap",
        approvedAt: new Date(),
        approvalChallenge: ""
      };
      const prospectiveDevices = devices
        .filter(item => item.deviceId !== targetDeviceId)
        .map(item => item.toObject())
        .concat(prospectiveTarget);
      const verifiedDirectory = validateDirectoryMutation({
        identity,
        devices: prospectiveDevices,
        update: req.body.directoryUpdate,
        signature: req.body.directorySignature,
        action: "recovery-bootstrap",
        targetDeviceId
      });
      activatedDevice = await CryptoDevice.findOneAndUpdate(
        { _id: target._id, status: "pending", approvalChallenge: target.approvalChallenge },
        { $set: {
          status: "active",
          approval: confirmation,
          approvalSignature: confirmationSignature,
          approvedByClientId: "recovery-bootstrap",
          approvedAt: new Date(),
          approvalChallenge: ""
        } },
        { returnDocument: "after", session }
      );
      if (!activatedDevice) {
        const error = new Error("pending device changed during recovery bootstrap"); error.status = 409; throw error;
      }
      await persistDirectoryHead(identity, verifiedDirectory, session);
      conversations = await transitionUserConversations(req.user.userId, {
        addClientIds: [target.clientId],
        reason: "explicit recovery bootstrap activated a device",
        session
      });
      deviceListInvalidation = await createDeviceListInvalidation(req, session);
    });
    emitCryptoRosterChanged(req, conversations);
    emitDeviceListUpdate(req, deviceListInvalidation);
    return res.json({
      ok: true,
      securityIdentityChanged: true,
      device: deviceView(activatedDevice),
      conversationsBlocked: conversations.length,
      reconcileRequired: conversations.length > 0
    });
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.message });
    if (err instanceof TypeError) return res.status(400).json({ error: err.message });
    return next(err);
  } finally {
    await session.endSession();
  }
}

async function confirmRecoveryEnrollment(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const targetDeviceId = String(req.params.deviceId || "").toLowerCase();
    const confirmation = req.body.confirmation;
    const confirmationSignature = String(req.body.confirmationSignature || "");
    const expectedBindingId = sessionBindingId(req.user.sid);
    let activatedDevice;
    let securityEvent;
    let conversations = [];
    let deviceListInvalidation;

    await session.withTransaction(async () => {
      const identity = await CryptoIdentity.findOne({ userId: req.user.userId }).session(session);
      const devices = await CryptoDevice.find({ userId: req.user.userId }).session(session);
      const target = devices.find(item => item.deviceId === targetDeviceId);
      const activeCount = devices.filter(item => item.status === "active").length;
      const expiresAt = Date.parse(String(confirmation?.expiresAt || ""));
      if (!identity?.rootPublicKey || !target || target.status !== "pending" ||
        Number(target.authVersion) !== 2 ||
        target.sessionBindingId !== expectedBindingId ||
        target.sessionIdHash !== hashSessionId(req.user.sid)) {
        const error = new Error("pending v2 device is not available for recovery enrollment");
        error.status = 409;
        throw error;
      }
      if (!confirmation || confirmation.v !== 2 ||
        confirmation.action !== "recover-enroll-device" ||
        confirmation.protocol !== DEVICE_AUTH_PROTOCOL_V2 ||
        confirmation.cryptoUserId !== identity.cryptoUserId ||
        confirmation.deviceId !== target.deviceId ||
        confirmation.clientId !== target.clientId ||
        confirmation.requestPublicKey !== target.requestPublicKey ||
        confirmation.sessionBindingId !== expectedBindingId ||
        confirmation.challenge !== target.approvalChallenge ||
        confirmation.preserveExistingDevices !== true ||
        confirmation.visibleSecurityEventAcknowledged !== true ||
        !isFreshIsoDate(confirmation.createdAt) ||
        !Number.isFinite(expiresAt) || expiresAt <= Date.now() ||
        expiresAt > Date.now() + 10 * 60 * 1000 ||
        !/^[A-Za-z0-9_-]{22,96}$/.test(String(confirmation.nonce || "")) ||
        !verifyEd25519({
          publicKey: identity.rootPublicKey,
          signature: confirmationSignature,
          value: confirmation,
          domain: "liotan-recovery-enrollment-v2"
        })) {
        const error = new Error("invalid recovery enrollment confirmation");
        error.status = 400;
        throw error;
      }
      const prospectiveTarget = {
        ...target.toObject(),
        status: "active",
        activationMode: "recovery-enrollment",
        approval: confirmation,
        approvalSignature: confirmationSignature,
        approvedByClientId: "recovery-enrollment",
        approvedAt: new Date(),
        approvalChallenge: ""
      };
      const prospectiveDevices = devices
        .filter(item => item.deviceId !== targetDeviceId)
        .map(item => item.toObject())
        .concat(prospectiveTarget);
      const verifiedDirectory = validateDirectoryMutation({
        identity,
        devices: prospectiveDevices,
        update: req.body.directoryUpdate,
        signature: req.body.directorySignature,
        action: "recovery-enrollment",
        targetDeviceId
      });
      activatedDevice = await CryptoDevice.findOneAndUpdate(
        {
          _id: target._id,
          status: "pending",
          approvalChallenge: target.approvalChallenge,
          sessionIdHash: hashSessionId(req.user.sid)
        },
        {
          $set: {
            status: "active",
            activationMode: "recovery-enrollment",
            approval: confirmation,
            approvalSignature: confirmationSignature,
            approvedByClientId: "recovery-enrollment",
            approvedAt: new Date(),
            approvalChallenge: ""
          }
        },
        { returnDocument: "after", session }
      );
      if (!activatedDevice) {
        const error = new Error("pending device changed during recovery enrollment");
        error.status = 409;
        throw error;
      }
      await persistDirectoryHead(identity, verifiedDirectory, session);
      [securityEvent] = await CryptoDeviceSecurityEvent.create([{
        eventId: crypto.randomBytes(24).toString("base64url"),
        userId: req.user.userId,
        cryptoUserId: identity.cryptoUserId,
        type: "recovery-enrollment",
        targetDeviceId: target.deviceId,
        targetClientId: target.clientId,
        priorActiveDeviceCount: activeCount,
        statement: confirmation,
        statementSignature: confirmationSignature
      }], { session });
      conversations = await transitionUserConversations(req.user.userId, {
        addClientIds: [target.clientId],
        reason: "recovery enrolled a distinct cryptographic device",
        session
      });
      deviceListInvalidation = await createDeviceListInvalidation(req, session);
    });

    emitCryptoRosterChanged(req, conversations);
    emitDeviceListUpdate(req, deviceListInvalidation);
    return res.json({
      ok: true,
      securityIdentityChanged: false,
      visibleSecurityEvent: securityEventView(securityEvent),
      device: deviceView(activatedDevice),
      conversationsBlocked: conversations.length,
      reconcileRequired: conversations.length > 0
    });
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.message });
    if (err instanceof TypeError) return res.status(400).json({ error: err.message });
    return next(err);
  } finally {
    await session.endSession();
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
  const session = await mongoose.startSession();
  try {
    const targetDeviceId = String(req.params.deviceId || "").toLowerCase();
    const revocation = req.body.revocation;
    const revocationSignature = String(req.body.signature || "");
    if (!isDeviceId(targetDeviceId)) return res.status(400).json({ error: "invalid device id" });
    let device;
    let conversations = [];
    let revokedSessionHash = "";
    let deviceListInvalidation;
    await session.withTransaction(async () => {
      const identity = await CryptoIdentity.findOne({ userId: req.user.userId }).session(session);
      const devices = await CryptoDevice.find({ userId: req.user.userId }).session(session);
      const targetDevice = devices.find(item => item.deviceId === targetDeviceId && item.status === "active");
      if (!targetDevice) {
        const error = new Error("active crypto device not found"); error.status = 404; throw error;
      }
      if (devices.filter(item => item.status === "active").length <= 1 &&
        revocation?.recoveryAcknowledged !== true) {
        const error = new Error("the only active crypto device requires an explicit recovery flow"); error.status = 409; throw error;
      }
      if (!identity?.rootPublicKey || !revocation ||
        revocation.cryptoUserId !== identity.cryptoUserId || revocation.deviceId !== targetDeviceId ||
        !isFreshIsoDate(revocation.revokedAt) || !/^[A-Za-z0-9_-]{22,96}$/.test(String(revocation.nonce || "")) ||
        !verifyEd25519({
          publicKey: identity.rootPublicKey,
          signature: revocationSignature,
          value: revocation,
          domain: "liotan-device-revocation-v1"
        })) {
        const error = new Error("invalid device revocation"); error.status = 400; throw error;
      }
      const prospectiveTarget = {
        ...targetDevice.toObject(),
        status: "revoked",
        revokedAt: new Date(revocation.revokedAt),
        revocation,
        revocationSignature
      };
      const prospectiveDevices = devices
        .filter(item => item.deviceId !== targetDeviceId)
        .map(item => item.toObject())
        .concat(prospectiveTarget);
      const verifiedDirectory = validateDirectoryMutation({
        identity,
        devices: prospectiveDevices,
        update: req.body.directoryUpdate,
        signature: req.body.directorySignature,
        action: "revoke-device",
        targetDeviceId
      });
      conversations = await transitionUserConversations(req.user.userId, {
        removeClientIds: [targetDevice.clientId],
        reason: "cryptographic device revoked",
        session
      });
      device = await CryptoDevice.findOneAndUpdate(
        { _id: targetDevice._id, status: "active" },
        { $set: {
          status: "revoked",
          revokedAt: new Date(revocation.revokedAt),
          revocation,
          revocationSignature
        } },
        { returnDocument: "after", session }
      );
      if (!device) {
        const error = new Error("crypto device changed during revocation"); error.status = 409; throw error;
      }
      await persistDirectoryHead(identity, verifiedDirectory, session);
      await CryptoKeyPackage.deleteMany({ clientId: device.clientId, claimedAt: null }, { session });
      revokedSessionHash = revocation.reprovisionSession === true ? "" : device.sessionIdHash || "";
      if (revokedSessionHash) {
        await Session.updateOne(
          { userId: req.user.userId, sessionIdHash: revokedSessionHash, revokedAt: null },
          { $set: { revokedAt: new Date() } },
          { session }
        );
      }
      deviceListInvalidation = await createDeviceListInvalidation(req, session);
    });
    if (revokedSessionHash) disconnectSessionHash(revokedSessionHash);
    emitCryptoRosterChanged(req, conversations);
    emitDeviceListUpdate(req, deviceListInvalidation);
    return res.json({
      ok: true,
      device: deviceView(device),
      sessionRevoked: Boolean(revokedSessionHash),
      conversationsBlocked: conversations.length,
      reconcileRequired: conversations.length > 0
    });
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.message });
    if (err instanceof TypeError) return res.status(400).json({ error: err.message });
    return next(err);
  } finally {
    await session.endSession();
  }
}

async function listDevices(req, res, next) {
  try {
    const limit = Math.max(1, Math.min(Number.parseInt(req.query.limit, 10) || 50, 100));
    const cursor = decodeDeviceCursor(req.query.cursor);
    const pageQuery = { userId: req.user.userId };
    if (cursor) pageQuery.$or = [
      { createdAt: { $gt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $gt: cursor.id } }
    ];
    const [identity, page, allDevices, directoryEntries, securityEvents] = await Promise.all([
      CryptoIdentity.findOne({ userId: req.user.userId }).lean(),
      CryptoDevice.find(pageQuery)
        .sort({ createdAt: 1, _id: 1 })
        .limit(limit + 1)
        .lean(),
      CryptoDevice.find({ userId: req.user.userId }).sort({ deviceId: 1 }).lean(),
      CryptoDirectoryEntry.find({ userId: req.user.userId }).sort({ version: -1 }).limit(DIRECTORY_LOG_WINDOW).lean(),
      CryptoDeviceSecurityEvent.find({ userId: req.user.userId }).sort({ createdAt: -1 }).limit(50).lean()
    ]);
    const hasMore = page.length > limit;
    const devices = page.slice(0, limit);
    return res.json({
      devices: devices.map(deviceView),
      deviceCommitments: allDevices.map(directoryDeviceCommitment),
      directory: directoryStateView(identity),
      directoryLog: directoryLogView(directoryEntries),
      securityEvents: securityEvents.map(securityEventView),
      hasMore,
      nextCursor: hasMore ? encodeDeviceCursor(devices.at(-1)) : ""
    });
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.message });
    return next(err);
  }
}

async function renewDevice(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const targetDeviceId = String(req.params.deviceId || "").toLowerCase();
    const renewal = req.body.renewal;
    const renewalSignature = String(req.body.renewalSignature || "");
    const manifest = req.body.manifest;
    const manifestSignature = String(req.body.manifestSignature || "");
    let renewed;
    let duplicate = false;
    let deviceListInvalidation;
    await session.withTransaction(async () => {
      const identity = await CryptoIdentity.findOne({ userId: req.user.userId }).session(session);
      const devices = await CryptoDevice.find({ userId: req.user.userId }).session(session);
      const target = devices.find(device => device.deviceId === targetDeviceId);
      if (!identity?.rootPublicKey || !target || target.status !== "active" ||
        req.cryptoDevice.clientId !== target.clientId) {
        const error = new Error("active current device not found"); error.status = 404; throw error;
      }
      if (canonicalJson(target.manifest) === canonicalJson(manifest) && target.manifestSignature === manifestSignature) {
        renewed = target;
        duplicate = true;
        return;
      }
      const issuedAt = Date.parse(String(renewal?.issuedAt || ""));
      const oldExpiresAt = Date.parse(String(target.manifestExpiresAt || ""));
      const newExpiresAt = Date.parse(String(manifest?.expiresAt || ""));
      const authVersion = Number(target.authVersion) === 2 ? 2 : 1;
      const expectedPreviousHash = sha256Base64Url(Buffer.from(canonicalJson([
        authVersion === 2 ? "liotan-device-manifest-v2" : "liotan-device-manifest-v1",
        target.manifest,
        target.manifestSignature
      ]), "utf8"));
      if (!renewal || Number(renewal.v) !== authVersion || renewal.cryptoUserId !== identity.cryptoUserId ||
        renewal.deviceId !== target.deviceId || renewal.clientId !== target.clientId ||
        renewal.previousManifestHash !== expectedPreviousHash ||
        (authVersion === 2 && (
          renewal.action !== "renew-device" ||
          renewal.protocol !== DEVICE_AUTH_PROTOCOL_V2 ||
          renewal.sessionBindingId !== sessionBindingId(req.user.sid)
        )) ||
        !Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > 10 * 60 * 1000 ||
        oldExpiresAt - Date.now() > MANIFEST_RENEWAL_WINDOW_MS ||
        !/^[A-Za-z0-9_-]{22,96}$/.test(String(renewal.nonce || "")) ||
        !verifyEd25519({
          publicKey: target.requestPublicKey,
          signature: renewalSignature,
          value: renewal,
          domain: authVersion === 2 ? "liotan-device-renewal-v2" : "liotan-device-renewal-v1"
        })) {
        const error = new Error("invalid device manifest renewal"); error.status = 400; throw error;
      }
      if (!manifest || Number(manifest.v) !== authVersion || manifest.cryptoUserId !== target.cryptoUserId ||
        manifest.username !== target.username || manifest.deviceId !== target.deviceId ||
        manifest.clientId !== target.clientId || manifest.requestPublicKey !== target.requestPublicKey ||
        manifest.credentialThumbprint !== target.credentialThumbprint ||
        manifest.createdAt !== target.manifest.createdAt ||
        (authVersion === 2 && (
          manifest.authProtocol !== DEVICE_AUTH_PROTOCOL_V2 ||
          manifest.sessionBindingId !== target.sessionBindingId
        )) ||
        !Number.isFinite(newExpiresAt) || newExpiresAt < Date.now() + 30 * 24 * 60 * 60 * 1000 ||
        newExpiresAt > Date.now() + 400 * 24 * 60 * 60 * 1000 ||
        renewal.newExpiresAt !== manifest.expiresAt ||
        !verifyEd25519({
          publicKey: identity.rootPublicKey,
          signature: manifestSignature,
          value: manifest,
          domain: authVersion === 2 ? "liotan-device-manifest-v2" : "liotan-device-manifest-v1"
        })) {
        const error = new Error("invalid renewed device manifest"); error.status = 400; throw error;
      }
      const prospectiveTarget = { ...target.toObject(), manifest, manifestSignature, manifestExpiresAt: new Date(newExpiresAt) };
      const prospectiveDevices = devices
        .filter(device => device.deviceId !== targetDeviceId)
        .map(device => device.toObject())
        .concat(prospectiveTarget);
      const verifiedDirectory = validateDirectoryMutation({
        identity,
        devices: prospectiveDevices,
        update: req.body.directoryUpdate,
        signature: req.body.directorySignature,
        action: "renew-device",
        targetDeviceId
      });
      renewed = await CryptoDevice.findOneAndUpdate(
        { _id: target._id, status: "active", manifestExpiresAt: target.manifestExpiresAt },
        { $set: { manifest, manifestSignature, manifestExpiresAt: new Date(newExpiresAt), lastSeenAt: new Date() } },
        { returnDocument: "after", session }
      );
      if (!renewed) { const error = new Error("device changed during renewal"); error.status = 409; throw error; }
      await persistDirectoryHead(identity, verifiedDirectory, session);
      deviceListInvalidation = await createDeviceListInvalidation(req, session);
    });
    const updatedIdentity = await CryptoIdentity.findOne({ userId: req.user.userId }).lean();
    if (!duplicate) emitDeviceListUpdate(req, deviceListInvalidation);
    return res.json({
      ok: true,
      duplicate,
      device: deviceView(renewed),
      directory: directoryStateView(updatedIdentity)
    });
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.message });
    if (err instanceof TypeError) return res.status(400).json({ error: err.message });
    return next(err);
  } finally {
    await session.endSession();
  }
}

module.exports = {
  bootstrap,
  pinIdentity,
  registerDevice,
  migrateDeviceAuthentication,
  approveDevice,
  confirmRecoveryBootstrap,
  confirmRecoveryEnrollment,
  publishKeyPackages,
  keyPackageStatus,
  revokeDevice,
  renewDevice,
  listDevices
};
