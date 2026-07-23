import { signCanonical } from "../accountKeys";
import { configureCryptoSigner, signedCryptoRequest, unsignedCryptoPost } from "../cryptoApi";
import { bytesToBase64Url, canonicalJson, randomId, sha256Base64Url } from "../encoding";
import { KEY_PACKAGE_LIFETIME_SECONDS } from "./constants";
import { constantTimeTextEqual } from "./identifiers";
import { buildDirectoryMutation } from "./directory";
import { verifyAndPinAccountDirectory } from "./trust";
import { destroyUniffi } from "./uniffiLifecycle";

function configureEngineSigner(engine, authVersion = engine.keys.authVersion) {
  configureCryptoSigner({
    deviceId: engine.deviceId,
    requestSecretKey: engine.keys.requestSecretKey,
    authVersion,
    sessionBindingId: engine.bootstrap.sessionBindingId
  });
}

async function migrateDeviceAuthentication(engine, existing) {
  if (Number(existing.authVersion) === 2) return existing;
  if (!engine.keys.localRequestSecretKey || !engine.keys.localRequestPublicKey) {
    throw new Error("Local-only device authentication key is unavailable");
  }
  configureEngineSigner(engine, 1);
  const newRequestPublicKey = bytesToBase64Url(engine.keys.localRequestPublicKey);
  const migration = {
    v: 2,
    action: "migrate-device-auth",
    protocol: "liotan-device-auth-v2",
    cryptoUserId: engine.bootstrap.identity.cryptoUserId,
    deviceId: existing.deviceId,
    clientId: existing.clientId,
    oldRequestPublicKey: existing.requestPublicKey,
    newRequestPublicKey,
    sessionBindingId: engine.bootstrap.sessionBindingId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    nonce: randomId(24)
  };
  const [oldProof, newProof] = await Promise.all([
    signCanonical(engine.keys.legacyRequestSecretKey, "liotan-device-auth-migration-v2", migration),
    signCanonical(engine.keys.localRequestSecretKey, "liotan-device-auth-migration-v2", migration)
  ]);
  const manifest = {
    ...existing.manifest,
    v: 2,
    requestPublicKey: newRequestPublicKey,
    authProtocol: "liotan-device-auth-v2",
    sessionBindingId: engine.bootstrap.sessionBindingId
  };
  const manifestSignature = await signCanonical(
    engine.keys.rootSecretKey,
    "liotan-device-manifest-v2",
    manifest
  );
  const nextDevice = {
    ...existing,
    requestPublicKey: newRequestPublicKey,
    authVersion: 2,
    authProtocol: "liotan-device-auth-v2",
    sessionBindingId: engine.bootstrap.sessionBindingId,
    authMigrationState: "v2-active",
    manifest,
    manifestSignature
  };
  const directory = await buildDirectoryMutation(engine, {
    devices: engine.bootstrap.accountDevices || [],
    nextDevice,
    action: "migrate-device-auth",
    targetDeviceId: existing.deviceId
  });
  const response = await signedCryptoRequest(
    `/crypto/v4/devices/${encodeURIComponent(existing.deviceId)}/auth-migration`,
    {
      method: "POST",
      body: {
        migration,
        oldProof,
        newProof,
        manifest,
        manifestSignature,
        directoryUpdate: directory.statement,
        directorySignature: directory.signature
      }
    }
  );
  engine.keys.requestSecretKey = engine.keys.localRequestSecretKey;
  engine.keys.requestPublicKey = engine.keys.localRequestPublicKey;
  engine.keys.authVersion = 2;
  engine.keys.legacyRequestSecretKey?.fill(0);
  engine.keys.legacyRequestSecretKey = null;
  engine.bootstrap.device = response.device;
  engine.bootstrap.identity.directory = response.directory;
  engine.bootstrap.accountDevices = directory.prospective.map(device =>
    device.deviceId === response.device.deviceId ? response.device : device
  );
  configureEngineSigner(engine, 2);
  return response.device;
}

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
  const existing = engine.bootstrap.device;
  const authVersion = existing ? Number(existing.authVersion) || 1 : 2;
  const manifest = {
    v: authVersion,
    cryptoUserId,
    username: engine.username,
    deviceId: engine.deviceId,
    clientId: engine.clientIdString,
    requestPublicKey: bytesToBase64Url(engine.keys.requestPublicKey),
    credentialThumbprint,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    ...(authVersion === 2 ? {
      authProtocol: "liotan-device-auth-v2",
      sessionBindingId: engine.bootstrap.sessionBindingId
    } : {})
  };
  const signature = await signCanonical(
    engine.keys.rootSecretKey,
    authVersion === 2 ? "liotan-device-manifest-v2" : "liotan-device-manifest-v1",
    manifest
  );
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
  if (existing && Number(existing.authVersion || 1) === 1) {
    await migrateDeviceAuthentication(engine, existing);
  } else {
    configureEngineSigner(engine, authVersion);
  }
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
  const devices = [];
  let cursor = "";
  let firstPage = null;
  do {
    const path = `/crypto/v4/devices?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const page = await signedCryptoRequest(path);
    if (!firstPage) firstPage = page;
    else if (canonicalJson(page.directory) !== canonicalJson(firstPage.directory) ||
      canonicalJson(page.deviceCommitments) !== canonicalJson(firstPage.deviceCommitments)) {
      throw new Error("Device directory changed while pagination was in progress");
    }
    devices.push(...(page.devices || []));
    cursor = page.hasMore ? String(page.nextCursor || "") : "";
  } while (cursor);
  const response = firstPage || { deviceCommitments: [], directory: {}, directoryLog: [] };
  const identity = {
    ...engine.bootstrap.identity,
    directory: response.directory,
    directoryLog: response.directoryLog || []
  };
  await verifyAndPinAccountDirectory(engine, {
    username: engine.username,
    identity,
    deviceCommitments: response.deviceCommitments || [],
    allDevices: devices
  });
  engine.bootstrap.identity = identity;
  engine.bootstrap.accountDevices = devices;
  engine.bootstrap.deviceCommitments = response.deviceCommitments || [];
  return {
    currentDeviceId: engine.deviceId,
    devices,
    directory: response.directory,
    securityEvents: response.securityEvents || []
  };
}

export async function renewCryptoDeviceManifestIfNeeded(engine, { force = false } = {}) {
  const current = await listCryptoDevices(engine);
  const target = current.devices.find(device => device.deviceId === engine.deviceId);
  if (!target || target.status !== "active") throw new Error("Current cryptographic device is not active");
  const expiresAt = Date.parse(target.manifestExpiresAt || target.manifest?.expiresAt || "");
  const renewalWindowMs = 45 * 24 * 60 * 60 * 1000;
  if (!force && Number.isFinite(expiresAt) && expiresAt - Date.now() > renewalWindowMs) {
    return { renewed: false, expiresAt: target.manifestExpiresAt || target.manifest.expiresAt };
  }
  const manifest = {
    ...target.manifest,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  };
  const authVersion = Number(target.authVersion) === 2 ? 2 : 1;
  const manifestSignature = await signCanonical(
    engine.keys.rootSecretKey,
    authVersion === 2 ? "liotan-device-manifest-v2" : "liotan-device-manifest-v1",
    manifest
  );
  const renewal = {
    v: authVersion,
    cryptoUserId: engine.bootstrap.identity.cryptoUserId,
    deviceId: target.deviceId,
    clientId: target.clientId,
    previousManifestHash: sha256Base64Url(canonicalJson([
      authVersion === 2 ? "liotan-device-manifest-v2" : "liotan-device-manifest-v1",
      target.manifest,
      target.manifestSignature
    ])),
    newExpiresAt: manifest.expiresAt,
    issuedAt: new Date().toISOString(),
    nonce: randomId(24),
    ...(authVersion === 2 ? {
      action: "renew-device",
      protocol: "liotan-device-auth-v2",
      sessionBindingId: engine.bootstrap.sessionBindingId
    } : {})
  };
  const renewalSignature = await signCanonical(
    engine.keys.requestSecretKey,
    authVersion === 2 ? "liotan-device-renewal-v2" : "liotan-device-renewal-v1",
    renewal
  );
  const nextDevice = { ...target, manifest, manifestSignature, manifestExpiresAt: manifest.expiresAt };
  const directory = await buildDirectoryMutation(engine, {
    devices: current.devices,
    nextDevice,
    action: "renew-device",
    targetDeviceId: target.deviceId
  });
  const response = await signedCryptoRequest(`/crypto/v4/devices/${encodeURIComponent(target.deviceId)}/renew`, {
    method: "POST",
    body: {
      renewal,
      renewalSignature,
      manifest,
      manifestSignature,
      directoryUpdate: directory.statement,
      directorySignature: directory.signature
    }
  });
  engine.bootstrap.device = response.device;
  engine.bootstrap.identity.directory = response.directory;
  engine.bootstrap.accountDevices = directory.prospective.map(device =>
    device.deviceId === response.device.deviceId ? response.device : device
  );
  return { ...response, renewed: !response.duplicate };
}

export async function approveCryptoDevice(engine, deviceId) {
  const current = await listCryptoDevices(engine);
  const targetDeviceId = String(deviceId || "").toLowerCase();
  const target = current.devices.find(device => device.deviceId === targetDeviceId);
  if (!target || target.status !== "pending" || target.activationMode !== "device-approval") {
    throw new Error("Pending cryptographic device not found");
  }
  const useV2 = Number(engine.bootstrap.device?.authVersion) === 2 &&
    Number(target.authVersion) === 2;
  const approval = {
    v: useV2 ? 2 : 1,
    cryptoUserId: engine.bootstrap.identity.cryptoUserId,
    newDeviceId: target.deviceId,
    newClientId: target.clientId,
    requestPublicKey: target.requestPublicKey,
    credentialThumbprint: target.credentialThumbprint,
    challenge: target.approvalChallenge,
    approverClientId: engine.clientIdString,
    ...(useV2 ? {
      action: "approve-device",
      protocol: "liotan-device-auth-v2",
      approverDeviceId: engine.deviceId,
      approverSessionBindingId: engine.bootstrap.sessionBindingId,
      newSessionBindingId: target.sessionBindingId,
      createdAt: new Date().toISOString()
    } : {}),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    nonce: randomId(24)
  };
  const approvalSignature = await signCanonical(
    engine.keys.requestSecretKey,
    useV2 ? "liotan-device-approval-v2" : "liotan-device-approval-v1",
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
