"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { after, before, test } = require("node:test");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const supertest = require("supertest");
const { io: createSocketClient } = require("socket.io-client");
const { directoryDevicesHash } = require("../../security/cryptoDirectoryState");

const TEST_SECRET = "liotan-integration-secret-0123456789abcdef0123456789abcdef";
const CRYPTO_DOMAIN = "integration.crypto.liotan.invalid";
const CSRF_HEADER = "liotan-integration-test";

let replSet;
let mongoose;
let app;
let server;
let io;
let User;
let Session;
let CryptoDevice;
let CryptoConversation;
let canonicalJson;
let signAuthToken;
let hashSessionId;

function rawPublicKey(publicKey) {
  return publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64url");
}

function signCanonical(privateKey, domain, value) {
  return crypto.sign(
    null,
    Buffer.from(canonicalJson([domain, value]), "utf8"),
    privateKey
  ).toString("base64url");
}

function requestBodyHash(body) {
  return crypto.createHash("sha256").update(canonicalJson(body || {})).digest("base64url");
}

function signedHeaders(account, method, path, body = {}, overrides = {}) {
  const timestamp = overrides.timestamp || Date.now();
  const nonce = overrides.nonce || crypto.randomBytes(24).toString("base64url");
  const signedPath = overrides.signedPath || path;
  const authVersion = Number(account.authVersion) === 2 ? 2 : 1;
  const value = authVersion === 2
    ? {
        v: 2,
        action: "crypto-request",
        protocol: "liotan-device-auth-v2",
        method: method.toUpperCase(),
        path: signedPath,
        timestamp,
        nonce,
        bodyHash: requestBodyHash(body),
        deviceId: account.deviceId,
        sessionBindingId: account.sessionBindingId
      }
    : {
        method: method.toUpperCase(),
        path: signedPath,
        timestamp,
        nonce,
        bodyHash: requestBodyHash(body)
      };
  return {
    "X-Liotan-CSRF": CSRF_HEADER,
    "X-Liotan-Crypto-Device": account.deviceId,
    "X-Liotan-Crypto-Timestamp": String(timestamp),
    "X-Liotan-Crypto-Nonce": nonce,
    "X-Liotan-Crypto-Signature": signCanonical(
      account.requestKey.privateKey,
      authVersion === 2 ? "liotan-crypto-request-v2" : "liotan-crypto-request-v1",
      value
    )
  };
}

function requestFor(account, method, path) {
  return supertest(app)[method.toLowerCase()](path).set("Cookie", account.cookie);
}

async function signedJson(account, method, path, body = {}, overrides = {}) {
  let request = requestFor(account, method, path).set(signedHeaders(account, method, path, body, overrides));
  if (!["GET", "HEAD"].includes(method.toUpperCase())) request = request.send(body);
  return request;
}

async function sessionJson(account, method, path, body = {}) {
  let request = requestFor(account, method, path).set("X-Liotan-CSRF", CSRF_HEADER);
  if (!["GET", "HEAD"].includes(method.toUpperCase())) request = request.send(body);
  return request;
}

async function createAuthenticatedUser(username) {
  const user = await User.create({
    username,
    password: "not-used-by-integration-test",
    emailHash: crypto.createHash("sha256").update(`${username}@example.invalid`).digest("hex"),
    emailVerified: true
  });
  const sessionId = crypto.randomBytes(32).toString("base64url");
  await Session.create({
    userId: user._id,
    username,
    sessionIdHash: hashSessionId(sessionId),
    deviceName: "Integration test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000)
  });
  const token = signAuthToken(user, sessionId);
  return { user, username, sessionId, cookie: `liotan_auth=${encodeURIComponent(token)}` };
}

async function createAdditionalSession(account) {
  const sessionId = crypto.randomBytes(32).toString("base64url");
  await Session.create({
    userId: account.user._id,
    username: account.username,
    sessionIdHash: hashSessionId(sessionId),
    deviceName: "Additional integration device",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000)
  });
  return {
    ...account,
    sessionId,
    cookie: `liotan_auth=${encodeURIComponent(signAuthToken(account.user, sessionId))}`
  };
}

function buildDirectoryUpdate(identity, devices, nextDevice, action, targetDeviceId, rootPrivateKey) {
  const prospective = devices
    .filter(device => device.deviceId !== targetDeviceId)
    .concat(nextDevice);
  const statement = {
    v: 1,
    cryptoUserId: identity.cryptoUserId,
    version: Number(identity.directory.version) + 1,
    previousHash: identity.directory.hash,
    devicesHash: directoryDevicesHash(prospective),
    action,
    targetDeviceId,
    timestamp: new Date().toISOString(),
    nonce: crypto.randomBytes(24).toString("base64url")
  };
  return {
    prospective,
    statement,
    signature: signCanonical(rootPrivateKey, "liotan-device-directory-v1", statement)
  };
}

async function prepareDeviceApproval(approver, pending, { signingKey = null, cryptoUserId = "" } = {}) {
  const listed = await signedJson(approver, "GET", "/crypto/v4/devices");
  assert.equal(listed.status, 200, listed.text);
  const target = listed.body.devices.find(device => device.deviceId === pending.deviceId);
  assert.equal(target?.status, "pending");
  const approval = {
    v: 1,
    cryptoUserId: cryptoUserId || approver.cryptoUserId,
    newDeviceId: target.deviceId,
    newClientId: target.clientId,
    requestPublicKey: target.requestPublicKey,
    credentialThumbprint: target.credentialThumbprint,
    challenge: target.approvalChallenge,
    approverClientId: approver.clientId,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    nonce: crypto.randomBytes(24).toString("base64url")
  };
  const approvalSignature = signCanonical(
    signingKey || approver.requestKey.privateKey,
    "liotan-device-approval-v1",
    approval
  );
  const nextDevice = {
    ...target,
    status: "active",
    approval,
    approvalSignature,
    approvedByClientId: approver.clientId,
    approvalChallenge: ""
  };
  const directory = buildDirectoryUpdate(
    { cryptoUserId: approver.cryptoUserId, directory: listed.body.directory },
    listed.body.devices,
    nextDevice,
    "approve-device",
    target.deviceId,
    approver.rootKey.privateKey
  );
  return {
    path: `/crypto/v4/devices/${target.deviceId}/approve`,
    body: {
      approval,
      approvalSignature,
      directoryUpdate: directory.statement,
      directorySignature: directory.signature
    }
  };
}

async function approvePendingDevice(approver, pending) {
  const prepared = await prepareDeviceApproval(approver, pending);
  const response = await signedJson(approver, "POST", prepared.path, prepared.body);
  assert.equal(response.status, 200, response.text);
  pending.status = "active";
  return response.body;
}

async function revokeRegisteredDevice(account, targetDeviceId, { recoveryAcknowledged = false } = {}) {
  const listed = await signedJson(account, "GET", "/crypto/v4/devices");
  assert.equal(listed.status, 200, listed.text);
  const target = listed.body.devices.find(device => device.deviceId === targetDeviceId);
  assert.equal(target?.status, "active");
  const revocation = {
    cryptoUserId: account.cryptoUserId,
    deviceId: targetDeviceId,
    revokedAt: new Date().toISOString(),
    nonce: crypto.randomBytes(24).toString("base64url"),
    ...(recoveryAcknowledged ? { recoveryAcknowledged: true } : {})
  };
  const revocationSignature = signCanonical(
    account.rootKey.privateKey,
    "liotan-device-revocation-v1",
    revocation
  );
  const nextDevice = {
    ...target,
    status: "revoked",
    revokedAt: revocation.revokedAt,
    revocation,
    revocationSignature
  };
  const directory = buildDirectoryUpdate(
    { cryptoUserId: account.cryptoUserId, directory: listed.body.directory },
    listed.body.devices,
    nextDevice,
    "revoke-device",
    targetDeviceId,
    account.rootKey.privateKey
  );
  return signedJson(account, "POST", `/crypto/v4/devices/${targetDeviceId}/revoke`, {
    revocation,
    signature: revocationSignature,
    directoryUpdate: directory.statement,
    directorySignature: directory.signature
  });
}

async function confirmPendingRecoveryTest(pending) {
  const bootstrap = await requestFor(
    pending,
    "GET",
    `/crypto/v4/bootstrap?deviceId=${pending.deviceId}`
  ).expect(200);
  const target = bootstrap.body.device;
  assert.equal(target?.status, "pending");
  assert.equal(target?.activationMode, "recovery-bootstrap");
  const confirmation = {
    v: 1,
    cryptoUserId: pending.cryptoUserId,
    deviceId: target.deviceId,
    clientId: target.clientId,
    challenge: target.approvalChallenge,
    warningAcknowledged: true,
    timestamp: new Date().toISOString(),
    nonce: crypto.randomBytes(24).toString("base64url")
  };
  const confirmationSignature = signCanonical(
    pending.rootKey.privateKey,
    "liotan-recovery-bootstrap-v1",
    confirmation
  );
  const nextDevice = {
    ...target,
    status: "active",
    approval: confirmation,
    approvalSignature: confirmationSignature,
    approvedByClientId: "recovery-bootstrap",
    approvalChallenge: ""
  };
  const directory = buildDirectoryUpdate(
    bootstrap.body.identity,
    bootstrap.body.accountDevices,
    nextDevice,
    "recovery-bootstrap",
    target.deviceId,
    pending.rootKey.privateKey
  );
  const response = await requestFor(
    pending,
    "POST",
    `/crypto/v4/devices/${target.deviceId}/recovery-bootstrap`
  ).set("X-Liotan-CSRF", CSRF_HEADER).send({
    confirmation,
    confirmationSignature,
    directoryUpdate: directory.statement,
    directorySignature: directory.signature
  });
  assert.equal(response.status, 200, response.text);
  pending.status = "active";
  return response.body;
}

async function registerDevice(account, {
  rootKey = null,
  deviceId = null,
  autoApprove = true,
  authVersion = 1
} = {}) {
  const sessionAccount = account.deviceId ? await createAdditionalSession(account) : account;
  const next = {
    ...sessionAccount,
    rootKey: rootKey || crypto.generateKeyPairSync("ed25519"),
    requestKey: crypto.generateKeyPairSync("ed25519"),
    deviceId: deviceId || crypto.randomBytes(8).toString("hex")
  };
  const bootstrap = await requestFor(next, "GET", `/crypto/v4/bootstrap?deviceId=${next.deviceId}`).expect(200);
  next.cryptoUserId = bootstrap.body.identity.cryptoUserId;
  next.rootPublicKey = rawPublicKey(next.rootKey.publicKey);

  let identity = bootstrap.body.identity;
  if (!identity.rootPublicKey) {
    const proofValue = {
      cryptoUserId: next.cryptoUserId,
      username: next.username,
      rootPublicKey: next.rootPublicKey,
      createdAt: new Date().toISOString(),
      nonce: crypto.randomBytes(24).toString("base64url")
    };
    const pinned = await requestFor(next, "POST", "/crypto/v4/identity")
      .set("X-Liotan-CSRF", CSRF_HEADER)
      .send({
        cryptoUserId: next.cryptoUserId,
        rootPublicKey: next.rootPublicKey,
        proof: { ...proofValue, signature: signCanonical(next.rootKey.privateKey, "liotan-account-root-v1", proofValue) }
      });
    assert.equal(pinned.status, 201, pinned.text);
    identity = pinned.body.identity;
  } else {
    assert.equal(identity.rootPublicKey, next.rootPublicKey);
  }

  const now = new Date();
  const manifest = {
    v: authVersion,
    cryptoUserId: next.cryptoUserId,
    username: next.username,
    deviceId: next.deviceId,
    clientId: `${next.cryptoUserId}:${next.deviceId}@${CRYPTO_DOMAIN}`,
    requestPublicKey: rawPublicKey(next.requestKey.publicKey),
    credentialThumbprint: crypto.randomBytes(32).toString("base64url"),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    ...(authVersion === 2 ? {
      authProtocol: "liotan-device-auth-v2",
      sessionBindingId: bootstrap.body.sessionBindingId
    } : {})
  };
  next.clientId = manifest.clientId;
  next.authVersion = authVersion;
  next.sessionBindingId = authVersion === 2 ? bootstrap.body.sessionBindingId : "";
  next.manifest = manifest;
  const manifestSignature = signCanonical(
    next.rootKey.privateKey,
    authVersion === 2 ? "liotan-device-manifest-v2" : "liotan-device-manifest-v1",
    manifest
  );
  const devices = bootstrap.body.accountDevices || [];
  const activeCount = devices.filter(device => device.status === "active").length;
  const status = devices.length === 0 ? "active" : "pending";
  const activationMode = devices.length === 0
    ? "initial"
    : activeCount > 0 ? "device-approval" : "recovery-bootstrap";
  const nextDevice = {
    deviceId: next.deviceId,
    clientId: next.clientId,
    requestPublicKey: manifest.requestPublicKey,
    authVersion,
    authProtocol: authVersion === 2 ? "liotan-device-auth-v2" : "liotan-device-auth-v1",
    sessionBindingId: next.sessionBindingId,
    credentialThumbprint: manifest.credentialThumbprint,
    manifest,
    manifestSignature,
    status,
    activationMode
  };
  const directory = buildDirectoryUpdate(
    identity,
    devices,
    nextDevice,
    "register-device",
    next.deviceId,
    next.rootKey.privateKey
  );
  const registered = await requestFor(next, "POST", "/crypto/v4/devices")
    .set("X-Liotan-CSRF", CSRF_HEADER)
    .send({
      manifest,
      signature: manifestSignature,
      directoryUpdate: directory.statement,
      directorySignature: directory.signature
    });
  assert.equal(registered.status, 201, registered.text);
  next.status = registered.body.device.status;
  next.activationMode = registered.body.device.activationMode;
  if (next.status === "pending" && autoApprove) {
    if (next.activationMode === "device-approval") await approvePendingDevice(account, next);
    else await confirmPendingRecoveryTest(next);
  }
  if (next.status !== "active") return next;

  const packages = Array.from({ length: 3 }, () => {
    const payload = crypto.randomBytes(128).toString("base64url");
    return {
      payload,
      packageHash: crypto.createHash("sha256").update(Buffer.from(payload, "base64url")).digest("base64url")
    };
  });
  const batch = {
    v: 1,
    cryptoUserId: next.cryptoUserId,
    deviceId: next.deviceId,
    clientId: next.clientId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    packages
  };
  await signedJson(next, "POST", "/crypto/v4/key-packages", {
    batch,
    signature: signCanonical(next.rootKey.privateKey, "liotan-key-package-batch-v1", batch)
  }).then(response => assert.equal(response.status, 201, response.text));
  return next;
}

async function createAccount(username) {
  return registerDevice(await createAuthenticatedUser(username));
}

function operationCommitBody(operation, { welcome = "", result = null } = {}) {
  const commitResult = result || {
    v: 1,
    operationId: operation.operationId,
    baseRosterVersion: operation.baseRosterVersion,
    baseEpoch: operation.baseEpoch,
    operationGeneration: operation.operationGeneration,
    intentHash: operation.intentHash,
    activeClientIds: operation.expectedActiveClientIds,
    activeClientIdsHash: operation.expectedActiveClientIdsHash
  };
  return {
    epoch: operation.expectedEpoch,
    commit: crypto.randomBytes(96).toString("base64url"),
    welcome,
    groupInfo: {
      encryptionType: 0,
      ratchetTreeType: 0,
      payload: crypto.randomBytes(64).toString("base64url")
    },
    result: commitResult
  };
}

async function commitOperation(account, conversationId, operation, { welcome = "", result = null } = {}) {
  const body = operationCommitBody(operation, { welcome, result });
  const path = `/crypto/v4/conversations/${encodeURIComponent(conversationId)}/operations/${encodeURIComponent(operation.operationId)}/commit`;
  const response = await signedJson(account, "POST", path, body);
  assert.equal(response.status, 201, response.text);
  return response.body;
}

async function initializePrivateConversation(alice, bob) {
  const resolveBody = { chatType: "private", targetUsername: bob.username };
  const resolved = await signedJson(alice, "POST", "/crypto/v4/conversations/resolve", resolveBody);
  assert.equal(resolved.status, 200, resolved.text);
  const conversationId = resolved.body.conversationId;
  const operationPath = `/crypto/v4/conversations/${encodeURIComponent(conversationId)}/operations`;
  const begin = await signedJson(alice, "POST", operationPath, {});
  assert.equal(begin.status, 201, begin.text);
  assert.equal(begin.body.operation.type, "init");
  await commitOperation(alice, conversationId, begin.body.operation, {
    welcome: crypto.randomBytes(128).toString("base64url")
  });
  return { conversationId, operationPath, resolveBody };
}

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.SECURITY_ENCRYPTION_SECRET = `${TEST_SECRET}-security`;
  process.env.PRIVACY_HASH_SECRET = `${TEST_SECRET}-privacy`;
  process.env.LIOTAN_CRYPTO_DOMAIN = CRYPTO_DOMAIN;
  process.env.SOCKET_AUTH_RECHECK_MS = "100";
  process.env.SESSION_TOUCH_THROTTLE_MS = "1";
  process.env.MONGOMS_MD5_CHECK = "true";
  process.env.PRIVACY_EXPOSE_DEV_EMAIL_CODES = "true";
  process.env.EMAIL_REQUIRE_MX = "false";

  replSet = await MongoMemoryReplSet.create({
    binary: { version: "8.0.14" },
    replSet: { count: 1, storageEngine: "wiredTiger" }
  });
  process.env.MONGO_URI = replSet.getUri("liotan-integration");

  mongoose = require("mongoose");
  await mongoose.connect(process.env.MONGO_URI);
  ({ app, server, io } = require("../../app"));
  User = require("../../models/User");
  Session = require("../../models/Session");
  CryptoDevice = require("../../models/CryptoDevice");
  CryptoConversation = require("../../models/CryptoConversation");
  ({ canonicalJson } = require("../../utils/canonicalJson"));
  ({ signAuthToken } = require("../../utils/authToken"));
  ({ hashSessionId } = require("../../utils/sessionSecurity"));
  await Promise.all(Object.values(mongoose.models).map(model => model.createIndexes()));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  if (io) await new Promise(resolve => io.close(resolve));
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  if (mongoose) await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

test("MLS delivery service enforces identity, device, replay, epochs and membership", async () => {
  const alice = await createAccount("alice_test");
  const bob = await createAccount("bob_test");

  const listPath = "/crypto/v4/devices";
  const fixed = { nonce: crypto.randomBytes(24).toString("base64url"), timestamp: Date.now() };
  const firstList = await signedJson(alice, "GET", listPath, {}, fixed);
  assert.equal(firstList.status, 200, firstList.text);
  const replay = await signedJson(alice, "GET", listPath, {}, fixed);
  assert.equal(replay.status, 409, replay.text);

  const tampered = await signedJson(alice, "GET", listPath, {}, { signedPath: "/crypto/v4/key-packages/status" });
  assert.equal(tampered.status, 401, tampered.text);

  const resolveBody = { chatType: "private", targetUsername: bob.username };
  const resolved = await signedJson(alice, "POST", "/crypto/v4/conversations/resolve", resolveBody);
  assert.equal(resolved.status, 200, resolved.text);
  assert.equal(resolved.body.directory.length, 2);
  const conversationId = resolved.body.conversationId;

  const operationPath = `/crypto/v4/conversations/${encodeURIComponent(conversationId)}/operations`;
  const begin = await signedJson(alice, "POST", operationPath, {});
  assert.equal(begin.status, 201, begin.text);
  assert.equal(begin.body.operation.type, "init");
  assert.deepEqual(begin.body.operation.addClientIds, [bob.clientId]);
  await commitOperation(alice, conversationId, begin.body.operation, {
    welcome: crypto.randomBytes(128).toString("base64url")
  });

  const messageId = crypto.randomUUID();
  const messagePath = `/crypto/v4/conversations/${encodeURIComponent(conversationId)}/messages`;
  const messageBody = {
    clientMessageId: messageId,
    epoch: 1,
    ciphertext: crypto.randomBytes(160).toString("base64url")
  };
  const sent = await signedJson(bob, "POST", messagePath, messageBody);
  assert.equal(sent.status, 201, sent.text);
  const duplicate = await signedJson(bob, "POST", messagePath, messageBody);
  assert.equal(duplicate.status, 200, duplicate.text);
  assert.equal(duplicate.body.duplicate, true);
  const changedCiphertext = await signedJson(bob, "POST", messagePath, {
    ...messageBody,
    ciphertext: crypto.randomBytes(160).toString("base64url")
  });
  assert.equal(changedCiphertext.status, 409, changedCiphertext.text);
  const changedEpoch = await signedJson(bob, "POST", messagePath, {
    ...messageBody,
    epoch: 0
  });
  assert.equal(changedEpoch.status, 409, changedEpoch.text);
  const changedSender = await signedJson(alice, "POST", messagePath, messageBody);
  assert.equal(changedSender.status, 409, changedSender.text);

  const eventsPath = `/crypto/v4/conversations/${encodeURIComponent(conversationId)}/events?after=0&limit=100`;
  const events = await signedJson(alice, "GET", eventsPath);
  assert.equal(events.status, 200, events.text);
  assert.deepEqual(events.body.events.map(event => event.kind), ["commit", "message"]);
  assert.equal(events.body.recipientHead, events.body.events.at(-1).sequence);
  const atHead = await signedJson(
    alice,
    "GET",
    `/crypto/v4/conversations/${encodeURIComponent(conversationId)}/events?after=${events.body.recipientHead}&limit=100`
  );
  assert.equal(atHead.status, 200, atHead.text);
  assert.deepEqual(atHead.body.events, []);
  assert.equal(atHead.body.recipientHead, events.body.recipientHead);

  const revoke = await revokeRegisteredDevice(bob, bob.deviceId, { recoveryAcknowledged: true });
  assert.equal(revoke.status, 200, revoke.text);

  const removeBegin = await signedJson(alice, "POST", operationPath, {});
  assert.equal(removeBegin.status, 201, removeBegin.text);
  assert.equal(removeBegin.body.operation.type, "remove");
  assert.deepEqual(removeBegin.body.operation.removeClientIds, [bob.clientId]);
  const removed = await commitOperation(alice, conversationId, removeBegin.body.operation);
  assert.equal(removed.activeClientIds.includes(bob.clientId), false);

  const blockedSend = await signedJson(alice, "POST", messagePath, {
    clientMessageId: crypto.randomUUID(),
    epoch: removed.epoch,
    ciphertext: crypto.randomBytes(80).toString("base64url")
  });
  assert.equal(blockedSend.status, 409, blockedSend.text);

  const bobReplacement = await registerDevice(bob, { rootKey: bob.rootKey });
  const refreshed = await signedJson(alice, "POST", "/crypto/v4/conversations/resolve", resolveBody);
  assert.equal(refreshed.status, 200, refreshed.text);
  const addBegin = await signedJson(alice, "POST", operationPath, {});
  assert.equal(addBegin.status, 201, addBegin.text);
  assert.equal(addBegin.body.operation.type, "add");
  assert.deepEqual(addBegin.body.operation.addClientIds, [bobReplacement.clientId]);
  const added = await commitOperation(alice, conversationId, addBegin.body.operation, {
    welcome: crypto.randomBytes(128).toString("base64url")
  });
  assert.equal(added.activeClientIds.includes(bobReplacement.clientId), true);

  const conversation = await CryptoConversation.findOne({ conversationId }).lean();
  assert.equal(conversation.blockedForEpochChange, false);
});

test("a cryptographic device signature cannot cross its bound browser session", async () => {
  const account = await createAccount("bound_device");
  const otherSession = await createAdditionalSession(account);
  const crossed = await signedJson(otherSession, "GET", "/crypto/v4/devices");
  assert.equal(crossed.status, 401, crossed.text);

  const original = await signedJson(account, "GET", "/crypto/v4/devices");
  assert.equal(original.status, 200, original.text);
});

test("durable media byte quotas account for rejected reservations", async () => {
  const account = await createAccount("media_quota");
  const {
    reserveMediaTransfer,
    releaseMediaTransfer
  } = require("../../services/mediaQuota");
  const envName = "MEDIA_QUOTA_ACCOUNT_UPLOAD_MINUTE_BYTES";
  const prior = process.env[envName];
  process.env[envName] = "64";
  const req = {
    user: {
      userId: account.user._id,
      username: account.username,
      sid: account.sessionId
    },
    cryptoDevice: { clientId: account.clientId },
    headers: {},
    socket: { remoteAddress: "127.0.0.42" }
  };

  let reservation;
  try {
    reservation = await reserveMediaTransfer(req, {
      direction: "upload",
      bytes: 40,
      conversationId: crypto.randomUUID()
    });
    await assert.rejects(
      reserveMediaTransfer(req, {
        direction: "upload",
        bytes: 40,
        conversationId: crypto.randomUUID()
      }),
      err => err?.status === 429 && err?.code === "MEDIA_QUOTA_EXCEEDED"
    );
  } finally {
    if (reservation) await releaseMediaTransfer(reservation.reservationId);
    if (prior == null) delete process.env[envName];
    else process.env[envName] = prior;
  }
});

test("device authentication v2 migrates with old and new proofs without changing MLS identity", async () => {
  const account = await createAccount("authv2_migrate");
  const listed = await signedJson(account, "GET", "/crypto/v4/devices");
  assert.equal(listed.status, 200, listed.text);
  const target = listed.body.devices.find(device => device.deviceId === account.deviceId);
  const bootstrap = await requestFor(
    account,
    "GET",
    `/crypto/v4/bootstrap?deviceId=${account.deviceId}`
  );
  assert.equal(bootstrap.status, 200, bootstrap.text);
  const nextRequestKey = crypto.generateKeyPairSync("ed25519");
  const nextRequestPublicKey = rawPublicKey(nextRequestKey.publicKey);
  const migration = {
    v: 2,
    action: "migrate-device-auth",
    protocol: "liotan-device-auth-v2",
    cryptoUserId: account.cryptoUserId,
    deviceId: account.deviceId,
    clientId: account.clientId,
    oldRequestPublicKey: target.requestPublicKey,
    newRequestPublicKey: nextRequestPublicKey,
    sessionBindingId: bootstrap.body.sessionBindingId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    nonce: crypto.randomBytes(24).toString("base64url")
  };
  const manifest = {
    ...target.manifest,
    v: 2,
    requestPublicKey: nextRequestPublicKey,
    authProtocol: "liotan-device-auth-v2",
    sessionBindingId: bootstrap.body.sessionBindingId
  };
  const manifestSignature = signCanonical(
    account.rootKey.privateKey,
    "liotan-device-manifest-v2",
    manifest
  );
  const nextDevice = {
    ...target,
    requestPublicKey: nextRequestPublicKey,
    authVersion: 2,
    authProtocol: "liotan-device-auth-v2",
    sessionBindingId: bootstrap.body.sessionBindingId,
    authMigrationState: "v2-active",
    manifest,
    manifestSignature
  };
  const directory = buildDirectoryUpdate(
    { cryptoUserId: account.cryptoUserId, directory: listed.body.directory },
    listed.body.devices,
    nextDevice,
    "migrate-device-auth",
    account.deviceId,
    account.rootKey.privateKey
  );
  const path = `/crypto/v4/devices/${account.deviceId}/auth-migration`;
  const body = {
    migration,
    oldProof: signCanonical(
      account.requestKey.privateKey,
      "liotan-device-auth-migration-v2",
      migration
    ),
    newProof: signCanonical(
      nextRequestKey.privateKey,
      "liotan-device-auth-migration-v2",
      migration
    ),
    manifest,
    manifestSignature,
    directoryUpdate: directory.statement,
    directorySignature: directory.signature
  };
  const migrated = await signedJson(account, "POST", path, body);
  assert.equal(migrated.status, 200, migrated.text);
  assert.equal(migrated.body.device.clientId, account.clientId);
  assert.equal(migrated.body.device.credentialThumbprint, target.credentialThumbprint);
  assert.equal(migrated.body.device.authVersion, 2);

  account.requestKey = nextRequestKey;
  account.authVersion = 2;
  account.sessionBindingId = bootstrap.body.sessionBindingId;
  const authenticated = await signedJson(account, "GET", "/crypto/v4/devices");
  assert.equal(authenticated.status, 200, authenticated.text);
});

test("recovery enrollment adds a distinct v2 device and records a visible security event", async () => {
  const owner = await registerDevice(await createAuthenticatedUser("recover_owner"), {
    authVersion: 2
  });
  const pending = await registerDevice(owner, {
    rootKey: owner.rootKey,
    authVersion: 2,
    autoApprove: false
  });
  assert.equal(pending.status, "pending");
  const bootstrap = await requestFor(
    pending,
    "GET",
    `/crypto/v4/bootstrap?deviceId=${pending.deviceId}`
  );
  assert.equal(bootstrap.status, 200, bootstrap.text);
  const target = bootstrap.body.device;
  const confirmation = {
    v: 2,
    action: "recover-enroll-device",
    protocol: "liotan-device-auth-v2",
    cryptoUserId: pending.cryptoUserId,
    deviceId: target.deviceId,
    clientId: target.clientId,
    requestPublicKey: target.requestPublicKey,
    sessionBindingId: bootstrap.body.sessionBindingId,
    challenge: target.approvalChallenge,
    preserveExistingDevices: true,
    visibleSecurityEventAcknowledged: true,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    nonce: crypto.randomBytes(24).toString("base64url")
  };
  const confirmationSignature = signCanonical(
    pending.rootKey.privateKey,
    "liotan-recovery-enrollment-v2",
    confirmation
  );
  const nextDevice = {
    ...target,
    status: "active",
    activationMode: "recovery-enrollment",
    approval: confirmation,
    approvalSignature: confirmationSignature,
    approvedByClientId: "recovery-enrollment",
    approvalChallenge: ""
  };
  const directory = buildDirectoryUpdate(
    bootstrap.body.identity,
    bootstrap.body.accountDevices,
    nextDevice,
    "recovery-enrollment",
    target.deviceId,
    pending.rootKey.privateKey
  );
  const recovered = await requestFor(
    pending,
    "POST",
    `/crypto/v4/devices/${target.deviceId}/recovery-enrollment`
  ).set("X-Liotan-CSRF", CSRF_HEADER).send({
    confirmation,
    confirmationSignature,
    directoryUpdate: directory.statement,
    directorySignature: directory.signature
  });
  assert.equal(recovered.status, 200, recovered.text);
  assert.equal(recovered.body.device.deviceId, pending.deviceId);
  assert.notEqual(recovered.body.device.deviceId, owner.deviceId);
  assert.equal(recovered.body.visibleSecurityEvent.type, "recovery-enrollment");
  assert.equal(recovered.body.visibleSecurityEvent.priorActiveDeviceCount, 1);

  const visible = await signedJson(owner, "GET", "/crypto/v4/devices");
  assert.equal(visible.status, 200, visible.text);
  assert(visible.body.securityEvents.some(event =>
    event.type === "recovery-enrollment" &&
    event.targetDeviceId === pending.deviceId
  ));
});

test("new cryptographic devices remain pending until an existing device signs a bound approval", async () => {
  const alice = await createAccount("appr_alice_t");
  const pending = await registerDevice(alice, {
    rootKey: alice.rootKey,
    autoApprove: false
  });
  assert.equal(pending.status, "pending");
  assert.equal(pending.activationMode, "device-approval");

  const pendingAccess = await signedJson(pending, "GET", "/crypto/v4/devices");
  assert.equal(pendingAccess.status, 401, pendingAccess.text);

  const forged = await prepareDeviceApproval(alice, pending, {
    signingKey: crypto.generateKeyPairSync("ed25519").privateKey
  });
  const forgedResult = await signedJson(alice, "POST", forged.path, forged.body);
  assert.equal(forgedResult.status, 400, forgedResult.text);

  const otherAccount = await createAccount("appr_other_t");
  const transferred = await prepareDeviceApproval(alice, pending, {
    signingKey: otherAccount.requestKey.privateKey,
    cryptoUserId: otherAccount.cryptoUserId
  });
  const transferredResult = await signedJson(alice, "POST", transferred.path, transferred.body);
  assert.equal(transferredResult.status, 400, transferredResult.text);

  const valid = await prepareDeviceApproval(alice, pending);
  const approved = await signedJson(alice, "POST", valid.path, valid.body);
  assert.equal(approved.status, 200, approved.text);
  const replay = await signedJson(alice, "POST", valid.path, valid.body);
  assert.notEqual(replay.status, 200, replay.text);

  const activeAccess = await signedJson(pending, "GET", "/crypto/v4/devices");
  assert.equal(activeAccess.status, 200, activeAccess.text);
});

test("device API paginates complete history and renews the current manifest without changing its identity", async () => {
  const account = await createAccount("device_pages");
  const before = await signedJson(account, "GET", "/crypto/v4/devices?limit=100");
  assert.equal(before.status, 200, before.text);
  const target = before.body.devices.find(device => device.deviceId === account.deviceId);
  const manifest = {
    ...target.manifest,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  };
  const manifestSignature = signCanonical(account.rootKey.privateKey, "liotan-device-manifest-v1", manifest);
  const renewal = {
    v: 1,
    cryptoUserId: account.cryptoUserId,
    deviceId: target.deviceId,
    clientId: target.clientId,
    previousManifestHash: crypto.createHash("sha256").update(canonicalJson([
      "liotan-device-manifest-v1",
      target.manifest,
      target.manifestSignature
    ])).digest("base64url"),
    newExpiresAt: manifest.expiresAt,
    issuedAt: new Date().toISOString(),
    nonce: crypto.randomBytes(24).toString("base64url")
  };
  const renewalSignature = signCanonical(account.requestKey.privateKey, "liotan-device-renewal-v1", renewal);
  const nextDevice = { ...target, manifest, manifestSignature, manifestExpiresAt: manifest.expiresAt };
  const directory = buildDirectoryUpdate(
    { cryptoUserId: account.cryptoUserId, directory: before.body.directory },
    before.body.devices,
    nextDevice,
    "renew-device",
    target.deviceId,
    account.rootKey.privateKey
  );
  const path = `/crypto/v4/devices/${target.deviceId}/renew`;
  const body = {
    renewal,
    renewalSignature,
    manifest,
    manifestSignature,
    directoryUpdate: directory.statement,
    directorySignature: directory.signature
  };
  const renewed = await signedJson(account, "POST", path, body);
  assert.equal(renewed.status, 200, renewed.text);
  assert.equal(renewed.body.duplicate, false);
  assert.equal(renewed.body.device.clientId, target.clientId);
  assert.equal(renewed.body.device.requestPublicKey, target.requestPublicKey);
  assert.equal(renewed.body.device.credentialThumbprint, target.credentialThumbprint);
  assert.equal(renewed.body.directory.version, before.body.directory.version + 1);
  const duplicate = await signedJson(account, "POST", path, body);
  assert.equal(duplicate.status, 200, duplicate.text);
  assert.equal(duplicate.body.duplicate, true);

  const extraDevices = Array.from({ length: 105 }, (_, index) => {
    const deviceId = (index + 1000).toString(16).padStart(16, "0");
    const createdAt = new Date(Date.now() - (105 - index) * 1000);
    const historicalManifest = {
      ...manifest,
      deviceId,
      clientId: `${account.cryptoUserId}:${deviceId}@${CRYPTO_DOMAIN}`,
      createdAt: createdAt.toISOString()
    };
    return {
      userId: account.user._id,
      username: account.username,
      cryptoUserId: account.cryptoUserId,
      deviceId,
      clientId: historicalManifest.clientId,
      requestPublicKey: crypto.randomBytes(32).toString("base64url"),
      credentialThumbprint: crypto.randomBytes(32).toString("base64url"),
      manifest: historicalManifest,
      manifestSignature: crypto.randomBytes(64).toString("base64url"),
      manifestExpiresAt: index === 0 ? new Date(Date.now() - 1000) : new Date(manifest.expiresAt),
      status: index === 0 ? "active" : "revoked",
      activationMode: "legacy-migrated",
      revokedAt: createdAt,
      createdAt,
      updatedAt: createdAt
    };
  });
  await CryptoDevice.insertMany(extraDevices);
  const firstPage = await signedJson(account, "GET", "/crypto/v4/devices?limit=100");
  assert.equal(firstPage.status, 200, firstPage.text);
  assert.equal(firstPage.body.devices.length, 100);
  assert.equal(firstPage.body.hasMore, true);
  assert.equal(firstPage.body.deviceCommitments.length, 106);
  const secondPage = await signedJson(account, "GET", `/crypto/v4/devices?limit=100&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`);
  assert.equal(secondPage.status, 200, secondPage.text);
  assert.equal(secondPage.body.devices.length, 6);
  assert.equal(secondPage.body.hasMore, false);
  const completeDeviceHistory = [...firstPage.body.devices, ...secondPage.body.devices];
  assert.equal(new Set(completeDeviceHistory.map(device => device.deviceId)).size, 106);
  assert.equal(completeDeviceHistory.find(device => device.deviceId === extraDevices[0].deviceId)?.status, "expired");
});

test("stale self-update cannot clear the epoch block after device revocation", async () => {
  const alice = await createAccount("s_alice_test");
  const bob = await createAccount("s_bob_test");
  const { conversationId, operationPath } = await initializePrivateConversation(alice, bob);

  await CryptoConversation.updateOne(
    { conversationId },
    { $set: { lastCommitAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } }
  );
  const staleBegin = await signedJson(alice, "POST", operationPath, { forceUpdate: true });
  assert.equal(staleBegin.status, 201, staleBegin.text);
  assert.equal(staleBegin.body.operation.type, "update");

  const revoke = await revokeRegisteredDevice(bob, bob.deviceId, { recoveryAcknowledged: true });
  assert.equal(revoke.status, 200, revoke.text);

  const staleCommitPath = `/crypto/v4/conversations/${encodeURIComponent(conversationId)}/operations/${encodeURIComponent(staleBegin.body.operation.operationId)}/commit`;
  const staleCommit = await signedJson(
    alice,
    "POST",
    staleCommitPath,
    operationCommitBody(staleBegin.body.operation)
  );
  assert.equal(staleCommit.status, 409, staleCommit.text);

  const blockedMessage = await signedJson(
    alice,
    "POST",
    `/crypto/v4/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      clientMessageId: crypto.randomUUID(),
      epoch: 1,
      ciphertext: crypto.randomBytes(80).toString("base64url")
    }
  );
  assert.equal(blockedMessage.status, 409, blockedMessage.text);

  const conversation = await CryptoConversation.findOne({ conversationId }).lean();
  assert.equal(conversation.blockedForEpochChange, true);
  assert.equal(conversation.epoch, 1);
  assert.equal(conversation.authorizedClientIds.includes(bob.clientId), false);
  assert.equal(conversation.activeClientIds.includes(bob.clientId), true);

  const removeBegin = await signedJson(alice, "POST", operationPath, {});
  assert.equal(removeBegin.status, 201, removeBegin.text);
  assert.equal(removeBegin.body.operation.type, "remove");
  const removed = await commitOperation(alice, conversationId, removeBegin.body.operation);
  assert.equal(removed.activeClientIds.includes(bob.clientId), false);
  assert.equal(removed.authorizedClientIds.includes(bob.clientId), false);
});

test("group membership change invalidates an older operation generation", async () => {
  const alice = await createAccount("g_alice_test");
  const bob = await createAccount("g_bob_test");
  const group = await sessionJson(alice, "POST", "/groups", {
    name: "MLS integration group",
    members: [bob.username]
  });
  assert.equal(group.status, 201, group.text);
  const resolveBody = { chatType: "group", groupId: group.body._id };
  const resolved = await signedJson(alice, "POST", "/crypto/v4/conversations/resolve", resolveBody);
  assert.equal(resolved.status, 200, resolved.text);
  const conversationId = resolved.body.conversationId;
  const operationPath = `/crypto/v4/conversations/${encodeURIComponent(conversationId)}/operations`;
  const init = await signedJson(alice, "POST", operationPath, {});
  assert.equal(init.status, 201, init.text);
  await commitOperation(alice, conversationId, init.body.operation, {
    welcome: crypto.randomBytes(128).toString("base64url")
  });
  await CryptoConversation.updateOne(
    { conversationId },
    { $set: { lastCommitAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } }
  );
  const stale = await signedJson(alice, "POST", operationPath, { forceUpdate: true });
  assert.equal(stale.status, 201, stale.text);

  const removedMember = await sessionJson(
    alice,
    "DELETE",
    `/groups/${encodeURIComponent(group.body._id)}/members/${encodeURIComponent(bob.username)}`
  );
  assert.equal(removedMember.status, 200, removedMember.text);

  const stalePath = `/crypto/v4/conversations/${encodeURIComponent(conversationId)}/operations/${encodeURIComponent(stale.body.operation.operationId)}/commit`;
  const staleCommit = await signedJson(alice, "POST", stalePath, operationCommitBody(stale.body.operation));
  assert.equal(staleCommit.status, 409, staleCommit.text);
  const afterConflict = await CryptoConversation.findOne({ conversationId }).lean();
  assert.equal(afterConflict.blockedForEpochChange, true);
  assert.equal(afterConflict.authorizedClientIds.includes(bob.clientId), false);
  assert.equal(afterConflict.activeClientIds.includes(bob.clientId), true);

  const remove = await signedJson(alice, "POST", operationPath, {});
  assert.equal(remove.status, 201, remove.text);
  assert.deepEqual(remove.body.operation.removeClientIds, [bob.clientId]);
  const committed = await commitOperation(alice, conversationId, remove.body.operation);
  assert.equal(committed.activeClientIds.includes(bob.clientId), false);
});

test("parallel operation creation has one generation winner", async () => {
  const alice = await createAccount("p_alice_test");
  const { conversationId, operationPath } = await initializePrivateConversation(alice, alice);
  await CryptoConversation.updateOne(
    { conversationId },
    { $set: { lastCommitAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } }
  );
  const results = await Promise.all([
    signedJson(alice, "POST", operationPath, { forceUpdate: true }),
    signedJson(alice, "POST", operationPath, { forceUpdate: true })
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  const pending = await mongoose.model("CryptoOperation").find({ conversationId, status: "pending" }).lean();
  assert.equal(pending.length, 1);
});

test("commit result must match operation intent and cannot be replayed", async () => {
  const alice = await createAccount("i_alice_test");
  const { conversationId, operationPath } = await initializePrivateConversation(alice, alice);
  await CryptoConversation.updateOne(
    { conversationId },
    { $set: { lastCommitAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } }
  );
  const begin = await signedJson(alice, "POST", operationPath, { forceUpdate: true });
  assert.equal(begin.status, 201, begin.text);
  const operation = begin.body.operation;
  const path = `/crypto/v4/conversations/${encodeURIComponent(conversationId)}/operations/${encodeURIComponent(operation.operationId)}/commit`;
  const invalidBody = operationCommitBody(operation, {
    result: {
      v: 1,
      operationId: operation.operationId,
      baseRosterVersion: operation.baseRosterVersion,
      baseEpoch: operation.baseEpoch,
      operationGeneration: operation.operationGeneration,
      intentHash: operation.intentHash,
      activeClientIds: [],
      activeClientIdsHash: operation.expectedActiveClientIdsHash
    }
  });
  const invalid = await signedJson(alice, "POST", path, invalidBody);
  assert.equal(invalid.status, 409, invalid.text);

  const validBody = operationCommitBody(operation);
  const committed = await signedJson(alice, "POST", path, validBody);
  assert.equal(committed.status, 201, committed.text);
  const replay = await signedJson(alice, "POST", path, validBody);
  assert.equal(replay.status, 409, replay.text);
});

test("parallel message retries have one ciphertext-bound winner", async () => {
  const alice = await createAccount("m_alice_test");
  const { conversationId } = await initializePrivateConversation(alice, alice);
  const path = `/crypto/v4/conversations/${encodeURIComponent(conversationId)}/messages`;
  const identicalBody = {
    clientMessageId: crypto.randomUUID(),
    epoch: 1,
    ciphertext: crypto.randomBytes(160).toString("base64url")
  };
  const identical = await Promise.all([
    signedJson(alice, "POST", path, identicalBody),
    signedJson(alice, "POST", path, identicalBody)
  ]);
  assert.deepEqual(identical.map(result => result.status).sort(), [200, 201]);
  assert.equal(await mongoose.model("CryptoEvent").countDocuments({
    conversationId,
    clientMessageId: identicalBody.clientMessageId
  }), 1);

  const conflictingId = crypto.randomUUID();
  const conflicting = await Promise.all([
    signedJson(alice, "POST", path, {
      clientMessageId: conflictingId,
      epoch: 1,
      ciphertext: crypto.randomBytes(160).toString("base64url")
    }),
    signedJson(alice, "POST", path, {
      clientMessageId: conflictingId,
      epoch: 1,
      ciphertext: crypto.randomBytes(160).toString("base64url")
    })
  ]);
  assert.deepEqual(conflicting.map(result => result.status).sort(), [201, 409]);
  assert.equal(await mongoose.model("CryptoEvent").countDocuments({
    conversationId,
    clientMessageId: conflictingId
  }), 1);
});

test("MLS media capability commits atomically with its message and leaves failures temporary", async () => {
  const alice = await createAccount("media_cap_test");
  const { conversationId } = await initializePrivateConversation(alice, alice);
  const AttachmentUpload = mongoose.model("AttachmentUpload");
  const messagePath = `/crypto/v4/conversations/${encodeURIComponent(conversationId)}/messages`;
  const commitToken = crypto.randomBytes(32).toString("base64url");
  const deleteToken = crypto.randomBytes(32).toString("base64url");
  const messageId = crypto.randomUUID();
  const upload = await AttachmentUpload.create({
    uploadId: crypto.randomBytes(24).toString("base64url"),
    owner: alice.username,
    encrypted: true,
    protocol: "mls-media-1",
    cryptoConversationId: conversationId,
    cryptoClientId: alice.clientId,
    bindingId: crypto.randomBytes(24).toString("base64url"),
    ciphertextHash: crypto.randomBytes(32).toString("base64url"),
    boundClientMessageId: messageId,
    commitTokenHash: crypto.createHash("sha256").update(commitToken).digest("base64url"),
    deleteTokenHash: crypto.createHash("sha256").update(deleteToken).digest("base64url"),
    lifecycleState: "temporary",
    storageKey: "integration/fake-ciphertext-object",
    storageType: "r2:private-media",
    expiresAt: new Date(Date.now() + 60_000)
  });
  const body = {
    clientMessageId: messageId,
    epoch: 1,
    ciphertext: crypto.randomBytes(160).toString("base64url"),
    attachmentCommit: { uploadId: upload.uploadId, token: commitToken }
  };
  const sent = await signedJson(alice, "POST", messagePath, body);
  assert.equal(sent.status, 201, sent.text);
  const committed = await AttachmentUpload.findOne({ uploadId: upload.uploadId }).lean();
  assert.equal(committed.lifecycleState, "committed");
  assert.equal(committed.committedEventSequence, sent.body.sequence);
  assert.equal(committed.expiresAt, null);
  assert.equal(committed.commitTokenHash, "");

  const duplicate = await signedJson(alice, "POST", messagePath, body);
  assert.equal(duplicate.status, 200, duplicate.text);
  assert.equal(duplicate.body.sequence, sent.body.sequence);

  const deleteBody = {
    clientMessageId: crypto.randomUUID(),
    epoch: 1,
    ciphertext: crypto.randomBytes(160).toString("base64url"),
    attachmentDelete: { uploadId: upload.uploadId, token: deleteToken }
  };
  const scheduledDelete = await signedJson(alice, "POST", messagePath, deleteBody);
  assert.equal(scheduledDelete.status, 201, scheduledDelete.text);
  const deletionPending = await AttachmentUpload.findOne({ uploadId: upload.uploadId }).lean();
  assert.equal(deletionPending.lifecycleState, "deletion-pending");
  const repeatedDeleteEvent = await signedJson(alice, "POST", messagePath, deleteBody);
  assert.equal(repeatedDeleteEvent.status, 200, repeatedDeleteEvent.text);
  await AttachmentUpload.deleteOne({ uploadId: upload.uploadId });

  const failedMessageId = crypto.randomUUID();
  const failedToken = crypto.randomBytes(32).toString("base64url");
  const failedUpload = await AttachmentUpload.create({
    uploadId: crypto.randomBytes(24).toString("base64url"),
    owner: alice.username,
    encrypted: true,
    protocol: "mls-media-1",
    cryptoConversationId: conversationId,
    cryptoClientId: alice.clientId,
    bindingId: crypto.randomBytes(24).toString("base64url"),
    ciphertextHash: crypto.randomBytes(32).toString("base64url"),
    boundClientMessageId: failedMessageId,
    commitTokenHash: crypto.createHash("sha256").update(failedToken).digest("base64url"),
    deleteTokenHash: crypto.randomBytes(32).toString("base64url"),
    lifecycleState: "temporary",
    storageKey: "integration/temporary-ciphertext-object",
    storageType: "r2:private-media",
    expiresAt: new Date(Date.now() + 60_000)
  });
  const rejected = await signedJson(alice, "POST", messagePath, {
    clientMessageId: failedMessageId,
    epoch: 1,
    ciphertext: crypto.randomBytes(160).toString("base64url"),
    attachmentCommit: {
      uploadId: failedUpload.uploadId,
      token: crypto.randomBytes(32).toString("base64url")
    }
  });
  assert.equal(rejected.status, 409, rejected.text);
  const stillTemporary = await AttachmentUpload.findOne({ uploadId: failedUpload.uploadId }).lean();
  assert.equal(stillTemporary.lifecycleState, "temporary");
  assert.notEqual(stillTemporary.expiresAt, null);
  assert.equal(await mongoose.model("CryptoEvent").exists({
    conversationId,
    clientMessageId: failedMessageId
  }), null);
});

test("expired temporary and deletion-pending media cleanup is idempotent", async () => {
  const AttachmentUpload = mongoose.model("AttachmentUpload");
  const cleanupUploads = require("../../scripts/cleanupUploadsTask");
  const base = {
    owner: "cleanup_test",
    encrypted: true,
    protocol: "mls-media-1",
    cryptoConversationId: crypto.randomUUID(),
    cryptoClientId: `${crypto.randomUUID()}:${crypto.randomBytes(8).toString("hex")}@${CRYPTO_DOMAIN}`,
    bindingId: crypto.randomBytes(24).toString("base64url"),
    ciphertextHash: crypto.randomBytes(32).toString("base64url"),
    storageType: "r2:private-media"
  };
  const expired = await AttachmentUpload.create({
    ...base,
    uploadId: crypto.randomBytes(24).toString("base64url"),
    storageKey: "integration/expired-temporary",
    lifecycleState: "temporary",
    expiresAt: new Date(Date.now() - 1000)
  });
  const pending = await AttachmentUpload.create({
    ...base,
    uploadId: crypto.randomBytes(24).toString("base64url"),
    bindingId: crypto.randomBytes(24).toString("base64url"),
    storageKey: "integration/deletion-pending",
    lifecycleState: "deletion-pending",
    expiresAt: new Date()
  });
  const committed = await AttachmentUpload.create({
    ...base,
    uploadId: crypto.randomBytes(24).toString("base64url"),
    bindingId: crypto.randomBytes(24).toString("base64url"),
    storageKey: "integration/committed",
    lifecycleState: "committed",
    expiresAt: null,
    committedAt: new Date()
  });
  const deletedKeys = [];
  const first = await cleanupUploads.cleanupR2OrphanUploads({
    deleteObject: async key => deletedKeys.push(key),
    now: new Date()
  });
  assert.equal(first, 2);
  assert.deepEqual(deletedKeys.sort(), [expired.storageKey, pending.storageKey].sort());
  assert.equal(await AttachmentUpload.exists({ _id: committed._id }) !== null, true);
  const second = await cleanupUploads.cleanupR2OrphanUploads({
    deleteObject: async key => deletedKeys.push(key),
    now: new Date()
  });
  assert.equal(second, 0);
});

test("crypto state migration removes the unsafe TTL index and quarantines ambiguous media idempotently", async () => {
  const AttachmentUpload = mongoose.model("AttachmentUpload");
  const migration = require("../../scripts/migrateCryptoState");
  const indexes = await AttachmentUpload.collection.indexes();
  const expiresIndex = indexes.find(index => index.key?.expiresAt === 1);
  if (expiresIndex) await AttachmentUpload.collection.dropIndex(expiresIndex.name);
  await AttachmentUpload.collection.createIndex(
    { expiresAt: 1 },
    { name: "expiresAt_1", expireAfterSeconds: 0 }
  );
  const inserted = await AttachmentUpload.collection.insertOne({
    uploadId: crypto.randomBytes(24).toString("base64url"),
    owner: "migration_test",
    encrypted: true,
    protocol: "mls-media-1",
    cryptoConversationId: crypto.randomUUID(),
    cryptoClientId: `${crypto.randomUUID()}:${crypto.randomBytes(8).toString("hex")}@${CRYPTO_DOMAIN}`,
    bindingId: crypto.randomBytes(24).toString("base64url"),
    ciphertextHash: crypto.randomBytes(32).toString("base64url"),
    storageKey: "integration/legacy-unverified",
    storageType: "r2:private-media",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date()
  });
  const first = await migration.applyMigration();
  assert.equal(first.mediaQuarantined >= 1, true);
  const migrated = await AttachmentUpload.collection.findOne({ _id: inserted.insertedId });
  assert.equal(migrated.lifecycleState, "legacy-unverified");
  assert.equal(migrated.expiresAt, null);
  const migratedIndexes = await AttachmentUpload.collection.indexes();
  assert.equal(migratedIndexes.some(index =>
    index.key?.expiresAt === 1 && index.expireAfterSeconds !== undefined), false);
  const repeated = await migration.applyMigration();
  assert.equal(repeated.alreadyApplied, true);
  await AttachmentUpload.collection.deleteOne({ _id: inserted.insertedId });
});

test("crypto state migration resumes from a durable batch cursor and rejects a parallel lease", async () => {
  const AttachmentUpload = mongoose.model("AttachmentUpload");
  const migration = require("../../scripts/migrateCryptoState");
  const { acquireLease } = require("../../utils/durableMigration");
  const migrations = mongoose.connection.collection("system_migrations");
  await migrations.deleteOne({ _id: migration.MIGRATION_ID });
  const documents = Array.from({ length: 3 }, (_, index) => ({
    uploadId: crypto.randomBytes(24).toString("base64url"),
    owner: "migration_resume_test",
    encrypted: true,
    protocol: "mls-media-1",
    cryptoConversationId: crypto.randomUUID(),
    cryptoClientId: `${crypto.randomUUID()}:${crypto.randomBytes(8).toString("hex")}@${CRYPTO_DOMAIN}`,
    bindingId: crypto.randomBytes(24).toString("base64url"),
    ciphertextHash: crypto.randomBytes(32).toString("base64url"),
    storageKey: `integration/migration-resume-${index}`,
    storageType: "r2:private-media",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date()
  }));
  const inserted = await AttachmentUpload.collection.insertMany(documents);
  let interrupted = false;
  await assert.rejects(
    migration.applyMigration({
      batchSize: 1,
      hooks: {
        afterBatch: () => {
          if (interrupted) return;
          interrupted = true;
          const error = new Error("simulated process stop");
          error.code = "MIGRATION_INTERRUPTED";
          throw error;
        }
      }
    }),
    error => error.code === "MIGRATION_INTERRUPTED"
  );
  const paused = await migrations.findOne({ _id: migration.MIGRATION_ID });
  assert.equal(paused.status, "paused");
  assert.equal(paused.phase, "media");
  assert.ok(paused.cursor);
  const resumed = await migration.applyMigration({ batchSize: 1 });
  assert.equal(resumed.mediaQuarantined, 3);
  assert.equal(await AttachmentUpload.countDocuments({
    owner: "migration_resume_test",
    lifecycleState: "legacy-unverified",
    expiresAt: null
  }), 3);

  await migrations.deleteOne({ _id: migration.MIGRATION_ID });
  await acquireLease(migrations, migration.MIGRATION_ID, {
    owner: "parallel-owner-a",
    version: 1,
    leaseMs: 60_000
  });
  await assert.rejects(
    migration.applyMigration({ owner: "parallel-owner-b" }),
    error => error.code === "MIGRATION_LEASE_BUSY"
  );
  await migrations.deleteOne({ _id: migration.MIGRATION_ID });
  await AttachmentUpload.collection.deleteMany({ _id: { $in: Object.values(inserted.insertedIds) } });
});

test("expired device is rejected and blocks every affected conversation", async () => {
  const carol = await createAccount("carol_test");
  const resolve = await signedJson(carol, "POST", "/crypto/v4/conversations/resolve", {
    chatType: "private",
    targetUsername: carol.username
  });
  assert.equal(resolve.status, 200, resolve.text);
  await CryptoDevice.updateOne({ clientId: carol.clientId }, {
    $set: { manifestExpiresAt: new Date(Date.now() - 1000) }
  });
  const rejected = await signedJson(carol, "GET", "/crypto/v4/devices");
  assert.equal(rejected.status, 401, rejected.text);
  assert.match(rejected.body.error, /expired/i);
  const device = await CryptoDevice.findOne({ clientId: carol.clientId }).lean();
  assert.equal(device.status, "expired");
  const conversation = await CryptoConversation.findOne({ conversationId: resolve.body.conversationId }).lean();
  assert.equal(conversation.blockedForEpochChange, true);
});

test("live WebSocket disconnects after its backing session is revoked", async () => {
  const dave = await createAuthenticatedUser("dave_test");
  const address = server.address();
  const socket = createSocketClient(`http://127.0.0.1:${address.port}`, {
    transports: ["websocket"],
    extraHeaders: { Cookie: dave.cookie },
    reconnection: false,
    timeout: 3000
  });
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  await new Promise(resolve => setTimeout(resolve, 100));
  const disconnected = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("revoked socket remained connected")), 3000);
    socket.once("disconnect", reason => {
      clearTimeout(timer);
      resolve(reason);
    });
  });
  await Session.updateOne({ sessionIdHash: hashSessionId(dave.sessionId) }, { $set: { revokedAt: new Date() } });
  socket.emit("typing", { to: "alice_test" });
  await disconnected;
  assert.equal(socket.connected, false);
  await new Promise(resolve => setTimeout(resolve, 50));
});

test("authentication lifecycle consumes codes and requires explicit reauthentication for account deletion", async () => {
  const email = "auth.integration@example.test";
  const password = "correct horse battery staple";
  const username = "auth_flow";

  const issued = await supertest(app)
    .post("/auth/email-code")
    .set("X-Liotan-CSRF", CSRF_HEADER)
    .send({ email, purpose: "register" })
    .expect(200);
  assert.match(issued.body.devCode, /^\d{8}$/);

  await supertest(app)
    .post("/register")
    .set("X-Liotan-CSRF", CSRF_HEADER)
    .send({ username: "wrong_code", email, password, code: "00000000" })
    .expect(400);

  const registered = await supertest(app)
    .post("/register")
    .set("X-Liotan-CSRF", CSRF_HEADER)
    .send({ username, email, password, code: issued.body.devCode })
    .expect(200);
  const cookie = registered.headers["set-cookie"]?.[0]?.split(";")[0];
  assert.match(cookie || "", /^liotan_auth=/);

  const E2EEConversation = require("../../models/E2EEConversation");
  const E2EEKey = require("../../models/E2EEKey");
  const AttachmentUpload = require("../../models/AttachmentUpload");
  const PendingEmailChange = require("../../models/PendingEmailChange");
  const registeredUser = await User.findOne({ username }).lean();
  await User.updateOne({ username }, { $set: { e2eePublicKey: { legacy: true } } });
  await E2EEConversation.create({
    conversationId: "legacy-auth-flow",
    commitId: "legacy-commit",
    participants: [username],
    createdBy: username
  });
  await E2EEKey.create({
    conversationId: "legacy-auth-flow",
    user: username,
    sender: username,
    commitId: "legacy-commit",
    wrappedKey: "legacy-wrapped-key",
    iv: "legacy-iv"
  });
  await AttachmentUpload.collection.insertOne({
    uploadId: "legacy-unversioned-upload",
    owner: username,
    storageKey: "",
    storageType: "private-media",
    encrypted: true,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000)
  });
  await PendingEmailChange.collection.insertOne({
    userId: registeredUser._id,
    username,
    oldEmailHash: registeredUser.emailHash,
    newEmailHash: "integration-new-email-hash",
    newEmailEnvelope: { encrypted: "integration-test-only" },
    cancelTokenHash: "integration-cancel-token-hash",
    status: "pending",
    requestedAt: new Date(),
    applyAfter: new Date(Date.now() + 24 * 60 * 60 * 1000),
    cancelExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date()
  });

  await supertest(app)
    .get("/auth/session")
    .set("Cookie", cookie)
    .expect(200)
    .expect(response => assert.equal(response.body.username, username));

  await supertest(app)
    .get("/e2ee/identity-backup")
    .set("Cookie", cookie)
    .expect(410);

  await supertest(app)
    .delete("/me/account")
    .set("Cookie", cookie)
    .set("X-Liotan-CSRF", CSRF_HEADER)
    .send({})
    .expect(403)
    .expect(response => assert.equal(response.body.restricted, true));

  await Session.collection.updateMany(
    { username },
    { $set: { createdAt: new Date(Date.now() - 73 * 60 * 60 * 1000) } }
  );

  await supertest(app)
    .delete("/me/account")
    .set("Cookie", cookie)
    .set("X-Liotan-CSRF", CSRF_HEADER)
    .send({})
    .expect(401)
    .expect(response => assert.equal(response.body.recentAuthRequired, true));
  assert(await User.exists({ username }), "account must survive missing reauthentication");

  await supertest(app)
    .delete("/me/account")
    .set("Cookie", cookie)
    .set("X-Liotan-CSRF", CSRF_HEADER)
    .set("Idempotency-Key", crypto.randomBytes(24).toString("base64url"))
    .send({ currentPassword: password, confirm: true })
    .expect(200);
  assert.equal(await User.exists({ username }), null);
  assert.equal(await E2EEConversation.exists({ participants: username }), null);
  assert.equal(await E2EEKey.exists({ user: username }), null);
  assert.equal(await AttachmentUpload.exists({ owner: username }), null);
  assert.equal(await PendingEmailChange.exists({ username }), null);

  await supertest(app)
    .get("/auth/session")
    .set("Cookie", cookie)
    .expect(401);
});

test("profile endpoint does not expose private fields to unrelated users", async () => {
  const viewer = await createAuthenticatedUser("profile_viewer");
  const target = await createAuthenticatedUser("profile_target");
  await User.updateOne({ _id: target.user._id }, {
    $set: {
      displayName: "Public target",
      avatar: "https://avatars.example.invalid/private-object",
      bio: "Private until related",
      e2eePublicKey: { legacy: "must-not-leak" }
    }
  });

  const response = await requestFor(viewer, "GET", "/profile/profile_target");
  assert.equal(response.status, 200, response.text);
  assert.deepEqual(Object.keys(response.body).sort(), ["avatar", "bio", "displayName", "limited", "username"]);
  assert.equal(response.body.username, "profile_target");
  assert.equal(response.body.displayName, "Public target");
  assert.equal(response.body.avatar, "");
  assert.equal(response.body.bio, "");
  assert.equal(response.body.limited, true);
});

test("server blocklist is idempotent, paginated and closes HTTP, MLS, media and disclosure bypasses", async () => {
  const alice = await createAccount("block_alice");
  const bob = await createAccount("block_bob");
  const initialized = await initializePrivateConversation(alice, bob);
  const selfBlock = await sessionJson(alice, "PUT", "/me/blocks/block_alice");
  assert.equal(selfBlock.status, 400, selfBlock.text);
  const block = await sessionJson(alice, "PUT", "/me/blocks/block_bob");
  assert.equal(block.status, 201, block.text);
  const duplicate = await sessionJson(alice, "PUT", "/me/blocks/block_bob");
  assert.equal(duplicate.status, 200, duplicate.text);
  assert.equal(duplicate.body.duplicate, true);

  const blockedResolve = await signedJson(bob, "POST", "/crypto/v4/conversations/resolve", {
    chatType: "private",
    targetUsername: alice.username
  });
  assert.equal(blockedResolve.status, 403, blockedResolve.text);
  assert.equal(blockedResolve.body.error, "private interaction unavailable");

  const blockedOperation = await signedJson(bob, "POST", initialized.operationPath, {});
  assert.equal(blockedOperation.status, 403, blockedOperation.text);
  const blockedMessage = await signedJson(bob, "POST", `/crypto/v4/conversations/${initialized.conversationId}/messages`, {
    clientMessageId: crypto.randomUUID(),
    epoch: 1,
    ciphertext: crypto.randomBytes(160).toString("base64url")
  });
  assert.equal(blockedMessage.status, 403, blockedMessage.text);
  const blockedMedia = await signedJson(bob, "POST", "/crypto/v4/media/upload", {
    conversationId: initialized.conversationId,
    bindingId: crypto.randomBytes(18).toString("base64url"),
    ciphertextHash: crypto.randomBytes(32).toString("base64url"),
    clientMessageId: crypto.randomUUID(),
    bytes: 128
  });
  assert.equal(blockedMedia.status, 403, blockedMedia.text);

  const search = await requestFor(bob, "GET", "/users/search?q=block_alice");
  assert.equal(search.status, 200, search.text);
  assert.deepEqual(search.body, []);
  const profile = await requestFor(bob, "GET", "/profile/block_alice");
  assert.equal(profile.status, 404, profile.text);

  const address = server.address();
  const socketOptions = account => ({
    transports: ["websocket"],
    extraHeaders: { Cookie: account.cookie },
    reconnection: false,
    timeout: 3000
  });
  const aliceSocket = createSocketClient(`http://127.0.0.1:${address.port}`, socketOptions(alice));
  const bobSocket = createSocketClient(`http://127.0.0.1:${address.port}`, socketOptions(bob));
  await Promise.all([aliceSocket, bobSocket].map(socket => new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  })));
  let blockedTypingDelivered = false;
  aliceSocket.once("userTyping", () => { blockedTypingDelivered = true; });
  bobSocket.emit("typing", { to: alice.username });
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(blockedTypingDelivered, false, "Socket.IO typing must not bypass a block relationship");

  const UserBlock = require("../../models/UserBlock");
  const bulkUsers = await User.insertMany(Array.from({ length: 105 }, (_, index) => ({
    username: `blocked_page_${String(index).padStart(3, "0")}`,
    password: "not-used",
    emailHash: crypto.createHash("sha256").update(`blocked-page-${index}@example.invalid`).digest("hex"),
    emailVerified: true
  })));
  await UserBlock.insertMany(bulkUsers.map(user => ({ blockerUserId: alice.user._id, blockedUserId: user._id })));
  const firstPage = await sessionJson(alice, "GET", "/me/blocks?limit=100");
  assert.equal(firstPage.status, 200, firstPage.text);
  assert.equal(firstPage.body.blocks.length, 100);
  assert.equal(firstPage.body.hasMore, true);
  const secondPage = await sessionJson(alice, "GET", `/me/blocks?limit=100&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`);
  assert.equal(secondPage.status, 200, secondPage.text);
  assert.equal(secondPage.body.blocks.length, 6);
  assert.equal(secondPage.body.hasMore, false);
  assert.equal(new Set([...firstPage.body.blocks, ...secondPage.body.blocks].map(item => item.username)).size, 106);

  const unblock = await sessionJson(alice, "DELETE", "/me/blocks/block_bob");
  assert.equal(unblock.status, 200, unblock.text);
  const duplicateUnblock = await sessionJson(alice, "DELETE", "/me/blocks/block_bob");
  assert.equal(duplicateUnblock.status, 200, duplicateUnblock.text);
  assert.equal(duplicateUnblock.body.duplicate, true);
  const typingAfterUnblock = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("typing did not resume after unblock")), 2000);
    aliceSocket.once("userTyping", payload => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
  bobSocket.emit("typing", { to: alice.username });
  assert.equal((await typingAfterUnblock).from, bob.username);
  aliceSocket.close();
  bobSocket.close();
  const resumed = await signedJson(bob, "POST", "/crypto/v4/conversations/resolve", {
    chatType: "private",
    targetUsername: alice.username
  });
  assert.equal(resumed.status, 200, resumed.text);
  assert.equal(resumed.body.conversationId, initialized.conversationId);
});

test("notification settings are account-scoped, versioned and resolve concurrent writes with a current rollback value", async () => {
  const account = await createAuthenticatedUser("notify_account");
  const secondProfile = await createAdditionalSession(account);
  const initial = await sessionJson(account, "GET", "/me/notification-settings");
  assert.equal(initial.status, 200, initial.text);
  assert.equal(initial.body.version, 1);
  assert.equal(initial.body.desktopEnabled, true);

  const changed = await sessionJson(account, "PATCH", "/me/notification-settings", {
    expectedVersion: 1,
    settings: { desktopEnabled: false, volume: 27, groupsEnabled: false }
  });
  assert.equal(changed.status, 200, changed.text);
  assert.equal(changed.body.version, 2);
  const readOtherProfile = await sessionJson(secondProfile, "GET", "/me/notification-settings");
  assert.equal(readOtherProfile.status, 200, readOtherProfile.text);
  assert.equal(readOtherProfile.body.volume, 27);
  assert.equal(readOtherProfile.body.groupsEnabled, false);

  const [left, right] = await Promise.all([
    sessionJson(account, "PATCH", "/me/notification-settings", {
      expectedVersion: 2,
      settings: { privateChatsEnabled: false }
    }),
    sessionJson(secondProfile, "PATCH", "/me/notification-settings", {
      expectedVersion: 2,
      settings: { soundEnabled: false }
    })
  ]);
  const statuses = [left.status, right.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  const conflict = left.status === 409 ? left : right;
  assert.equal(conflict.body.current.version, 3);
  const final = await sessionJson(account, "GET", "/me/notification-settings");
  assert.equal(final.body.version, 3);

  const ClientInvalidation = require("../../models/ClientInvalidation");
  assert.equal(await ClientInvalidation.countDocuments({
    recipientUserId: account.user._id,
    kind: "notification-settings-updated"
  }), 2);
});

test("security email pages expose styled, confirmed actions without inline CSP exceptions", async () => {
  const account = await createAuthenticatedUser("security_page_user");
  const RegistrationCancel = require("../../models/RegistrationCancel");
  const { encryptJson, sha256 } = require("../../security/crypto/secureEnvelope");
  const token = crypto.randomBytes(32).toString("base64url");
  const email = "security-page@example.invalid";
  await Session.collection.updateOne(
    { sessionIdHash: hashSessionId(account.sessionId) },
    { $set: { createdAt: new Date(Date.now() - 73 * 60 * 60 * 1000) } }
  );
  await RegistrationCancel.create({
    userId: account.user._id,
    username: account.username,
    emailHash: account.user.emailHash,
    emailEnvelope: encryptJson({ email }, `registration-email:${account.user._id}`),
    tokenHash: sha256(token),
    sessionIdHash: hashSessionId(account.sessionId),
    deviceName: "Windows · Edge",
    browserName: "Edge",
    osName: "Windows",
    ipHint: "203.0.xxx.xxx",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000)
  });

  const base = `/auth/register/cancel/${token}`;
  const landing = await supertest(app).get(base).set("Accept-Language", "ru").expect(200);
  assert.match(landing.text, /security\/security-pages\.css/);
  assert.doesNotMatch(landing.text, /<style\b|\sstyle=/i);

  const stylesheet = await supertest(app).get("/security/security-pages.css").expect(200);
  assert.match(stylesheet.headers["content-type"], /^text\/css/);

  const suspicious = await supertest(app).get(`${base}/action/suspicious`).set("Accept-Language", "ru").expect(200);
  for (const action of ["revoke-session", "logout-all", "change-password", "delete-step-1"]) {
    assert.match(suspicious.text, new RegExp(`/action/${action}`));
  }

  await supertest(app).get(`${base}/action/delete-step-1`).set("Accept-Language", "ru").expect(200)
    .expect(response => assert.match(response.text, /delete-step-2/));
  await supertest(app).get(`${base}/action/delete-step-2`).set("Accept-Language", "ru").expect(200)
    .expect(response => assert.match(response.text, /delete-final/));
  await supertest(app).get(`${base}/action/change-password`).set("Accept-Language", "ru").expect(200)
    .expect(response => assert.match(response.text, /name="confirm"/));
  await supertest(app)
    .post(`${base}/action/change-password`)
    .type("form")
    .send({ confirm: "1" })
    .expect(200)
    .expect(response => {
      assert.match(response.text, /name="code"/);
      assert.match(response.text, /name="passwordConfirm"/);
    });

  await supertest(app).get(`${base}/action/revoke-session`).set("Accept-Language", "ru").expect(200);
  await supertest(app)
    .post(`${base}/action/revoke-session`)
    .set("Accept-Language", "ru")
    .type("form")
    .send({ confirm: "1" })
    .expect(200)
    .expect(response => assert.match(response.text, /Сессия завершена/));
  assert(await Session.exists({ username: account.username, revokedAt: { $ne: null } }));
});

test("conversation deletion is global, idempotent, invalidates peers and permits only a fresh conversation", async () => {
  const alice = await createAccount("delchat_alice");
  const bob = await createAccount("delchat_bob");
  const initialized = await initializePrivateConversation(alice, bob);
  const oldConversationId = initialized.conversationId;
  const path = `/crypto/v4/conversations/${encodeURIComponent(oldConversationId)}/deletion`;
  const body = { confirm: true };
  const idempotencyKey = crypto.randomBytes(24).toString("base64url");
  const deletion = await requestFor(alice, "POST", path)
    .set(signedHeaders(alice, "POST", path, body))
    .set("Idempotency-Key", idempotencyKey)
    .send(body);
  assert.equal(deletion.status, 200, deletion.text);
  assert.equal(deletion.body.state, "completed");
  assert.equal(await CryptoConversation.countDocuments({ conversationId: oldConversationId }), 0);
  const CryptoEvent = require("../../models/CryptoEvent");
  const CryptoOperation = require("../../models/CryptoOperation");
  const ClientInvalidation = require("../../models/ClientInvalidation");
  assert.equal(await CryptoEvent.countDocuments({ conversationId: oldConversationId }), 0);
  assert.equal(await CryptoOperation.countDocuments({ conversationId: oldConversationId }), 0);
  assert(await ClientInvalidation.exists({
    recipientUserId: bob.user._id,
    kind: "conversation-deleted",
    conversationId: oldConversationId
  }));

  const duplicate = await requestFor(alice, "POST", path)
    .set(signedHeaders(alice, "POST", path, body))
    .set("Idempotency-Key", idempotencyKey)
    .send(body);
  assert.equal(duplicate.status, 200, duplicate.text);
  assert.equal(duplicate.body.workflowId, deletion.body.workflowId);

  const recreated = await signedJson(alice, "POST", "/crypto/v4/conversations/resolve", initialized.resolveBody);
  assert.equal(recreated.status, 200, recreated.text);
  assert.notEqual(recreated.body.conversationId, oldConversationId);
  assert.equal(recreated.body.initialized, false);
  assert.equal(recreated.body.epoch, 0);
  assert.equal(recreated.body.sequence, 0);
});

test("one idempotency key cannot bind to two conversations during a create race", async () => {
  const alice = await createAccount("idem_alice");
  const bob = await createAccount("idem_bob");
  const carol = await createAccount("idem_carol");
  const left = await initializePrivateConversation(alice, bob);
  const right = await initializePrivateConversation(alice, carol);
  const { requestConversationDeletion } = require("../../services/deletionWorkflow");
  const idempotencyKey = crypto.randomBytes(24).toString("base64url");
  const results = await Promise.allSettled([
    requestConversationDeletion({
      userId: alice.user._id,
      username: alice.username,
      conversationId: left.conversationId,
      idempotencyKey
    }),
    requestConversationDeletion({
      userId: alice.user._id,
      username: alice.username,
      conversationId: right.conversationId,
      idempotencyKey
    })
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const rejected = results.find(result => result.status === "rejected");
  assert.equal(rejected.reason?.status, 409);
});

test("group deletion uses the global workflow and the legacy partial-delete endpoint is a tombstone", async () => {
  const owner = await createAccount("delgroup_owner");
  const peer = await createAccount("delgroup_peer");
  const Group = require("../../models/Group");
  const Message = require("../../models/Messages");
  const ClientInvalidation = require("../../models/ClientInvalidation");
  const group = await Group.create({
    name: "Deletion proof",
    owner: owner.username,
    admins: [owner.username],
    members: [owner.username, peer.username]
  });
  const conversationId = crypto.randomUUID();
  await CryptoConversation.create({
    conversationId,
    lookupKey: `group:${group._id}`,
    chatType: "group",
    groupId: group._id,
    participantUserIds: [owner.user._id, peer.user._id],
    participantUsernames: [owner.username, peer.username],
    adminUserIds: [owner.user._id],
    createdByUserId: owner.user._id,
    createdByClientId: owner.clientId
  });
  await Message.create({ chatType: "group", groupId: group._id, from: owner.username, text: "legacy ciphertext tombstone" });

  const legacy = await sessionJson(owner, "DELETE", `/groups/${group._id}`);
  assert.equal(legacy.status, 410, legacy.text);
  assert.equal(legacy.body.error, "mls-v4-required");
  const legacyLeave = await sessionJson(peer, "POST", `/groups/${group._id}/leave`);
  assert.equal(legacyLeave.status, 410, legacyLeave.text);
  assert.equal(legacyLeave.body.error, "mls-v4-required");

  const path = `/crypto/v4/conversations/${conversationId}/deletion`;
  const body = { confirm: true };
  const deleted = await requestFor(owner, "POST", path)
    .set(signedHeaders(owner, "POST", path, body))
    .set("Idempotency-Key", crypto.randomBytes(24).toString("base64url"))
    .send(body);
  assert.equal(deleted.status, 200, deleted.text);
  assert.equal(deleted.body.state, "completed");
  assert.equal(await Group.countDocuments({ _id: group._id }), 0);
  assert.equal(await Message.countDocuments({ groupId: group._id }), 0);
  assert.equal(await CryptoConversation.countDocuments({ conversationId }), 0);
  assert(await ClientInvalidation.exists({
    recipientUserId: peer.user._id,
    kind: "conversation-deleted",
    conversationId,
    chatKey: `group:${group._id}`
  }));
});

test("account deletion destroys multiple private and group conversations with one resumable workflow", async () => {
  const owner = await createAuthenticatedUser("delacct_multi_owner");
  const peerA = await createAuthenticatedUser("delacct_multi_peer_a");
  const peerB = await createAuthenticatedUser("delacct_multi_peer_b");
  const Group = require("../../models/Group");
  const CryptoOperation = require("../../models/CryptoOperation");
  const ClientInvalidation = require("../../models/ClientInvalidation");
  const DeletionWorkflow = require("../../models/DeletionWorkflow");
  const { requestAccountDeletion, runDeletionWorkflow } = require("../../services/deletionWorkflow");
  const privateA = crypto.randomUUID();
  const privateB = crypto.randomUUID();
  const groupConversation = crypto.randomUUID();
  const group = await Group.create({
    name: "Account deletion group",
    owner: peerA.username,
    admins: [peerA.username],
    members: [owner.username, peerA.username, peerB.username]
  });
  const common = {
    createdByUserId: owner.user._id,
    createdByClientId: `${crypto.randomUUID()}:0000000000000001@${CRYPTO_DOMAIN}`
  };
  await CryptoConversation.insertMany([
    {
      ...common,
      conversationId: privateA,
      lookupKey: `private:${[owner.user._id, peerA.user._id].map(String).sort().join(":")}`,
      chatType: "private",
      participantUserIds: [owner.user._id, peerA.user._id],
      participantUsernames: [owner.username, peerA.username],
      adminUserIds: [owner.user._id, peerA.user._id]
    },
    {
      ...common,
      conversationId: privateB,
      lookupKey: `private:${[owner.user._id, peerB.user._id].map(String).sort().join(":")}`,
      chatType: "private",
      participantUserIds: [owner.user._id, peerB.user._id],
      participantUsernames: [owner.username, peerB.username],
      adminUserIds: [owner.user._id, peerB.user._id]
    },
    {
      ...common,
      conversationId: groupConversation,
      lookupKey: `group:${group._id}`,
      chatType: "group",
      groupId: group._id,
      participantUserIds: [owner.user._id, peerA.user._id, peerB.user._id],
      participantUsernames: [owner.username, peerA.username, peerB.username],
      adminUserIds: [peerA.user._id]
    }
  ]);
  await CryptoOperation.collection.insertOne({
    operationId: crypto.randomUUID(),
    conversationId: privateA,
    requestedByUserId: owner.user._id,
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  const [left, right] = await Promise.all([
    requestAccountDeletion({ userId: owner.user._id, username: owner.username, idempotencyKey: crypto.randomBytes(24).toString("base64url") }),
    requestAccountDeletion({ userId: owner.user._id, username: owner.username, idempotencyKey: crypto.randomBytes(24).toString("base64url") })
  ]);
  assert.equal(left.workflowId, right.workflowId);
  const completed = await runDeletionWorkflow({ workflowId: left.workflowId });
  assert.equal(completed.state, "completed");
  assert.equal(await User.countDocuments({ _id: owner.user._id }), 0);
  assert.equal(await CryptoConversation.countDocuments({ conversationId: { $in: [privateA, privateB, groupConversation] } }), 0);
  assert.equal(await Group.countDocuments({ _id: group._id }), 0);
  assert.equal(await CryptoOperation.countDocuments({ conversationId: privateA }), 0);
  const invalidations = await ClientInvalidation.find({
    kind: "account-deleted",
    conversationId: { $in: [privateA, privateB, groupConversation] }
  }).lean();
  assert.equal(invalidations.length, 4);
  assert.deepEqual(new Set(invalidations.map(item => item.conversationId)), new Set([privateA, privateB, groupConversation]));
  const persisted = await DeletionWorkflow.findOne({ workflowId: left.workflowId }).lean();
  assert.equal(persisted.counters.conversations, 3);
  assert.equal(persisted.counters.groups, 1);
  assert.equal(persisted.counters.invalidations, 4);
});

test("account deletion durably invalidates legacy-only private and group dialogs", async () => {
  const owner = await createAuthenticatedUser("delacct_legacy_owner");
  const peer = await createAuthenticatedUser("delacct_legacy_peer");
  const messageOnlyPeer = await createAuthenticatedUser("delacct_legacy_message_peer");
  const Group = require("../../models/Group");
  const Message = require("../../models/Messages");
  const E2EEConversation = require("../../models/E2EEConversation");
  const ClientInvalidation = require("../../models/ClientInvalidation");
  const { requestAccountDeletion, runDeletionWorkflow } = require("../../services/deletionWorkflow");
  const legacyConversationId = `legacy:${crypto.randomUUID()}`;
  const group = await Group.create({
    name: "Legacy deletion group",
    owner: peer.username,
    admins: [peer.username],
    members: [owner.username, peer.username]
  });
  await E2EEConversation.create({
    conversationId: legacyConversationId,
    commitId: crypto.randomUUID(),
    participants: [owner.username, peer.username],
    createdBy: owner.username
  });
  await Message.insertMany([
    { chatType: "private", chatId: legacyConversationId, from: owner.username, to: peer.username, text: "legacy private" },
    { chatType: "private", chatId: `message-only:${crypto.randomUUID()}`, from: messageOnlyPeer.username, to: owner.username, text: "legacy message-only private" },
    { chatType: "group", groupId: group._id, from: peer.username, text: "legacy group" }
  ]);

  const workflow = await requestAccountDeletion({
    userId: owner.user._id,
    username: owner.username,
    idempotencyKey: crypto.randomBytes(24).toString("base64url")
  });
  const completed = await runDeletionWorkflow({ workflowId: workflow.workflowId });
  assert.equal(completed.state, "completed");
  assert.equal(await E2EEConversation.countDocuments({ conversationId: legacyConversationId }), 0);
  assert.equal(await Group.countDocuments({ _id: group._id }), 0);
  assert.equal(await Message.countDocuments({ $or: [{ chatId: legacyConversationId }, { groupId: group._id }] }), 0);
  const invalidations = await ClientInvalidation.find({
    recipientUserId: peer.user._id,
    kind: "account-deleted",
    conversationId: ""
  }).lean();
  assert.equal(invalidations.length, 2);
  assert.deepEqual(new Set(invalidations.map(item => item.chatKey)), new Set([
    owner.username,
    `group:${group._id}`
  ]));
  assert(await ClientInvalidation.exists({
    recipientUserId: messageOnlyPeer.user._id,
    kind: "account-deleted",
    conversationId: "",
    chatKey: owner.username
  }));
});

test("account deletion remains frozen and resumable while an R2 object retry is pending", async () => {
  const owner = await createAuthenticatedUser("delacct_owner");
  const peer = await createAuthenticatedUser("delacct_peer");
  const CryptoConversationModel = require("../../models/CryptoConversation");
  const AttachmentUpload = require("../../models/AttachmentUpload");
  const ClientInvalidation = require("../../models/ClientInvalidation");
  const DeletionObjectTask = require("../../models/DeletionObjectTask");
  const DeletionWorkflow = require("../../models/DeletionWorkflow");
  const {
    requestAccountDeletion,
    runDeletionWorkflow
  } = require("../../services/deletionWorkflow");

  const conversationId = crypto.randomBytes(32).toString("base64url");
  await CryptoConversationModel.create({
    conversationId,
    lookupKey: `private:${[String(owner.user._id), String(peer.user._id)].sort().join(":")}`,
    chatType: "private",
    participantUserIds: [owner.user._id, peer.user._id],
    participantUsernames: [owner.username, peer.username],
    adminUserIds: [owner.user._id, peer.user._id],
    createdByUserId: owner.user._id,
    createdByClientId: `${crypto.randomUUID()}:0000000000000001@integration.crypto.liotan.invalid`
  });
  await AttachmentUpload.create({
    uploadId: crypto.randomBytes(18).toString("base64url"),
    owner: owner.username,
    encrypted: true,
    protocol: "mls-media-1",
    cryptoConversationId: conversationId,
    cryptoClientId: `${crypto.randomUUID()}:0000000000000001@integration.crypto.liotan.invalid`,
    bindingId: crypto.randomBytes(18).toString("base64url"),
    boundClientMessageId: crypto.randomUUID(),
    lifecycleState: "committed",
    storageKey: `liotan/media/${crypto.randomBytes(12).toString("hex")}`,
    storageType: "r2:private-media"
  });
  const workflow = await requestAccountDeletion({
    userId: owner.user._id,
    username: owner.username,
    idempotencyKey: crypto.randomBytes(24).toString("base64url")
  });
  let deleteAttempts = 0;
  const first = await runDeletionWorkflow({
    workflowId: workflow.workflowId,
    adapters: {
      deleteR2: async () => {
        deleteAttempts += 1;
        const error = new Error("temporary R2 failure");
        error.code = "R2_TEMPORARY";
        throw error;
      }
    }
  });
  assert.equal(first.state, "media-deleting");
  assert.equal((await User.findById(owner.user._id)).lifecycleState, "deleting");
  assert(await CryptoConversationModel.exists({ conversationId, lifecycleState: "deleting" }));
  assert.equal(await DeletionObjectTask.countDocuments({ workflowId: workflow.workflowId, state: "pending" }), 1);

  await Promise.all([
    DeletionObjectTask.updateMany(
      { workflowId: workflow.workflowId },
      { $set: { nextAttemptAt: new Date(0) } }
    ),
    DeletionWorkflow.updateOne(
      { workflowId: workflow.workflowId },
      { $set: { nextAttemptAt: new Date(0), leaseExpiresAt: new Date(0), leaseOwner: "" } }
    )
  ]);
  const second = await runDeletionWorkflow({
    workflowId: workflow.workflowId,
    adapters: {
      deleteR2: async () => { deleteAttempts += 1; }
    }
  });
  assert.equal(second.state, "completed");
  assert.equal(deleteAttempts, 2);
  assert.equal(await User.countDocuments({ _id: owner.user._id }), 0);
  assert.equal(await CryptoConversationModel.countDocuments({ conversationId }), 0);
  assert.equal(await AttachmentUpload.countDocuments({ cryptoConversationId: conversationId }), 0);
  assert.equal(await DeletionObjectTask.countDocuments({ workflowId: workflow.workflowId }), 0);
  assert(await ClientInvalidation.exists({
    recipientUserId: peer.user._id,
    kind: "account-deleted",
    conversationId
  }));
  const completed = await DeletionWorkflow.findOne({ workflowId: workflow.workflowId }).lean();
  assert.equal(completed.terminal, true);
  assert.equal(completed.accountUsername, undefined);
  assert.equal(completed.accountEmailHash, undefined);
  assert.equal(completed.accountClientIds, undefined);
  assert.equal(completed.requestedByUserId, undefined);
});

test("message hide is account-scoped, durable across devices and preserves peer ciphertext", async () => {
  const alice = await createAccount("hide_alice");
  const bob = await createAccount("hide_bob");
  const aliceSecond = await registerDevice(alice, { rootKey: alice.rootKey });
  const { conversationId } = await initializePrivateConversation(alice, bob);
  const clientMessageId = crypto.randomUUID();
  const messagePath = `/crypto/v4/conversations/${encodeURIComponent(conversationId)}/messages`;
  const sent = await signedJson(alice, "POST", messagePath, {
    clientMessageId,
    epoch: 1,
    ciphertext: crypto.randomBytes(160).toString("base64url")
  });
  assert.equal(sent.status, 201, sent.text);

  const hidePath = `/crypto/v4/conversations/${encodeURIComponent(conversationId)}/messages/${clientMessageId}/hide`;
  const hidden = await signedJson(alice, "POST", hidePath, {});
  assert.equal(hidden.status, 201, hidden.text);
  const duplicate = await signedJson(alice, "POST", hidePath, {});
  assert.equal(duplicate.status, 201, duplicate.text);

  const MessageVisibility = require("../../models/MessageVisibility");
  const ClientInvalidation = require("../../models/ClientInvalidation");
  const CryptoEvent = require("../../models/CryptoEvent");
  assert.equal(await MessageVisibility.countDocuments({
    userId: alice.user._id,
    conversationId,
    clientMessageId
  }), 1);
  assert.equal(await CryptoEvent.countDocuments({ conversationId, clientMessageId }), 1,
    "hiding for one account must not delete ciphertext required by the peer");
  const durable = await ClientInvalidation.findOne({
    recipientUserId: alice.user._id,
    kind: "message-hidden",
    conversationId,
    clientMessageId
  }).lean();
  assert(durable);
  assert.deepEqual(new Set(durable.pendingClientIds), new Set([alice.clientId, aliceSecond.clientId]));

  const listed = await signedJson(aliceSecond, "GET", "/crypto/v4/invalidations?limit=100");
  assert.equal(listed.status, 200, listed.text);
  assert(listed.body.invalidations.some(item => item.eventId === durable.eventId));
  const acked = await signedJson(aliceSecond, "POST", `/crypto/v4/invalidations/${durable.eventId}/ack`, {});
  assert.equal(acked.status, 200, acked.text);
  const afterAck = await signedJson(aliceSecond, "GET", "/crypto/v4/invalidations?limit=100");
  assert(!afterAck.body.invalidations.some(item => item.eventId === durable.eventId));
});

test("deletion removes avatar objects but retains media with an external reference", async () => {
  const owner = await createAuthenticatedUser("media_owner");
  const peer = await createAuthenticatedUser("media_peer");
  const outsider = await createAuthenticatedUser("media_other");
  const AttachmentUpload = require("../../models/AttachmentUpload");
  const DeletionWorkflow = require("../../models/DeletionWorkflow");
  const { requestAccountDeletion, requestConversationDeletion, runDeletionWorkflow } = require("../../services/deletionWorkflow");
  const sharedKey = `liotan/mls/${crypto.randomBytes(12).toString("hex")}`;
  const targetConversationId = crypto.randomUUID();
  const externalConversationId = crypto.randomUUID();
  const commonConversation = {
    chatType: "private",
    adminUserIds: [owner.user._id, peer.user._id],
    createdByUserId: owner.user._id,
    createdByClientId: `${crypto.randomUUID()}:0000000000000001@${CRYPTO_DOMAIN}`
  };
  await CryptoConversation.insertMany([
    {
      ...commonConversation,
      conversationId: targetConversationId,
      lookupKey: `private:${[owner.user._id, peer.user._id].map(String).sort().join(":")}`,
      participantUserIds: [owner.user._id, peer.user._id],
      participantUsernames: [owner.username, peer.username]
    },
    {
      ...commonConversation,
      conversationId: externalConversationId,
      lookupKey: `private:${[owner.user._id, outsider.user._id].map(String).sort().join(":")}`,
      participantUserIds: [owner.user._id, outsider.user._id],
      participantUsernames: [owner.username, outsider.username]
    }
  ]);
  const upload = conversationId => ({
    uploadId: crypto.randomBytes(18).toString("base64url"),
    owner: owner.username,
    encrypted: true,
    protocol: "mls-media-1",
    cryptoConversationId: conversationId,
    cryptoClientId: commonConversation.createdByClientId,
    bindingId: crypto.randomBytes(18).toString("base64url"),
    boundClientMessageId: crypto.randomUUID(),
    lifecycleState: "committed",
    storageKey: sharedKey,
    storageType: "r2:private-media"
  });
  await AttachmentUpload.insertMany([upload(targetConversationId), upload(externalConversationId)]);
  const conversationWorkflow = await requestConversationDeletion({
    userId: owner.user._id,
    username: owner.username,
    conversationId: targetConversationId,
    idempotencyKey: crypto.randomBytes(24).toString("base64url")
  });
  const objectDeletes = [];
  const conversationResult = await runDeletionWorkflow({
    workflowId: conversationWorkflow.workflowId,
    adapters: { deleteR2: async key => objectDeletes.push(key) }
  });
  assert.equal(conversationResult.state, "completed");
  assert.deepEqual(objectDeletes, [], "an externally referenced object must not be physically deleted");
  assert.equal(await AttachmentUpload.countDocuments({ cryptoConversationId: targetConversationId }), 0);
  assert.equal(await AttachmentUpload.countDocuments({ cryptoConversationId: externalConversationId }), 1);
  const sharedWorkflow = await DeletionWorkflow.findOne({ workflowId: conversationWorkflow.workflowId }).lean();
  assert.equal(sharedWorkflow.counters.sharedMediaRetained, 1);

  const avatarAccount = await createAuthenticatedUser("avatar_owner");
  const avatarKey = `liotan/avatars/${crypto.randomBytes(12).toString("hex")}`;
  await User.updateOne({ _id: avatarAccount.user._id }, {
    $set: { avatar: `https://avatar.invalid/${avatarKey}`, avatarStorageKey: avatarKey, avatarStorageType: "r2:public-avatar" }
  });
  const accountWorkflow = await requestAccountDeletion({
    userId: avatarAccount.user._id,
    username: avatarAccount.username,
    idempotencyKey: crypto.randomBytes(24).toString("base64url")
  });
  const avatarDeletes = [];
  const accountResult = await runDeletionWorkflow({
    workflowId: accountWorkflow.workflowId,
    adapters: { deleteR2: async key => avatarDeletes.push(key) }
  });
  assert.equal(accountResult.state, "completed");
  assert.deepEqual(avatarDeletes, [avatarKey]);
});

test("post-freeze media inventory captures an upload that raced with conversation deletion", async () => {
  const alice = await createAccount("rm_alice");
  const bob = await createAccount("rm_bob");
  const { conversationId } = await initializePrivateConversation(alice, bob);
  const AttachmentUpload = require("../../models/AttachmentUpload");
  const { requestConversationDeletion, runDeletionWorkflow } = require("../../services/deletionWorkflow");
  const storageKey = `liotan/media/${crypto.randomBytes(12).toString("hex")}`;
  const workflow = await requestConversationDeletion({
    userId: alice.user._id,
    username: alice.username,
    conversationId,
    idempotencyKey: crypto.randomBytes(24).toString("base64url")
  });
  const deletedObjects = [];
  const completed = await runDeletionWorkflow({
    workflowId: workflow.workflowId,
    hooks: {
      afterFreeze: async () => {
        await AttachmentUpload.create({
          uploadId: crypto.randomBytes(18).toString("base64url"),
          owner: alice.username,
          encrypted: true,
          protocol: "mls-media-1",
          cryptoConversationId: conversationId,
          cryptoClientId: alice.clientId,
          bindingId: crypto.randomBytes(18).toString("base64url"),
          boundClientMessageId: crypto.randomUUID(),
          lifecycleState: "committed",
          storageKey,
          storageType: "r2:private-media"
        });
      }
    },
    adapters: { deleteR2: async key => deletedObjects.push(key) }
  });
  assert.equal(completed.state, "completed");
  assert.deepEqual(deletedObjects, [storageKey]);
  assert.equal(await AttachmentUpload.countDocuments({ storageKey }), 0);
});

test("conversation deletion wins against concurrent sends and parallel deletion requests", async () => {
  const alice = await createAccount("race_alice");
  const bob = await createAccount("race_bob");
  const { conversationId } = await initializePrivateConversation(alice, bob);
  const deletionPath = `/crypto/v4/conversations/${encodeURIComponent(conversationId)}/deletion`;
  const deletionBody = { confirm: true };
  const deletionRequest = key => requestFor(alice, "POST", deletionPath)
    .set(signedHeaders(alice, "POST", deletionPath, deletionBody))
    .set("Idempotency-Key", key)
    .send(deletionBody);
  const messagePath = `/crypto/v4/conversations/${encodeURIComponent(conversationId)}/messages`;
  const sends = Array.from({ length: 6 }, () => signedJson(alice, "POST", messagePath, {
    clientMessageId: crypto.randomUUID(),
    epoch: 1,
    ciphertext: crypto.randomBytes(160).toString("base64url")
  }));
  const [left, right, ...sendResults] = await Promise.all([
    deletionRequest(crypto.randomBytes(24).toString("base64url")),
    deletionRequest(crypto.randomBytes(24).toString("base64url")),
    ...sends
  ]);
  assert([200, 202].includes(left.status), left.text);
  assert([200, 202].includes(right.status), right.text);
  assert.equal(left.body.workflowId, right.body.workflowId);
  assert(sendResults.every(result => [201, 404, 409].includes(result.status)));
  assert.equal(await CryptoConversation.countDocuments({ conversationId }), 0);
  assert.equal(await mongoose.model("CryptoEvent").countDocuments({ conversationId }), 0);
  const stale = await signedJson(bob, "GET", `/crypto/v4/conversations/${encodeURIComponent(conversationId)}/events?after=0`);
  assert.equal(stale.status, 404, stale.text);
});

test("account deletion without conversations has a single multi-instance worker winner", async () => {
  const account = await createAuthenticatedUser("delacct_empty");
  const { requestAccountDeletion, runDeletionWorkflow } = require("../../services/deletionWorkflow");
  const workflow = await requestAccountDeletion({
    userId: account.user._id,
    username: account.username,
    idempotencyKey: crypto.randomBytes(24).toString("base64url")
  });
  const results = await Promise.all([
    runDeletionWorkflow({ workflowId: workflow.workflowId }),
    runDeletionWorkflow({ workflowId: workflow.workflowId })
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(results.find(Boolean).state, "completed");
  assert.equal(await User.countDocuments({ _id: account.user._id }), 0);
});

test("concurrent avatar replacements have one CAS winner and delete the losing object", async () => {
  const account = await createAuthenticatedUser("avatar_cas_owner");
  const AvatarObject = require("../../models/AvatarObject");
  const { replaceAvatar } = require("../../services/avatarLifecycle");
  const current = await User.findById(account.user._id);
  const deletedKeys = [];
  const deleteFile = async file => {
    deletedKeys.push(file.storageKey);
  };
  const createResult = suffix => ({
    url: `https://avatars.invalid/${suffix}`,
    key: `liotan/avatars/${suffix}`,
    storageType: "r2:public-avatar"
  });
  const replacements = await Promise.allSettled([
    replaceAvatar({
      model: User,
      selector: { _id: current._id },
      current,
      ownerType: "user",
      result: createResult("cas-left.png"),
      avatarUrl: "https://avatars.invalid/cas-left.png?v=1",
      deleteFile
    }),
    replaceAvatar({
      model: User,
      selector: { _id: current._id },
      current,
      ownerType: "user",
      result: createResult("cas-right.png"),
      avatarUrl: "https://avatars.invalid/cas-right.png?v=1",
      deleteFile
    })
  ]);
  assert.equal(replacements.filter(result => result.status === "fulfilled").length, 1);
  const rejected = replacements.find(result => result.status === "rejected");
  assert.equal(rejected.reason.status, 409);
  const persisted = await User.findById(current._id).lean();
  assert.equal(persisted.avatarVersion, 1);
  const records = await AvatarObject.find({
    storageKey: { $in: ["liotan/avatars/cas-left.png", "liotan/avatars/cas-right.png"] }
  }).lean();
  assert.deepEqual(new Set(records.map(record => record.state)), new Set(["active", "deleted"]));
  assert.equal(deletedKeys.length, 1);
  assert.notEqual(deletedKeys[0], persisted.avatarStorageKey);
});

test("avatar reconciliation is dry-run by default and only selects old detached objects", async () => {
  const { cleanupDetachedAvatars } = require("../../services/avatarLifecycle");
  const oldKey = `liotan/avatars/detached-${crypto.randomUUID()}.png`;
  const freshKey = `liotan/avatars/fresh-${crypto.randomUUID()}.png`;
  const page = {
    objects: [
      { key: oldKey, lastModified: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() },
      { key: freshKey, lastModified: new Date().toISOString() }
    ],
    isTruncated: false,
    nextContinuationToken: ""
  };
  const deleted = [];
  const dryRun = await cleanupDetachedAvatars({
    dryRun: true,
    listObjects: async () => page,
    deleteObject: async key => deleted.push(key)
  });
  assert.deepEqual(dryRun.keys, [oldKey]);
  assert.deepEqual(deleted, []);

  const applied = await cleanupDetachedAvatars({
    listObjects: async () => page,
    deleteObject: async key => deleted.push(key)
  });
  assert.deepEqual(applied.keys, [oldKey]);
  assert.deepEqual(deleted, [oldKey]);
});

test("key transparency checkpoints prove inclusion, append-only consistency and reject tampering", async () => {
  const account = await createAccount("kt_owner");
  const {
    CHECKPOINT_DOMAIN,
    leafHash,
    nodeHash
  } = require("../../security/keyTransparency");
  const { verifyEd25519, sha256Base64Url } = require("../../security/cryptoV4");

  const checkpointResponse = await signedJson(
    account,
    "GET",
    "/crypto/v4/transparency/checkpoint"
  );
  assert.equal(checkpointResponse.status, 200, checkpointResponse.text);
  const before = checkpointResponse.body.checkpoint;
  assert(verifyEd25519({
    publicKey: before.signingPublicKey,
    signature: before.signature,
    value: before.checkpoint,
    domain: CHECKPOINT_DOMAIN
  }));
  assert.equal(
    before.signingKeyId,
    sha256Base64Url(Buffer.from(before.signingPublicKey, "base64url"))
  );

  await registerDevice(account, { rootKey: account.rootKey });
  const bootstrap = await requestFor(
    account,
    "GET",
    `/crypto/v4/bootstrap?deviceId=${account.deviceId}`
  );
  assert.equal(bootstrap.status, 200, bootstrap.text);
  const evidence = bootstrap.body.identity.transparency;
  assert(evidence);
  assert.equal(evidence.leaf.directoryHash, bootstrap.body.identity.directory.hash);
  assert.equal(evidence.leafHash, leafHash(evidence.leaf));

  function verifyInclusion(bundle) {
    let hash = bundle.leafHash;
    let index = Number(bundle.leaf.sequence) - 1;
    let last = Number(bundle.checkpoint.checkpoint.treeSize) - 1;
    for (const sibling of bundle.inclusionProof) {
      if (index === last || (index & 1) === 1) {
        hash = nodeHash(sibling, hash);
        while (index !== 0 && (index & 1) === 0) {
          index >>= 1;
          last >>= 1;
        }
      } else {
        hash = nodeHash(hash, sibling);
      }
      index >>= 1;
      last >>= 1;
    }
    return last === 0 && hash === bundle.checkpoint.checkpoint.rootHash;
  }
  assert.equal(verifyInclusion(evidence), true);

  const afterSize = Number(evidence.checkpoint.checkpoint.treeSize);
  const consistencyResponse = await signedJson(
    account,
    "GET",
    `/crypto/v4/transparency/consistency?from=${before.checkpoint.treeSize}&to=${afterSize}`
  );
  assert.equal(consistencyResponse.status, 200, consistencyResponse.text);

  function verifyConsistency(oldSize, oldRoot, newSize, newRoot, proof) {
    let oldIndex = oldSize - 1;
    let newIndex = newSize - 1;
    while ((oldIndex & 1) === 1) {
      oldIndex >>= 1;
      newIndex >>= 1;
    }
    let offset = 0;
    let oldHash;
    let newHash;
    if ((oldSize & (oldSize - 1)) === 0) {
      oldHash = oldRoot;
      newHash = oldRoot;
    } else {
      oldHash = proof[offset];
      newHash = proof[offset];
      offset += 1;
    }
    while (offset < proof.length) {
      const sibling = proof[offset];
      offset += 1;
      if (newIndex === 0) return false;
      if ((oldIndex & 1) === 1 || oldIndex === newIndex) {
        oldHash = nodeHash(sibling, oldHash);
        newHash = nodeHash(sibling, newHash);
        while (oldIndex !== 0 && (oldIndex & 1) === 0) {
          oldIndex >>= 1;
          newIndex >>= 1;
        }
      } else {
        newHash = nodeHash(newHash, sibling);
      }
      oldIndex >>= 1;
      newIndex >>= 1;
    }
    return newIndex === 0 && oldHash === oldRoot && newHash === newRoot;
  }

  const consistency = consistencyResponse.body;
  assert.equal(verifyConsistency(
    Number(consistency.from.checkpoint.treeSize),
    consistency.from.checkpoint.rootHash,
    Number(consistency.to.checkpoint.treeSize),
    consistency.to.checkpoint.rootHash,
    consistency.proof
  ), true);
  const tampered = [...consistency.proof];
  tampered[0] = `${tampered[0][0] === "A" ? "B" : "A"}${tampered[0].slice(1)}`;
  assert.equal(verifyConsistency(
    Number(consistency.from.checkpoint.treeSize),
    consistency.from.checkpoint.rootHash,
    Number(consistency.to.checkpoint.treeSize),
    consistency.to.checkpoint.rootHash,
    tampered
  ), false);
});

test("key transparency backfill migration is resumable, idempotent and preserves durableMigration", async () => {
  const account = await createAuthenticatedUser("kt_legacy");
  const CryptoIdentityModel = require("../../models/CryptoIdentity");
  const CryptoDirectoryEntry = require("../../models/CryptoDirectoryEntry");
  const CryptoTransparencyLeaf = require("../../models/CryptoTransparencyLeaf");
  const migration = require("../../scripts/migrateKeyTransparency");
  const cryptoUserId = crypto.randomUUID();
  const root = crypto.generateKeyPairSync("ed25519");
  const rootPublicKey = rawPublicKey(root.publicKey);
  const identity = await CryptoIdentityModel.create({
    userId: account.user._id,
    username: account.username,
    cryptoUserId,
    rootPublicKey,
    rootFingerprint: crypto.createHash("sha256")
      .update(Buffer.from(rootPublicKey, "base64url"))
      .digest("base64url")
  });
  const statement = {
    v: 1,
    cryptoUserId,
    version: 1,
    previousHash: crypto.randomBytes(32).toString("base64url"),
    devicesHash: crypto.randomBytes(32).toString("base64url"),
    action: "register-device",
    targetDeviceId: crypto.randomBytes(8).toString("hex"),
    timestamp: new Date().toISOString(),
    nonce: crypto.randomBytes(24).toString("base64url")
  };
  const signature = signCanonical(root.privateKey, "liotan-device-directory-v1", statement);
  const hash = crypto.createHash("sha256")
    .update(canonicalJson(["liotan-device-directory-v1", statement, signature]))
    .digest("base64url");
  await CryptoDirectoryEntry.create({
    userId: identity.userId,
    cryptoUserId,
    version: 1,
    previousHash: statement.previousHash,
    hash,
    statement,
    signature
  });

  const before = await migration.inspect();
  assert.equal(before.missingLeaves, 1);
  const applied = await migration.applyMigration({ batchSize: 7 });
  assert.equal(applied.alreadyApplied, false);
  assert(await CryptoTransparencyLeaf.exists({ cryptoUserId, directoryVersion: 1 }));
  const repeated = await migration.applyMigration({ batchSize: 7 });
  assert.equal(repeated.alreadyApplied, true);
  assert.equal((await migration.inspect()).missingLeaves, 0);
  assert.equal(typeof require("../../utils/durableMigration").acquireLease, "function");
});
