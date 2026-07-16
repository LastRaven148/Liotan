"use strict";

const crypto = require("crypto");
const { canonicalJson } = require("../utils/canonicalJson");
const { verifyEd25519 } = require("./cryptoV4");

const DIRECTORY_DOMAIN = "liotan-device-directory-v1";
const DIRECTORY_NONCE_RE = /^[A-Za-z0-9_-]{22,96}$/;

function digest(value) {
  return crypto.createHash("sha256").update(canonicalJson(value), "utf8").digest("base64url");
}

function genesisDirectoryHash(identity) {
  return digest([
    "liotan-device-directory-genesis-v1",
    String(identity.cryptoUserId || ""),
    String(identity.rootPublicKey || "")
  ]);
}

function directoryDeviceCommitment(device) {
  const storedStatus = String(device.status || "pending");
  return {
    deviceId: String(device.deviceId || ""),
    clientId: String(device.clientId || device.manifest?.clientId || ""),
    // Manifest expiry is already root-signed and evaluated independently.
    // The server's derived `expired` marker must not rewrite a signed log.
    status: storedStatus === "expired" ? "active" : storedStatus,
    activationMode: String(device.activationMode || "device-approval"),
    manifestHash: digest([
      "liotan-device-manifest-commitment-v1",
      device.manifest || null,
      String(device.manifestSignature || "")
    ]),
    approvalHash: device.approval && device.approvalSignature
      ? digest(["liotan-device-approval-commitment-v1", device.approval, device.approvalSignature])
      : "",
    revocationHash: device.revocation && device.revocationSignature
      ? digest(["liotan-device-revocation-commitment-v1", device.revocation, device.revocationSignature])
      : ""
  };
}

function directoryDevicesHash(devices) {
  const commitments = (devices || [])
    .map(directoryDeviceCommitment)
    .sort((left, right) => left.deviceId.localeCompare(right.deviceId));
  return directoryCommitmentsHash(commitments);
}

function directoryCommitmentsHash(commitments) {
  const normalized = (commitments || [])
    .map(item => ({
      deviceId: String(item.deviceId || ""),
      clientId: String(item.clientId || ""),
      status: String(item.status || "pending"),
      activationMode: String(item.activationMode || "device-approval"),
      manifestHash: String(item.manifestHash || ""),
      approvalHash: String(item.approvalHash || ""),
      revocationHash: String(item.revocationHash || "")
    }))
    .sort((left, right) => left.deviceId.localeCompare(right.deviceId));
  return digest(["liotan-device-directory-members-v1", normalized]);
}

function directoryStateView(identity) {
  const version = Math.max(0, Number(identity?.directoryVersion) || 0);
  return {
    version,
    hash: version > 0 ? String(identity?.directoryHash || "") : genesisDirectoryHash(identity || {}),
    statement: version > 0 ? identity?.directoryStatement || null : null,
    signature: version > 0 ? String(identity?.directorySignature || "") : "",
    firstContact: version === 0
  };
}

function validateDirectoryMutation({ identity, devices, update, signature, action, targetDeviceId }) {
  const current = directoryStateView(identity);
  const statement = update && typeof update === "object" ? update : null;
  if (!statement || statement.v !== 1 ||
    statement.cryptoUserId !== identity.cryptoUserId ||
    statement.version !== current.version + 1 ||
    statement.previousHash !== current.hash ||
    statement.devicesHash !== directoryDevicesHash(devices) ||
    statement.action !== action ||
    statement.targetDeviceId !== String(targetDeviceId || "") ||
    !DIRECTORY_NONCE_RE.test(String(statement.nonce || ""))) {
    throw new TypeError("invalid device directory update");
  }
  const timestamp = Date.parse(String(statement.timestamp || ""));
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 10 * 60 * 1000) {
    throw new TypeError("expired device directory update");
  }
  if (!verifyEd25519({
    publicKey: identity.rootPublicKey,
    signature,
    value: statement,
    domain: DIRECTORY_DOMAIN
  })) {
    throw new TypeError("invalid device directory signature");
  }
  return {
    statement,
    signature: String(signature || ""),
    hash: digest([DIRECTORY_DOMAIN, statement, String(signature || "")]),
    previous: current
  };
}

module.exports = {
  DIRECTORY_DOMAIN,
  digest,
  genesisDirectoryHash,
  directoryDeviceCommitment,
  directoryDevicesHash,
  directoryCommitmentsHash,
  directoryStateView,
  validateDirectoryMutation
};
