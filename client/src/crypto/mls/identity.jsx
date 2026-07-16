import { signCanonical } from "../accountKeys";
import { configureCryptoSigner, signedCryptoRequest, unsignedCryptoPost } from "../cryptoApi";
import { bytesToBase64Url, canonicalJson, randomId, sha256Base64Url } from "../encoding";
import { KEY_PACKAGE_LIFETIME_SECONDS } from "./constants";
import { constantTimeTextEqual } from "./identifiers";
import { buildDirectoryMutation } from "./directory";
import { verifyAndPinAccountDirectory } from "./trust";
import { destroyUniffi } from "./uniffiLifecycle";

export async function registerCryptographicIdentity(engine) {
  const cryptoUserId = engine.bootstrap.identity.cryptoUserId;
  const rootPublicKey = bytesToBase64Url(engine.keys.rootPublicKey);
  if (engine.bootstrap.identity.rootPublicKey &&
    !constantTimeTextEqual(engine.bootstrap.identity.rootPublicKey, rootPublicKey)) {
    throw new Error("Recovery key does not match the pinned Liotan account root");
  }
  if (!engine.bootstrap.identity.rootPublicKey) {
    const value = {
      cryptoUserId,
      username: engine.username,
      rootPublicKey,
      createdAt: new Date().toISOString(),
      nonce: randomId(24)
    };
    const signature = await signCanonical(engine.keys.rootSecretKey, "liotan-account-root-v1", value);
    const pinned = await unsignedCryptoPost("/crypto/v4/identity", {
      cryptoUserId,
      rootPublicKey,
      proof: { ...value, signature }
    });
    engine.bootstrap.identity = {
      ...pinned.identity,
      directoryLog: pinned.identity?.directoryLog || []
    };
  }
  await verifyAndPinAccountDirectory(engine, {
    username: engine.username,
    identity: engine.bootstrap.identity,
    deviceCommitments: engine.bootstrap.deviceCommitments || [],
    allDevices: engine.bootstrap.accountDevices || []
  });
  const now = new Date();
  const expires = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const credentialPublicKey = await engine.core.publicKey(engine.credentialRef);
  const credentialThumbprint = sha256Base64Url(canonicalJson({
    crv: "Ed25519",
    kty: "OKP",
    x: bytesToBase64Url(credentialPublicKey)
  }));
  const manifest = {
    v: 1,
    cryptoUserId,
    username: engine.username,
    deviceId: engine.deviceId,
    clientId: engine.clientIdString,
    requestPublicKey: bytesToBase64Url(engine.keys.requestPublicKey),
    credentialThumbprint,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString()
  };
  const signature = await signCanonical(engine.keys.rootSecretKey, "liotan-device-manifest-v1", manifest);
  const existing = engine.bootstrap.device;
  if (existing && (
    existing.clientId !== manifest.clientId ||
    existing.requestPublicKey !== manifest.requestPublicKey ||
    existing.credentialThumbprint !== manifest.credentialThumbprint
  )) {
    throw new Error("This device ID is bound to different cryptographic keys");
  }
  if (existing?.status === "pending") {
    const error = new Error(existing.activationMode === "recovery-bootstrap"
      ? "Explicit recovery bootstrap approval is required"
      : "Approval from an existing cryptographic device is required");
    error.code = existing.activationMode === "recovery-bootstrap"
      ? "mls-recovery-bootstrap-required"
      : "mls-device-approval-required";
    error.device = existing;
    throw error;
  }
  if (existing && existing.status !== "active") {
    const error = new Error("This cryptographic device is no longer active");
    error.code = "mls-device-inactive";
    error.reprovisionRequired = true;
    throw error;
  }
  if (!existing || Number(engine.bootstrap.identity.directory?.version || 0) === 0) {
    const devices = engine.bootstrap.accountDevices || [];
    const activeCount = devices.filter(device => device.status === "active").length;
    const status = existing?.status === "active" || devices.length === 0 ? "active" : "pending";
    const activationMode = existing?.activationMode || (devices.length === 0
      ? "initial"
      : activeCount > 0 ? "device-approval" : "recovery-bootstrap");
    const nextDevice = {
      ...existing,
      deviceId: manifest.deviceId,
      clientId: manifest.clientId,
      requestPublicKey: manifest.requestPublicKey,
      credentialThumbprint: manifest.credentialThumbprint,
      manifest,
      manifestSignature: signature,
      status,
      activationMode
    };
    const directory = await buildDirectoryMutation(engine, {
      devices,
      nextDevice,
      action: "register-device",
      targetDeviceId: manifest.deviceId
    });
    const registered = await unsignedCryptoPost("/crypto/v4/devices", {
      manifest,
      signature,
      directoryUpdate: directory.statement,
      directorySignature: directory.signature
    });
    engine.bootstrap.device = registered.device;
    engine.bootstrap.identity.directory = registered.directory;
    engine.bootstrap.accountDevices = directory.prospective.map(device =>
      device.deviceId === registered.device.deviceId ? registered.device : device
    );
    if (registered.approvalRequired) {
      const error = new Error(registered.recoveryBootstrapRequired
        ? "Explicit recovery bootstrap approval is required"
        : "Approval from an existing cryptographic device is required");
      error.code = registered.recoveryBootstrapRequired
        ? "mls-recovery-bootstrap-required"
        : "mls-device-approval-required";
      error.device = registered.device;
      throw error;
    }
  }
  configureCryptoSigner({ deviceId: engine.deviceId, requestSecretKey: engine.keys.requestSecretKey });
}

export async function publishKeyPackagesIfNeeded(engine) {
  const status = await signedCryptoRequest("/crypto/v4/key-packages/status");
  if (Number(status.available) >= 5) return;
  const packages = await engine.core.transaction(async ctx => {
    const output = [];
    for (let index = 0; index < 10; index += 1) {
      const keyPackage = await ctx.generateKeyPackage(engine.credentialRef, KEY_PACKAGE_LIFETIME_SECONDS);
      try {
        const payload = keyPackage.serialize();
        output.push({ payload: bytesToBase64Url(payload), packageHash: sha256Base64Url(payload) });
      } finally {
        destroyUniffi(keyPackage);
      }
    }
    return output;
  });
  const batch = {
    v: 1,
    cryptoUserId: engine.bootstrap.identity.cryptoUserId,
    deviceId: engine.deviceId,
    clientId: engine.clientIdString,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + KEY_PACKAGE_LIFETIME_SECONDS * 1000).toISOString(),
    packages
  };
  const signature = await signCanonical(engine.keys.rootSecretKey, "liotan-key-package-batch-v1", batch);
  await signedCryptoRequest("/crypto/v4/key-packages", {
    method: "POST",
    body: { batch, signature }
  });
}

export async function listCryptoDevices(engine) {
  const response = await signedCryptoRequest("/crypto/v4/devices");
  const identity = {
    ...engine.bootstrap.identity,
    directory: response.directory,
    directoryLog: response.directoryLog || []
  };
  await verifyAndPinAccountDirectory(engine, {
    username: engine.username,
    identity,
    deviceCommitments: response.deviceCommitments || [],
    allDevices: response.devices || []
  });
  engine.bootstrap.identity = identity;
  engine.bootstrap.accountDevices = response.devices || [];
  engine.bootstrap.deviceCommitments = response.deviceCommitments || [];
  return {
    currentDeviceId: engine.deviceId,
    devices: response.devices || [],
    directory: response.directory
  };
}

export async function approveCryptoDevice(engine, deviceId) {
  const current = await listCryptoDevices(engine);
  const targetDeviceId = String(deviceId || "").toLowerCase();
  const target = current.devices.find(device => device.deviceId === targetDeviceId);
  if (!target || target.status !== "pending" || target.activationMode !== "device-approval") {
    throw new Error("Pending cryptographic device not found");
  }
  const approval = {
    v: 1,
    cryptoUserId: engine.bootstrap.identity.cryptoUserId,
    newDeviceId: target.deviceId,
    newClientId: target.clientId,
    requestPublicKey: target.requestPublicKey,
    credentialThumbprint: target.credentialThumbprint,
    challenge: target.approvalChallenge,
    approverClientId: engine.clientIdString,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    nonce: randomId(24)
  };
  const approvalSignature = await signCanonical(
    engine.keys.requestSecretKey,
    "liotan-device-approval-v1",
    approval
  );
  const nextDevice = {
    ...target,
    status: "active",
    approval,
    approvalSignature,
    approvedByClientId: engine.clientIdString,
    approvalChallenge: ""
  };
  const directory = await buildDirectoryMutation(engine, {
    devices: current.devices,
    nextDevice,
    action: "approve-device",
    targetDeviceId
  });
  return signedCryptoRequest(`/crypto/v4/devices/${encodeURIComponent(targetDeviceId)}/approve`, {
    method: "POST",
    body: {
      approval,
      approvalSignature,
      directoryUpdate: directory.statement,
      directorySignature: directory.signature
    }
  });
}

export async function revokeCryptoDevice(engine, deviceId) {
  const current = await listCryptoDevices(engine);
  const revocation = {
    cryptoUserId: engine.bootstrap.identity.cryptoUserId,
    deviceId: String(deviceId || "").toLowerCase(),
    revokedAt: new Date().toISOString(),
    nonce: randomId(24)
  };
  const signature = await signCanonical(
    engine.keys.rootSecretKey,
    "liotan-device-revocation-v1",
    revocation
  );
  const target = current.devices.find(device => device.deviceId === revocation.deviceId);
  if (!target || target.status !== "active") throw new Error("Active cryptographic device not found");
  const nextDevice = {
    ...target,
    status: "revoked",
    revokedAt: revocation.revokedAt,
    revocation,
    revocationSignature: signature
  };
  const directory = await buildDirectoryMutation(engine, {
    devices: current.devices,
    nextDevice,
    action: "revoke-device",
    targetDeviceId: revocation.deviceId
  });
  return signedCryptoRequest(`/crypto/v4/devices/${encodeURIComponent(revocation.deviceId)}/revoke`, {
    method: "POST",
    body: {
      revocation,
      signature,
      directoryUpdate: directory.statement,
      directorySignature: directory.signature
    }
  });
}
