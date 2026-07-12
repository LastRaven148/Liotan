import { CredentialType } from "@wireapp/core-crypto/browser";
import { verifyCanonical } from "../accountKeys";
import { base64UrlToBytes, sha256Base64Url } from "../encoding";
import { getEncryptedRecord, putEncryptedRecord } from "../recoveryStore";
import { clientIdText, constantTimeTextEqual, conversationObject } from "./identifiers";
import { destroyUniffi, destroyUniffiAll } from "./uniffiLifecycle";

export async function verifyDirectory(engine, conversation) {
  if (!Array.isArray(conversation.directory) || !conversation.directory.length) {
    throw new Error("MLS participant directory is unavailable");
  }
  for (const user of conversation.directory) {
    const identity = user.identity;
    if (!identity?.rootPublicKey || sha256Base64Url(base64UrlToBytes(identity.rootPublicKey, 32)) !== identity.rootFingerprint) {
      throw new Error(`Invalid account root for ${user.username}`);
    }
    const pinKey = `root-pin:${user.username}`;
    const pinRecord = await getEncryptedRecord(pinKey, engine.keys.cacheKey);
    const pinned = pinRecord?.rootPublicKey || "";
    if (pinned && !constantTimeTextEqual(pinned, identity.rootPublicKey)) {
      throw new Error(`Safety number changed for ${user.username}; conversation blocked`);
    }
    if (!pinned) {
      await putEncryptedRecord(pinKey, {
        rootPublicKey: identity.rootPublicKey,
        firstSeenAt: new Date().toISOString()
      }, engine.keys.cacheKey);
    }
    for (const device of user.devices || []) {
      const valid = await verifyCanonical(
        identity.rootPublicKey,
        device.manifestSignature,
        "liotan-device-manifest-v1",
        device.manifest
      );
      if (!valid || device.status !== "active" || device.manifest.clientId !== device.clientId ||
        device.manifest.username !== user.username || device.manifest.credentialThumbprint !== device.credentialThumbprint) {
        throw new Error(`Untrusted MLS device for ${user.username}`);
      }
    }
  }
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
