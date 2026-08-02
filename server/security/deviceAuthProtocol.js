"use strict";

const { canonicalJson } = require("../utils/canonicalJson");
const { hashSessionId } = require("../utils/sessionSecurity");
const { sha256Base64Url } = require("./cryptoV4");

const DEVICE_AUTH_PROTOCOL_V2 = "liotan-device-auth-v2";

function configuredCutoff(name) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return { raw: null, timestamp: null, valid: true };
  const date = new Date(raw);
  const valid = Number.isFinite(date.getTime()) && date.toISOString() === raw;
  return { raw: valid ? raw : null, timestamp: valid ? date.getTime() : NaN, valid };
}

function deviceAuthRolloutConfig() {
  return {
    legacyEnrollmentCutoff: configuredCutoff("DEVICE_AUTH_V2_ENFORCED_AT").raw,
    v1RequestsDisabledAt: configuredCutoff("DEVICE_AUTH_V1_REQUESTS_DISABLED_AT").raw
  };
}

function sessionBindingId(sessionId) {
  return sha256Base64Url(Buffer.from(canonicalJson([
    "liotan-session-binding-v2",
    hashSessionId(sessionId)
  ]), "utf8"));
}

function requestSignatureInput({
  method,
  path,
  timestamp,
  nonce,
  bodyHash,
  deviceId,
  bindingId,
  authVersion
}) {
  if (authVersion !== 2) {
    return {
      domain: "liotan-crypto-request-v1",
      value: { method, path, timestamp, nonce, bodyHash }
    };
  }
  return {
    domain: "liotan-crypto-request-v2",
    value: {
      v: 2,
      action: "crypto-request",
      protocol: DEVICE_AUTH_PROTOCOL_V2,
      method,
      path,
      timestamp,
      nonce,
      bodyHash,
      deviceId,
      sessionBindingId: bindingId
    }
  };
}

function legacyEnrollmentAllowed(createdAt = new Date()) {
  const cutoff = configuredCutoff("DEVICE_AUTH_V2_ENFORCED_AT");
  const timestamp = new Date(createdAt).getTime();
  if (cutoff.timestamp === null) return Number.isFinite(timestamp);
  return Number.isFinite(timestamp) &&
    cutoff.valid &&
    timestamp < cutoff.timestamp;
}

function deviceAuthV1RequestsDisabled(at = new Date()) {
  const cutoff = configuredCutoff("DEVICE_AUTH_V1_REQUESTS_DISABLED_AT");
  const timestamp = new Date(at).getTime();
  if (cutoff.timestamp === null) return false;
  return !cutoff.valid || !Number.isFinite(timestamp) || timestamp >= cutoff.timestamp;
}

module.exports = {
  DEVICE_AUTH_PROTOCOL_V2,
  deviceAuthRolloutConfig,
  sessionBindingId,
  requestSignatureInput,
  legacyEnrollmentAllowed,
  deviceAuthV1RequestsDisabled
};
