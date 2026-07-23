"use strict";

const crypto = require("node:crypto");
const CryptoTransparencyState = require("../models/CryptoTransparencyState");
const CryptoTransparencyLeaf = require("../models/CryptoTransparencyLeaf");
const CryptoTransparencyNode = require("../models/CryptoTransparencyNode");
const CryptoTransparencyCheckpoint = require("../models/CryptoTransparencyCheckpoint");
const { canonicalJson } = require("../utils/canonicalJson");

const STATE_ID = "global-v1";
const CHECKPOINT_DOMAIN = "liotan-key-transparency-checkpoint-v1";
const PRIVATE_DER_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

function sha256(...parts) {
  const hash = crypto.createHash("sha256");
  for (const part of parts) hash.update(part);
  return hash.digest();
}

function hashCanonical(value) {
  return sha256(Buffer.from(canonicalJson(value), "utf8")).toString("base64url");
}

function leafHash(leaf) {
  return sha256(Buffer.from([0]), Buffer.from(canonicalJson(leaf), "utf8")).toString("base64url");
}

function nodeHash(left, right) {
  return sha256(
    Buffer.from([1]),
    Buffer.from(String(left), "base64url"),
    Buffer.from(String(right), "base64url")
  ).toString("base64url");
}

function signingMaterial(source = process.env) {
  const configured = String(source.KEY_TRANSPARENCY_SIGNING_KEY || "").trim();
  const seed = configured
    ? Buffer.from(configured, "base64url")
    : sha256(Buffer.from("liotan-development-only-transparency-key-v1", "utf8"));
  if (seed.length !== 32 || (source.NODE_ENV === "production" && !configured)) {
    throw new TypeError("KEY_TRANSPARENCY_SIGNING_KEY must be a base64url-encoded 32-byte Ed25519 seed");
  }
  const privateKey = crypto.createPrivateKey({
    key: Buffer.concat([PRIVATE_DER_PREFIX, seed]),
    format: "der",
    type: "pkcs8"
  });
  const publicKey = crypto.createPublicKey(privateKey)
    .export({ format: "der", type: "spki" })
    .subarray(-32)
    .toString("base64url");
  return {
    privateKey,
    publicKey,
    keyId: sha256(Buffer.from(publicKey, "base64url")).toString("base64url")
  };
}

function checkpointSignature(privateKey, checkpoint) {
  return crypto.sign(
    null,
    Buffer.from(canonicalJson([CHECKPOINT_DOMAIN, checkpoint]), "utf8"),
    privateKey
  ).toString("base64url");
}

function checkpointView(record) {
  if (!record) return null;
  return {
    checkpoint: record.checkpoint,
    signature: record.signature,
    checkpointHash: record.checkpointHash,
    signingKeyId: record.signingKeyId,
    signingPublicKey: record.signingPublicKey
  };
}

function frontierRoot(frontier) {
  let root = "";
  for (let level = 0; level < frontier.length; level += 1) {
    const peak = String(frontier[level] || "");
    if (!peak) continue;
    root = root ? nodeHash(peak, root) : peak;
  }
  return root;
}

async function appendDirectoryTransparency(identity, verifiedDirectory, session) {
  let state = await CryptoTransparencyState.findById(STATE_ID).session(session);
  if (!state) {
    state = new CryptoTransparencyState({ _id: STATE_ID });
  }
  const material = signingMaterial();
  if (state.signingPublicKey && state.signingPublicKey !== material.publicKey) {
    throw new Error("key transparency signing key changed without a versioned log migration");
  }

  const sequence = Number(state.treeSize || 0) + 1;
  const leaf = {
    v: 1,
    sequence,
    cryptoUserId: identity.cryptoUserId,
    directoryVersion: Number(verifiedDirectory.statement.version),
    directoryHash: verifiedDirectory.hash,
    previousDirectoryHash: verifiedDirectory.statement.previousHash,
    statementHash: hashCanonical([
      "liotan-device-directory-v1",
      verifiedDirectory.statement,
      verifiedDirectory.signature
    ]),
    recordedAt: String(verifiedDirectory.statement.timestamp)
  };
  const newLeafHash = leafHash(leaf);
  let currentHash = newLeafHash;
  let index = sequence - 1;
  let level = 0;
  const frontier = [...(state.frontier || [])];
  const nodes = [];
  while ((index & 1) === 1) {
    const left = String(frontier[level] || "");
    if (!left) throw new Error("key transparency frontier is incomplete");
    currentHash = nodeHash(left, currentHash);
    frontier[level] = "";
    index = Math.floor(index / 2);
    level += 1;
    nodes.push({ level, index, hash: currentHash });
  }
  frontier[level] = currentHash;
  const rootHash = frontierRoot(frontier);
  const checkpoint = {
    v: 1,
    treeSize: sequence,
    rootHash,
    previousCheckpointHash: String(state.checkpointHash || ""),
    timestamp: new Date().toISOString(),
    signingKeyId: material.keyId
  };
  const signature = checkpointSignature(material.privateKey, checkpoint);
  const checkpointHash = hashCanonical([CHECKPOINT_DOMAIN, checkpoint, signature]);

  await CryptoTransparencyLeaf.create([{
    sequence,
    cryptoUserId: identity.cryptoUserId,
    directoryVersion: leaf.directoryVersion,
    directoryHash: leaf.directoryHash,
    leaf,
    leafHash: newLeafHash
  }], { session });
  if (nodes.length) await CryptoTransparencyNode.insertMany(nodes, { session });
  await CryptoTransparencyCheckpoint.create([{
    treeSize: sequence,
    rootHash,
    checkpoint,
    signature,
    checkpointHash,
    signingKeyId: material.keyId,
    signingPublicKey: material.publicKey
  }], { session });

  state.treeSize = sequence;
  state.rootHash = rootHash;
  state.frontier = frontier;
  state.checkpointHash = checkpointHash;
  state.signingKeyId = material.keyId;
  state.signingPublicKey = material.publicKey;
  await state.save({ session });
  return { leaf, leafHash: newLeafHash, checkpoint: checkpointView({
    checkpoint,
    signature,
    checkpointHash,
    signingKeyId: material.keyId,
    signingPublicKey: material.publicKey
  }) };
}

function largestPowerOfTwoLessThan(value) {
  let power = 1;
  while (power * 2 < value) power *= 2;
  return power;
}

async function rangeHash(start, end) {
  const length = end - start;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || length <= 0) {
    throw new TypeError("invalid transparency tree range");
  }
  if (length === 1) {
    const leaf = await CryptoTransparencyLeaf.findOne({ sequence: start + 1 }, "leafHash").lean();
    if (!leaf) throw new Error("key transparency leaf is unavailable");
    return leaf.leafHash;
  }
  if ((length & (length - 1)) === 0 && start % length === 0) {
    const level = Math.log2(length);
    const node = await CryptoTransparencyNode.findOne({
      level,
      index: start / length
    }, "hash").lean();
    if (!node) throw new Error("key transparency node is unavailable");
    return node.hash;
  }
  const split = largestPowerOfTwoLessThan(length);
  const [left, right] = await Promise.all([
    rangeHash(start, start + split),
    rangeHash(start + split, end)
  ]);
  return nodeHash(left, right);
}

async function inclusionPath(index, treeSize, start = 0) {
  if (treeSize === 1) return [];
  const split = largestPowerOfTwoLessThan(treeSize);
  if (index < split) {
    const path = await inclusionPath(index, split, start);
    path.push(await rangeHash(start + split, start + treeSize));
    return path;
  }
  const path = await inclusionPath(index - split, treeSize - split, start + split);
  path.push(await rangeHash(start, start + split));
  return path;
}

async function consistencyPath(oldSize, newSize, complete, start = 0) {
  if (oldSize === newSize) {
    return complete ? [] : [await rangeHash(start, start + newSize)];
  }
  const split = largestPowerOfTwoLessThan(newSize);
  if (oldSize <= split) {
    const path = await consistencyPath(oldSize, split, complete, start);
    path.push(await rangeHash(start + split, start + newSize));
    return path;
  }
  const path = await consistencyPath(oldSize - split, newSize - split, false, start + split);
  path.push(await rangeHash(start, start + split));
  return path;
}

async function latestCheckpoint() {
  return checkpointView(
    await CryptoTransparencyCheckpoint.findOne().sort({ treeSize: -1 }).lean()
  );
}

async function transparencyBundle(identity) {
  if (!identity?.cryptoUserId || Number(identity.directoryVersion || 0) <= 0) return null;
  const [record, checkpointRecord] = await Promise.all([
    CryptoTransparencyLeaf.findOne({
      cryptoUserId: identity.cryptoUserId,
      directoryVersion: Number(identity.directoryVersion)
    }).lean(),
    CryptoTransparencyCheckpoint.findOne().sort({ treeSize: -1 }).lean()
  ]);
  if (!record || !checkpointRecord) throw new Error("directory head is missing from key transparency log");
  return {
    leaf: record.leaf,
    leafHash: record.leafHash,
    inclusionProof: await inclusionPath(record.sequence - 1, checkpointRecord.treeSize),
    checkpoint: checkpointView(checkpointRecord)
  };
}

async function consistencyProof(oldSize, newSize = 0) {
  const current = await CryptoTransparencyCheckpoint.findOne().sort({ treeSize: -1 }).lean();
  const targetSize = newSize || Number(current?.treeSize || 0);
  if (!Number.isSafeInteger(oldSize) || oldSize < 1 ||
    !Number.isSafeInteger(targetSize) || targetSize < oldSize ||
    targetSize > Number(current?.treeSize || 0)) {
    throw new TypeError("invalid key transparency consistency range");
  }
  const [from, to] = await Promise.all([
    CryptoTransparencyCheckpoint.findOne({ treeSize: oldSize }).lean(),
    CryptoTransparencyCheckpoint.findOne({ treeSize: targetSize }).lean()
  ]);
  if (!from || !to) throw new Error("key transparency checkpoint is unavailable");
  return {
    from: checkpointView(from),
    to: checkpointView(to),
    proof: oldSize === targetSize ? [] : await consistencyPath(oldSize, targetSize, true)
  };
}

module.exports = {
  CHECKPOINT_DOMAIN,
  appendDirectoryTransparency,
  checkpointView,
  consistencyProof,
  inclusionPath,
  latestCheckpoint,
  leafHash,
  nodeHash,
  signingMaterial,
  transparencyBundle
};
