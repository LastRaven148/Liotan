import { CredentialType } from "@wireapp/core-crypto/browser";
import { verifyCanonical } from "../accountKeys";
import { base64UrlToBytes, canonicalJson, sha256Base64Url } from "../encoding";
import { getEncryptedRecord, putEncryptedRecord } from "../recoveryStore";
import { clientIdText, constantTimeTextEqual, conversationObject } from "./identifiers";
import {
  directoryCommitmentsHash,
  directoryDeviceCommitment,
  directoryDevicesHash,
  verifySignedDirectory
} from "./directory";
import { destroyUniffi, destroyUniffiAll } from "./uniffiLifecycle";

export async function verifyAndPinAccountDirectory(engine, {
  username,
  identity,
  deviceCommitments = [],
  allDevices = null
}) {
    if (!identity?.rootPublicKey || sha256Base64Url(base64UrlToBytes(identity.rootPublicKey, 32)) !== identity.rootFingerprint) {
      throw new Error(`Invalid account root for ${username}`);
    }
    const pinKey = `root-pin:${username}`;
    const pinRecord = await getEncryptedRecord(pinKey, engine.keys.cacheKey);
    const pinned = pinRecord?.rootPublicKey || "";
    if (pinned && !constantTimeTextEqual(pinned, identity.rootPublicKey)) {
      throw new Error(`Safety number changed for ${username}; conversation blocked`);
    }
    const proof = await verifySignedDirectory(
      identity,
      deviceCommitments,
      identity.directoryLog || [],
      pinned ? pinRecord : null
    );
    if (Array.isArray(allDevices) &&
      directoryDevicesHash(allDevices) !== directoryCommitmentsHash(deviceCommitments)) {
      throw new Error(`Device directory details do not match commitments for ${username}`);
    }
    const pinnedVersion = Math.max(0, Number(pinRecord?.directoryVersion) || 0);
    const currentVersion = Math.max(0, Number(identity.directory?.version) || 0);
    if (currentVersion < pinnedVersion) {
      throw new Error(`Device directory rollback detected for ${username}; conversation blocked`);
    }
    if (currentVersion === pinnedVersion && pinnedVersion > 0 &&
      pinRecord.directoryHash !== identity.directory.hash) {
      throw new Error(`Device directory fork detected for ${username}; conversation blocked`);
    }
    const verificationStatus = pinned && currentVersion > pinnedVersion
      ? "changed"
      : pinRecord?.verificationStatus || "first-seen";
    if (!pinned || currentVersion > pinnedVersion) {
      await putEncryptedRecord(pinKey, {
        rootPublicKey: identity.rootPublicKey,
        firstSeenAt: pinRecord?.firstSeenAt || new Date().toISOString(),
        verificationStatus,
        verifiedAt: verificationStatus === "verified" ? pinRecord?.verifiedAt || null : null,
        directoryVersion: currentVersion,
        directoryHash: identity.directory?.hash || "",
        directoryCryptographicallyVerified: Boolean(proof.verified)
      }, engine.keys.cacheKey);
    }
    return {
      status: verificationStatus,
      verifiedAt: verificationStatus === "verified" ? pinRecord?.verifiedAt || null : null,
      directoryVersion: currentVersion,
      directoryHash: identity.directory?.hash || "",
      firstContact: !pinned
    };
}

export async function verifyDirectory(engine, conversation) {
  if (!Array.isArray(conversation.directory) || !conversation.directory.length) {
    throw new Error("MLS participant directory is unavailable");
  }
  const trustStates = {};
  for (const user of conversation.directory) {
    const identity = user.identity;
    trustStates[user.username] = await verifyAndPinAccountDirectory(engine, {
      username: user.username,
      identity,
      deviceCommitments: user.deviceCommitments || []
    });
    const commitmentByDevice = new Map(
      (user.deviceCommitments || []).map(item => [item.deviceId, item])
    );
    for (const device of user.devices || []) {
      const commitment = commitmentByDevice.get(device.deviceId);
      if (!commitment || canonicalJson(commitment) !== canonicalJson(directoryDeviceCommitment(device))) {
        throw new Error(`Device commitment mismatch for ${user.username}`);
      }
      const valid = await verifyCanonical(
        identity.rootPublicKey,
        device.manifestSignature,
        Number(device.manifest?.v) === 2
          ? "liotan-device-manifest-v2"
          : "liotan-device-manifest-v1",
        device.manifest
      );
      if (!valid || device.status !== "active" || device.manifest.clientId !== device.clientId ||
        device.manifest.username !== user.username ||
        device.manifest.credentialThumbprint !== device.credentialThumbprint ||
        (Number(device.manifest?.v) === 2 && (
          device.manifest.authProtocol !== "liotan-device-auth-v2" ||
          device.manifest.sessionBindingId !== device.sessionBindingId
        ))) {
        throw new Error(`Untrusted MLS device for ${user.username}`);
      }
    }
  }
  return trustStates;
}

export async function markDirectoryVerified(engine, username, identity) {
  const pinKey = `root-pin:${username}`;
  const pinRecord = await getEncryptedRecord(pinKey, engine.keys.cacheKey);
  if (!pinRecord || !constantTimeTextEqual(pinRecord.rootPublicKey, identity.rootPublicKey) ||
    Number(pinRecord.directoryVersion || 0) !== Number(identity.directory?.version || 0) ||
    String(pinRecord.directoryHash || "") !== String(identity.directory?.hash || "")) {
    throw new Error("Safety number changed before verification completed");
  }
  const verifiedAt = new Date().toISOString();
  await putEncryptedRecord(pinKey, {
    ...pinRecord,
    verificationStatus: "verified",
    verifiedAt
  }, engine.keys.cacheKey);
  return { status: "verified", verifiedAt };
}

export async function validateLocalRoster(engine, conversation) {
  const id = conversationObject(conversation.conversationId);
  let clientIds = [];
  let identities = [];
  try {
    const exists = await engine.core.transaction(ctx => ctx.conversationExists(id));
    if (!exists) return;
    clientIds = await engine.core.transaction(ctx => ctx.getClientIds(id));
    const actualIds = clientIds.map(clientIdText).sort();
    const expectedIds = [...conversation.activeClientIds].sort();
    if (actualIds.length !== expectedIds.length || actualIds.some((item, index) => item !== expectedIds[index])) {
      throw new Error("MLS roster does not match the root-signed device directory");
    }
    identities = await engine.core.transaction(ctx => ctx.getDeviceIdentities(id, clientIds));
    const manifestByClient = new Map(
      conversation.directory.flatMap(user => user.devices || []).map(device => [device.clientId, device])
    );
    identities.forEach((identity, index) => {
      const client = clientIdText(clientIds[index]);
      const manifest = manifestByClient.get(client);
      const expectedThumbprint = manifest?.credentialThumbprint || "";
      if (!manifest || identity.status !== 1 || identity.credentialType !== CredentialType.Basic ||
        !constantTimeTextEqual(identity.thumbprint, expectedThumbprint)) {
        throw new Error("MLS credential is not bound to a root-signed device manifest");
      }
    });
  } finally {
    destroyUniffiAll(identities);
    destroyUniffiAll(clientIds);
    destroyUniffi(id);
  }
}
