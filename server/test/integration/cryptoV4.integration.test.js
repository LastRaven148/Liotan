"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { after, before, test } = require("node:test");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const supertest = require("supertest");
const { io: createSocketClient } = require("socket.io-client");

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
  const value = {
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
      "liotan-crypto-request-v1",
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

async function registerDevice(account, { rootKey = null, deviceId = null } = {}) {
  const next = {
    ...account,
    rootKey: rootKey || crypto.generateKeyPairSync("ed25519"),
    requestKey: crypto.generateKeyPairSync("ed25519"),
    deviceId: deviceId || crypto.randomBytes(8).toString("hex")
  };
  const bootstrap = await requestFor(next, "GET", `/crypto/v4/bootstrap?deviceId=${next.deviceId}`).expect(200);
  next.cryptoUserId = bootstrap.body.identity.cryptoUserId;
  next.rootPublicKey = rawPublicKey(next.rootKey.publicKey);

  if (!bootstrap.body.identity.rootPublicKey) {
    const proofValue = {
      cryptoUserId: next.cryptoUserId,
      username: next.username,
      rootPublicKey: next.rootPublicKey,
      createdAt: new Date().toISOString(),
      nonce: crypto.randomBytes(24).toString("base64url")
    };
    await requestFor(next, "POST", "/crypto/v4/identity")
      .set("X-Liotan-CSRF", CSRF_HEADER)
      .send({
        cryptoUserId: next.cryptoUserId,
        rootPublicKey: next.rootPublicKey,
        proof: { ...proofValue, signature: signCanonical(next.rootKey.privateKey, "liotan-account-root-v1", proofValue) }
      })
      .expect(201);
  } else {
    assert.equal(bootstrap.body.identity.rootPublicKey, next.rootPublicKey);
  }

  const now = new Date();
  const manifest = {
    v: 1,
    cryptoUserId: next.cryptoUserId,
    username: next.username,
    deviceId: next.deviceId,
    clientId: `${next.cryptoUserId}:${next.deviceId}@${CRYPTO_DOMAIN}`,
    requestPublicKey: rawPublicKey(next.requestKey.publicKey),
    credentialThumbprint: crypto.randomBytes(32).toString("base64url"),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
  };
  next.clientId = manifest.clientId;
  next.manifest = manifest;
  await requestFor(next, "POST", "/crypto/v4/devices")
    .set("X-Liotan-CSRF", CSRF_HEADER)
    .send({
      manifest,
      signature: signCanonical(next.rootKey.privateKey, "liotan-device-manifest-v1", manifest)
    })
    .expect(201);

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

async function commitOperation(account, conversationId, operation, { welcome = "" } = {}) {
  const body = {
    epoch: operation.expectedEpoch,
    commit: crypto.randomBytes(96).toString("base64url"),
    welcome,
    groupInfo: {
      encryptionType: 0,
      ratchetTreeType: 0,
      payload: crypto.randomBytes(64).toString("base64url")
    }
  };
  const path = `/crypto/v4/conversations/${encodeURIComponent(conversationId)}/operations/${encodeURIComponent(operation.operationId)}/commit`;
  const response = await signedJson(account, "POST", path, body);
  assert.equal(response.status, 201, response.text);
  return response.body;
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

  const eventsPath = `/crypto/v4/conversations/${encodeURIComponent(conversationId)}/events?after=0&limit=100`;
  const events = await signedJson(alice, "GET", eventsPath);
  assert.equal(events.status, 200, events.text);
  assert.deepEqual(events.body.events.map(event => event.kind), ["commit", "message"]);

  const revocation = {
    cryptoUserId: bob.cryptoUserId,
    deviceId: bob.deviceId,
    revokedAt: new Date().toISOString(),
    nonce: crypto.randomBytes(24).toString("base64url")
  };
  const revokePath = `/crypto/v4/devices/${bob.deviceId}/revoke`;
  const revoke = await signedJson(bob, "POST", revokePath, {
    revocation,
    signature: signCanonical(bob.rootKey.privateKey, "liotan-device-revocation-v1", revocation)
  });
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
    .send({ currentPassword: password })
    .expect(200);
  assert.equal(await User.exists({ username }), null);

  await supertest(app)
    .get("/auth/session")
    .set("Cookie", cookie)
    .expect(401);
});
