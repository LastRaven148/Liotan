"use strict";

const crypto = require("crypto");
const { canonicalJson } = require("../utils/canonicalJson");

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEVICE_ID_RE = /^[0-9a-f]{16}$/;
const CLIENT_ID_RE = /^([0-9a-f-]{36}):([0-9a-f]{16})@([a-z0-9.-]{1,253})$/i;
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function decodeBase64Url(value, expectedBytes, label = "value") {
  const input = String(value || "");
  if (!input || input.length > Math.ceil((expectedBytes || 4096) * 4 / 3) + 4 || !BASE64URL_RE.test(input)) {
    throw new TypeError(`invalid ${label}`);
  }
  const bytes = Buffer.from(input, "base64url");
  if (expectedBytes && bytes.length !== expectedBytes) throw new TypeError(`invalid ${label}`);
  return bytes;
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function sha256Base64Url(value) {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

function importEd25519PublicKey(rawPublicKey) {
  const raw = decodeBase64Url(rawPublicKey, 32, "Ed25519 public key");
  return crypto.createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    format: "der",
    type: "spki"
  });
}

function verifyEd25519({ publicKey, signature, value, domain }) {
  const signatureBytes = decodeBase64Url(signature, 64, "Ed25519 signature");
  const message = Buffer.from(canonicalJson([domain, value]), "utf8");
  return crypto.verify(null, message, importEd25519PublicKey(publicKey), signatureBytes);
}

function parseClientId(clientId, expectedDomain = "") {
  const match = CLIENT_ID_RE.exec(String(clientId || ""));
  if (!match || !UUID_RE.test(match[1])) throw new TypeError("invalid MLS client id");
  if (expectedDomain && match[3].toLowerCase() !== expectedDomain.toLowerCase()) {
    throw new TypeError("invalid MLS client domain");
  }
  return {
    cryptoUserId: match[1].toLowerCase(),
    deviceId: match[2].toLowerCase(),
    domain: match[3].toLowerCase()
  };
}

function isUuid(value) {
  return UUID_RE.test(String(value || ""));
}

function isDeviceId(value) {
  return DEVICE_ID_RE.test(String(value || ""));
}

function cryptoDomain() {
  return String(process.env.LIOTAN_CRYPTO_DOMAIN || "crypto.liotan.invalid").trim().toLowerCase();
}

function isFreshIsoDate(value, { maxAgeMs = 10 * 60 * 1000, maxFutureMs = 2 * 60 * 1000 } = {}) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return false;
  const delta = Date.now() - timestamp;
  return delta <= maxAgeMs && delta >= -maxFutureMs;
}

module.exports = {
  decodeBase64Url,
  encodeBase64Url,
  sha256Base64Url,
  verifyEd25519,
  parseClientId,
  isUuid,
  isDeviceId,
  cryptoDomain,
  isFreshIsoDate
};
