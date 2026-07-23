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
