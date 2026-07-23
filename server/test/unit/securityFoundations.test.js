"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..", "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("sanitized authentication tokens preserve a bounded JWT expiry", () => {
  const { sanitizeDecodedToken } = require("../../utils/authToken");
  const decoded = sanitizeDecodedToken({
    userId: "0123456789abcdef01234567",
    username: "expiry_user",
    sid: "A".repeat(43),
    iat: 1_750_000_000,
    exp: 1_750_000_900
  });

  assert.equal(decoded.iat, 1_750_000_000);
  assert.equal(decoded.exp, 1_750_000_900);
});

test("crypto device authorization is bound to the authenticated browser session", () => {
  const source = read("server/middleware/cryptoDeviceAuth.js");
  assert.match(source, /sessionIdHash/);
  assert.match(source, /hashSessionId\(req\.user\.sid\)/);
});

test("media authorization and quota reservation happen before multipart parsing", () => {
  const source = read("server/routes/cryptoV4Routes.js");
  const route = source.slice(source.indexOf('"/crypto/v4/media/upload"'));
  assert(route.indexOf("authorizeMediaUpload") > -1);
  assert(route.indexOf("authorizeMediaUpload") < route.indexOf('attachmentUpload.single("attachment")'));
  assert(route.indexOf("reserveMediaUpload") < route.indexOf('attachmentUpload.single("attachment")'));
  assert.match(source, /mediaDownloadLimiter/);
});

test("legacy message and media surfaces are immutable tombstones", () => {
  const attachmentRoutes = read("server/routes/attachmentRoutes.js");
  const groupHistoryRoutes = read("server/routes/groupMessageRoutes.js");
  const connectionHandlers = read("server/sockets/handlers/connectionHandlers.js");
  const userRelations = read("server/utils/userRelations.js");
  assert.match(attachmentRoutes, /legacyMediaGone/);
  assert.match(groupHistoryRoutes, /legacyGroupHistoryGone/);
  assert.doesNotMatch(attachmentRoutes, /attachmentController|downloadAttachment|uploadAttachment/);
  assert.doesNotMatch(groupHistoryRoutes, /groupMessageController|models\/Messages/);
  assert.doesNotMatch(connectionHandlers, /markDeliveredForUser|models\/Messages/);
  assert.doesNotMatch(userRelations, /models\/Messages/);
});

test("the IP safety limiter runs before request bodies are parsed", () => {
  const source = read("server/app.js");
  assert(source.indexOf("strictIpLimiter") > -1);
  assert(source.indexOf("app.use(strictIpLimiter)") < source.indexOf('express.json({ limit: "256kb" })'));
});

test("production CSP forbids base element rewriting", () => {
  const policy = require("../../middleware/contentSecurityPolicy");
  assert.deepEqual(policy.directives.baseUri, ["'none'"]);
});

test("plain npm test builds the deployment bundle before inspecting it", () => {
  const pkg = JSON.parse(read("package.json"));
  const script = pkg.scripts.test;
  assert(script.indexOf("build-client") > -1);
  assert(script.indexOf("build-client") < script.indexOf("test:deployment-bundle"));
});

test("proxy topology ignores spoofed forwarding headers outside trusted CIDRs", () => {
  const { socketClientIp } = require("../../config/proxyTrust");
  const socket = {
    handshake: {
      address: "203.0.113.20",
      headers: { "x-forwarded-for": "198.51.100.9" }
    }
  };
  assert.equal(socketClientIp(socket, {
    NODE_ENV: "production",
    LIOTAN_PROXY_TOPOLOGY: "trusted-nginx",
    TRUSTED_PROXY_CIDRS: "127.0.0.1/32"
  }), "203.0.113.20");

  socket.handshake.address = "127.0.0.1";
  assert.equal(socketClientIp(socket, {
    NODE_ENV: "production",
    LIOTAN_PROXY_TOPOLOGY: "trusted-nginx",
    TRUSTED_PROXY_CIDRS: "127.0.0.1/32"
  }), "198.51.100.9");

  assert.equal(socketClientIp(socket, {
    NODE_ENV: "production",
    LIOTAN_PROXY_TOPOLOGY: "direct",
    TRUSTED_PROXY_CIDRS: ""
  }), "127.0.0.1");
});

test("device authentication v2 uses local entropy, dual-proof migration and explicit recovery events", () => {
  const keys = read("client/src/crypto/accountKeys.jsx");
  const store = read("client/src/crypto/recoveryStore.jsx");
  const identity = read("server/controllers/cryptoV4/identityDevices.js");
  assert.match(keys, /deviceRequestSecretKey/);
  assert.match(store, /loadOrCreateDeviceRequestSecret/);
  assert.doesNotMatch(
    store.slice(store.indexOf("loadOrCreateDeviceRequestSecretInternal")),
    /localStorage/
  );
  assert.match(identity, /oldProof/);
  assert.match(identity, /newProof/);
  assert.match(identity, /liotan-device-auth-migration-v2/);
  assert.match(identity, /CryptoDeviceSecurityEvent/);
  assert.match(identity, /visibleSecurityEventAcknowledged/);
});

test("avatar authorization, limiter and lease run before multipart parsing", () => {
  for (const relativePath of [
    "server/routes/profileRoutes.js",
    "server/routes/groupRoutes.js"
  ]) {
    const source = read(relativePath);
    const route = source.slice(source.indexOf("uploadLimiter"));
    assert(route.indexOf("uploadLimiter") < route.indexOf('upload.single("avatar")'));
    assert(route.indexOf("guard") < route.indexOf('upload.single("avatar")'));
  }
});

test("avatar decoding rejects animation, disguised GIF and oversized dimensions", () => {
  const { isAllowedAvatar } = require("../../middleware/uploadSecurity");
  const { assertSafeAvatarDimensions } = require("../../utils/avatarProcessing");

  assert.equal(isAllowedAvatar({
    mimeType: "image/gif",
    fileName: "avatar.gif",
    size: 128
  }), false);

  const oversizedPng = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(oversizedPng);
  oversizedPng.write("IHDR", 12, "ascii");
  oversizedPng.writeUInt32BE(4097, 16);
  oversizedPng.writeUInt32BE(1, 20);
  assert.throws(
    () => assertSafeAvatarDimensions(oversizedPng, "image/png"),
    err => err.status === 400 && /decode budget/.test(err.message)
  );

  const animatedWebp = Buffer.alloc(30);
  animatedWebp.write("RIFF", 0, "ascii");
  animatedWebp.write("WEBP", 8, "ascii");
  animatedWebp.write("VP8X", 12, "ascii");
  animatedWebp[20] = 0x02;
  assert.throws(
    () => assertSafeAvatarDimensions(animatedWebp, "image/webp"),
    err => err.status === 400 && /animated/.test(err.message)
  );
});
