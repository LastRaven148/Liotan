import { signCanonical } from "../accountKeys";
import { configureCryptoSigner, signedCryptoRequest, unsignedCryptoPost } from "../cryptoApi";
import { bytesToBase64Url, canonicalJson, randomId, sha256Base64Url } from "../encoding";
import { KEY_PACKAGE_LIFETIME_SECONDS } from "./constants";
import { constantTimeTextEqual } from "./identifiers";
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
    await unsignedCryptoPost("/crypto/v4/identity", {
      cryptoUserId,
      rootPublicKey,
      proof: { ...value, signature }
    });
    engine.bootstrap.identity.rootPublicKey = rootPublicKey;
    engine.bootstrap.identity.rootFingerprint = sha256Base64Url(engine.keys.rootPublicKey);
  }
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
  await unsignedCryptoPost("/crypto/v4/devices", { manifest, signature });
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
  return {
    currentDeviceId: engine.deviceId,
    devices: response.devices || []
  };
}

export async function revokeCryptoDevice(engine, deviceId) {
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
  return signedCryptoRequest(`/crypto/v4/devices/${encodeURIComponent(revocation.deviceId)}/revoke`, {
    method: "POST",
    body: { revocation, signature }
  });
}
