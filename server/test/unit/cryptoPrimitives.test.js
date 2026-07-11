"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { canonicalJson } = require("../../utils/canonicalJson");
const {
  decodeBase64Url,
  encodeBase64Url,
  cryptoDomain,
  isDeviceId,
  isFreshIsoDate,
  isUuid,
  parseClientId,
  sha256Base64Url,
  verifyEd25519
} = require("../../security/cryptoV4");

test("canonical JSON is deterministic and rejects ambiguous values", () => {
  assert.equal(
    canonicalJson({ z: [3, { b: true, a: "x" }], a: -0 }),
    '{"a":0,"z":[3,{"a":"x","b":true}]}'
  );
  assert.throws(() => canonicalJson({ value: Number.NaN }), /non-finite/);
  assert.throws(() => canonicalJson({ value: undefined }), /unsupported/);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalJson(cyclic), /cyclic/);
});

test("Ed25519 domain separation rejects mutation and cross-domain replay", () => {
  const pair = crypto.generateKeyPairSync("ed25519");
  const publicKey = pair.publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64url");
  const value = { method: "POST", path: "/crypto/v4/test", nonce: "n" };
  const signature = crypto.sign(
    null,
    Buffer.from(canonicalJson(["liotan-test-v1", value])),
    pair.privateKey
  ).toString("base64url");
  assert.equal(verifyEd25519({ publicKey, signature, domain: "liotan-test-v1", value }), true);
  assert.equal(verifyEd25519({ publicKey, signature, domain: "liotan-test-v2", value }), false);
  assert.equal(verifyEd25519({ publicKey, signature, domain: "liotan-test-v1", value: { ...value, path: "/tampered" } }), false);
});

test("strict Base64URL and MLS ClientId parsing reject malformed input", () => {
  const bytes = crypto.randomBytes(32);
  assert.deepEqual(decodeBase64Url(bytes.toString("base64url"), 32), bytes);
  assert.equal(encodeBase64Url(bytes), bytes.toString("base64url"));
  assert.throws(() => decodeBase64Url("with+padding=", 32), /invalid/);
  assert.throws(() => decodeBase64Url(crypto.randomBytes(31).toString("base64url"), 32), /invalid/);
  const parsed = parseClientId(
    "00000000-0000-4000-8000-000000000001:0123456789abcdef@crypto.example",
    "crypto.example"
  );
  assert.equal(parsed.deviceId, "0123456789abcdef");
  assert.throws(() => parseClientId(
    "00000000-0000-4000-8000-000000000001:0123456789abcdef@evil.example",
    "crypto.example"
  ), /domain/);
  assert.equal(sha256Base64Url(Buffer.from("liotan")), crypto.createHash("sha256").update("liotan").digest("base64url"));
  assert.equal(isUuid(parsed.cryptoUserId), true);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isDeviceId(parsed.deviceId), true);
  assert.equal(isDeviceId("abc"), false);
  assert.equal(cryptoDomain(), "crypto.liotan.invalid");
  assert.equal(isFreshIsoDate(new Date().toISOString()), true);
  assert.equal(isFreshIsoDate("not-a-date"), false);
  assert.equal(isFreshIsoDate(new Date(Date.now() - 60_000).toISOString(), { maxAgeMs: 10, maxFutureMs: 10 }), false);
  assert.equal(isFreshIsoDate(new Date(Date.now() + 60_000).toISOString(), { maxAgeMs: 10, maxFutureMs: 10 }), false);
});
