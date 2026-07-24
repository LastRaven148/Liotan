import { verifyCanonical } from "../accountKeys";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  canonicalJson,
  sha256Base64Url,
  textEncoder
} from "../encoding";

export const TRANSPARENCY_CHECKPOINT_DOMAIN = "liotan-key-transparency-checkpoint-v1";

function concatBytes(...parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function transparencyLeafHash(leaf) {
  return sha256Base64Url(concatBytes(
    Uint8Array.of(0),
    textEncoder.encode(canonicalJson(leaf))
  ));
}

export function transparencyNodeHash(left, right) {
  return sha256Base64Url(concatBytes(
    Uint8Array.of(1),
    base64UrlToBytes(left, 32),
    base64UrlToBytes(right, 32)
  ));
}

export function transparencyCheckpointHash(checkpoint, signature) {
  return sha256Base64Url(canonicalJson([
    TRANSPARENCY_CHECKPOINT_DOMAIN,
    checkpoint,
    signature
  ]));
}

export async function verifyTransparencyCheckpoint(evidence, expectedPublicKey = "") {
  const checkpoint = evidence?.checkpoint;
  const publicKey = String(evidence?.signingPublicKey || "");
  if (!checkpoint || checkpoint.v !== 1 ||
    !Number.isSafeInteger(Number(checkpoint.treeSize)) || Number(checkpoint.treeSize) < 1 ||
    !/^[A-Za-z0-9_-]{43}$/.test(String(checkpoint.rootHash || "")) ||
    !/^[A-Za-z0-9_-]{43}$/.test(publicKey) ||
    checkpoint.signingKeyId !== sha256Base64Url(base64UrlToBytes(publicKey, 32)) ||
    evidence.signingKeyId !== checkpoint.signingKeyId ||
    evidence.checkpointHash !== transparencyCheckpointHash(checkpoint, evidence.signature) ||
    (expectedPublicKey && publicKey !== expectedPublicKey) ||
    !await verifyCanonical(
      publicKey,
      evidence.signature,
      TRANSPARENCY_CHECKPOINT_DOMAIN,
      checkpoint
    )) {
    throw new Error("Invalid key transparency checkpoint");
  }
  return evidence;
}

export function verifyTransparencyInclusion({
  leaf,
  leafHash,
  inclusionProof,
  checkpoint
}) {
  const size = Number(checkpoint?.checkpoint?.treeSize);
  const index = Number(leaf?.sequence) - 1;
  if (!Number.isSafeInteger(size) || !Number.isSafeInteger(index) ||
    index < 0 || index >= size || leafHash !== transparencyLeafHash(leaf) ||
    !Array.isArray(inclusionProof)) {
    throw new Error("Invalid key transparency inclusion proof");
  }
  let hash = leafHash;
  let nodeIndex = index;
  let lastNode = size - 1;
  for (const sibling of inclusionProof) {
    base64UrlToBytes(sibling, 32);
    if (nodeIndex === lastNode || (nodeIndex & 1) === 1) {
      hash = transparencyNodeHash(sibling, hash);
      while (nodeIndex !== 0 && (nodeIndex & 1) === 0) {
        nodeIndex >>= 1;
        lastNode >>= 1;
      }
    } else {
      hash = transparencyNodeHash(hash, sibling);
    }
    nodeIndex >>= 1;
    lastNode >>= 1;
  }
  if (lastNode !== 0 || hash !== checkpoint.checkpoint.rootHash) {
    throw new Error("Key transparency inclusion root mismatch");
  }
  return true;
}

export function verifyTransparencyConsistency({
  oldSize,
  oldRoot,
  newSize,
  newRoot,
  proof
}) {
  if (!Number.isSafeInteger(oldSize) || !Number.isSafeInteger(newSize) ||
    oldSize < 1 || newSize < oldSize || !Array.isArray(proof)) {
    throw new Error("Invalid key transparency consistency proof");
  }
  if (oldSize === newSize) {
    if (proof.length || oldRoot !== newRoot) {
      throw new Error("Key transparency checkpoint fork detected");
    }
    return true;
  }
  let oldIndex = oldSize - 1;
  let newIndex = newSize - 1;
  while ((oldIndex & 1) === 1) {
    oldIndex >>= 1;
    newIndex >>= 1;
  }
  let proofIndex = 0;
  let oldHash;
  let newHash;
  if ((oldSize & (oldSize - 1)) === 0) {
    oldHash = oldRoot;
    newHash = oldRoot;
  } else {
    const seed = proof[proofIndex++];
    base64UrlToBytes(seed, 32);
    oldHash = seed;
    newHash = seed;
  }
  while (proofIndex < proof.length) {
    const sibling = proof[proofIndex++];
    base64UrlToBytes(sibling, 32);
    if (newIndex === 0) throw new Error("Oversized key transparency consistency proof");
    if ((oldIndex & 1) === 1 || oldIndex === newIndex) {
      oldHash = transparencyNodeHash(sibling, oldHash);
      newHash = transparencyNodeHash(sibling, newHash);
      while (oldIndex !== 0 && (oldIndex & 1) === 0) {
        oldIndex >>= 1;
        newIndex >>= 1;
      }
    } else {
      newHash = transparencyNodeHash(newHash, sibling);
    }
    oldIndex >>= 1;
    newIndex >>= 1;
  }
  if (newIndex !== 0 || oldHash !== oldRoot || newHash !== newRoot) {
    throw new Error("Key transparency consistency proof mismatch");
  }
  return true;
}

export function transparencyGossipView(evidence) {
  if (!evidence?.checkpoint) return null;
  return {
    checkpoint: evidence.checkpoint,
    signature: evidence.signature,
    checkpointHash: evidence.checkpointHash,
    signingKeyId: evidence.signingKeyId,
    signingPublicKey: evidence.signingPublicKey
  };
}

export function configuredTransparencyPublicKey() {
  const value = String(import.meta.env.VITE_KEY_TRANSPARENCY_PUBLIC_KEY || "").trim();
  if (value) base64UrlToBytes(value, 32);
  return value;
}
