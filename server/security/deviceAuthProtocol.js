"use strict";

const { canonicalJson } = require("../utils/canonicalJson");
const { hashSessionId } = require("../utils/sessionSecurity");
const { sha256Base64Url } = require("./cryptoV4");

const DEVICE_AUTH_PROTOCOL_V2 = "liotan-device-auth-v2";
const DEVICE_AUTH_V2_ENFORCED_AT = new Date(
  process.env.DEVICE_AUTH_V2_ENFORCED_AT || "2026-08-01T00:00:00.000Z"
);

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
  const timestamp = new Date(createdAt).getTime();
  return Number.isFinite(timestamp) &&
    Number.isFinite(DEVICE_AUTH_V2_ENFORCED_AT.getTime()) &&
    timestamp < DEVICE_AUTH_V2_ENFORCED_AT.getTime();
}

module.exports = {
  DEVICE_AUTH_PROTOCOL_V2,
  DEVICE_AUTH_V2_ENFORCED_AT,
  sessionBindingId,
  requestSignatureInput,
  legacyEnrollmentAllowed
};
