import { signCanonical, verifyCanonical } from "../accountKeys";
import { canonicalJson, randomId, sha256Base64Url } from "../encoding";

export const DIRECTORY_DOMAIN = "liotan-device-directory-v1";

function digest(value) {
  return sha256Base64Url(canonicalJson(value));
}

function genesisDirectoryHash(identity) {
  return digest([
    "liotan-device-directory-genesis-v1",
    String(identity?.cryptoUserId || ""),
    String(identity?.rootPublicKey || "")
  ]);
}

export function directoryDeviceCommitment(device) {
  const storedStatus = String(device?.status || "pending");
  return {
    deviceId: String(device?.deviceId || ""),
    clientId: String(device?.clientId || device?.manifest?.clientId || ""),
    status: storedStatus === "expired" ? "active" : storedStatus,
    activationMode: String(device?.activationMode || "device-approval"),
    manifestHash: digest([
      "liotan-device-manifest-commitment-v1",
      device?.manifest || null,
      String(device?.manifestSignature || "")
    ]),
    approvalHash: device?.approval && device?.approvalSignature
      ? digest(["liotan-device-approval-commitment-v1", device.approval, device.approvalSignature])
      : "",
    revocationHash: device?.revocation && device?.revocationSignature
      ? digest(["liotan-device-revocation-commitment-v1", device.revocation, device.revocationSignature])
      : ""
  };
}

export function directoryDevicesHash(devices) {
  const commitments = (devices || [])
    .map(directoryDeviceCommitment)
    .sort((left, right) => left.deviceId.localeCompare(right.deviceId));
  return directoryCommitmentsHash(commitments);
}

export function directoryCommitmentsHash(commitments) {
  const normalized = (commitments || [])
    .map(item => ({
      deviceId: String(item?.deviceId || ""),
      clientId: String(item?.clientId || ""),
      status: String(item?.status || "pending"),
      activationMode: String(item?.activationMode || "device-approval"),
      manifestHash: String(item?.manifestHash || ""),
      approvalHash: String(item?.approvalHash || ""),
      revocationHash: String(item?.revocationHash || "")
    }))
    .sort((left, right) => left.deviceId.localeCompare(right.deviceId));
  return digest(["liotan-device-directory-members-v1", normalized]);
}

export async function buildDirectoryMutation(engine, {
  devices,
  nextDevice,
  action,
  targetDeviceId
}) {
  const current = engine.bootstrap.identity.directory;
  if (!current || !Number.isSafeInteger(Number(current.version)) || !current.hash) {
    throw new Error("Signed device directory state is unavailable");
  }
  const prospective = (devices || [])
    .filter(device => device.deviceId !== targetDeviceId)
    .concat(nextDevice);
  const statement = {
    v: 1,
    cryptoUserId: engine.bootstrap.identity.cryptoUserId,
    version: Number(current.version) + 1,
    previousHash: current.hash,
    devicesHash: directoryDevicesHash(prospective),
    action,
    targetDeviceId,
    timestamp: new Date().toISOString(),
    nonce: randomId(24)
  };
  return {
    prospective,
    statement,
    signature: await signCanonical(engine.keys.rootSecretKey, DIRECTORY_DOMAIN, statement)
  };
}

export async function verifySignedDirectory(
  identity,
  commitments = [],
  directoryLog = identity?.directoryLog || [],
  anchor = null
) {
  const directory = identity?.directory;
  if (!directory || Number(directory.version) === 0) {
    if (directory?.hash && directory.hash !== genesisDirectoryHash(identity)) {
      throw new Error("Invalid device directory genesis");
    }
    return { verified: false, firstContact: true };
  }
  if (!directory.statement || !directory.signature ||
    directory.statement.cryptoUserId !== identity.cryptoUserId ||
    Number(directory.statement.version) !== Number(directory.version)) {
    throw new Error("Invalid signed device directory statement");
  }
  const ordered = [...directoryLog].sort((left, right) => Number(left.version) - Number(right.version));
  const currentVersion = Number(directory.version);
  const anchorVersion = Math.max(0, Number(anchor?.directoryVersion) || 0);
  const anchorHash = String(anchor?.directoryHash || "");
  if (anchorVersion > currentVersion || (anchorVersion === currentVersion && anchorHash !== directory.hash)) {
    throw new Error("Device directory rollback or fork detected");
  }
  if (directoryCommitmentsHash(commitments) !== directory.statement.devicesHash) {
    throw new Error("Signed device directory membership mismatch");
  }
  if (anchorVersion === currentVersion && anchorVersion > 0) {
    const validHead = await verifyCanonical(
      identity.rootPublicKey,
      directory.signature,
      DIRECTORY_DOMAIN,
      directory.statement
    );
    if (!validHead) throw new Error("Invalid signed device directory signature");
    return { verified: true, firstContact: false, version: currentVersion, hash: directory.hash };
  }
  if (!ordered.length) {
    throw new Error("Incomplete signed device directory history");
  }
  const fullHistory = Number(ordered[0].version) === 1;
  if (anchorVersion > 0 && Number(ordered[0].version) !== anchorVersion + 1) {
    throw new Error("Signed device directory history does not continue the local pin");
  }
  let previousVersion = anchorVersion > 0 ? anchorVersion : Number(ordered[0].version) - 1;
  let previousHash = anchorVersion > 0
    ? anchorHash
    : fullHistory ? genesisDirectoryHash(identity) : String(ordered[0].previousHash || "");
  for (let index = 0; index < ordered.length; index += 1) {
    const entry = ordered[index];
    const version = previousVersion + 1;
    if (Number(entry.version) !== version || entry.previousHash !== previousHash ||
      Number(entry.statement?.version) !== version || entry.statement?.previousHash !== previousHash ||
      entry.statement?.cryptoUserId !== identity.cryptoUserId) {
      throw new Error("Broken signed device directory chain");
    }
    const valid = await verifyCanonical(
      identity.rootPublicKey,
      entry.signature,
      DIRECTORY_DOMAIN,
      entry.statement
    );
    if (!valid) throw new Error("Invalid signed device directory signature");
    const expectedHash = digest([DIRECTORY_DOMAIN, entry.statement, entry.signature]);
    if (expectedHash !== entry.hash) throw new Error("Invalid signed device directory hash");
    previousHash = entry.hash;
    previousVersion = version;
  }
  const latest = ordered.at(-1);
  if (latest.hash !== directory.hash || latest.signature !== directory.signature ||
    canonicalJson(latest.statement) !== canonicalJson(directory.statement)) {
    throw new Error("Signed device directory head mismatch");
  }
  return {
    verified: true,
    firstContact: false,
    version: currentVersion,
    hash: directory.hash
  };
}
