const UserSecurity = require("../../models/UserSecurity");
const { decryptJson } = require("../crypto/secureEnvelope");
const { findBackupCodeHash, generateBackupCodes } = require("../recovery/backupCodes");
const { verifyTotp } = require("./totp");
const { isValidatedSecondFactor } = require("./secondFactorInput");

function envelopeQuery(path, envelope) {
  return {
    [`${path}.version`]: envelope?.version,
    [`${path}.algorithm`]: envelope?.algorithm,
    [`${path}.iv`]: envelope?.iv,
    [`${path}.tag`]: envelope?.tag,
    [`${path}.data`]: envelope?.data
  };
}

function newerStepQuery(step) {
  return {
    $or: [
      { "totp.lastUsedStep": null },
      { "totp.lastUsedStep": { $lt: step } }
    ]
  };
}

async function enabledState(userId) {
  return UserSecurity.findOne({ userId })
    .select("userId totp.enabled totp.secretEnvelope totp.lastUsedStep totp.backupCodeHashes")
    .lean();
}

function verifyFactorAgainstState({ state, userId, factor }) {
  if (!isValidatedSecondFactor(factor)) return { ok: false };

  let totpVerification = { ok: false };
  try {
    const { secret } = decryptJson(state.totp.secretEnvelope, `totp:${userId}`);
    totpVerification = verifyTotp(secret, factor.totpCode, {
      lastUsedStep: state.totp.lastUsedStep
    });
  } catch {
    totpVerification = { ok: false };
  }

  const matchingBackupHash = findBackupCodeHash(
    state.totp.backupCodeHashes || [],
    factor.backupCode
  );
  if (totpVerification.ok && matchingBackupHash) return { ok: false };
  if (totpVerification.ok) {
    return { ok: true, method: "totp", step: totpVerification.step };
  }
  if (matchingBackupHash) {
    return { ok: true, method: "backup-code", matchingBackupHash };
  }
  return { ok: false };
}

async function consumeSecondFactor({ userId, factor }) {
  const state = await enabledState(userId);
  if (!state?.totp?.enabled) {
    return { ok: true, required: false, method: "none" };
  }

  const verification = verifyFactorAgainstState({ state, userId, factor });
  if (!verification.ok) {
    return { ok: false, required: true, method: "none" };
  }

  if (verification.method === "totp") {
    const result = await UserSecurity.updateOne({
      _id: state._id,
      userId,
      "totp.enabled": true,
      ...envelopeQuery("totp.secretEnvelope", state.totp.secretEnvelope),
      ...newerStepQuery(verification.step)
    }, {
      $set: { "totp.lastUsedStep": verification.step }
    });
    return {
      ok: result.modifiedCount === 1,
      required: true,
      method: "totp",
      stateBinding: result.modifiedCount === 1 ? state.totp.secretEnvelope : null
    };
  }

  const result = await UserSecurity.updateOne({
    _id: state._id,
    userId,
    "totp.enabled": true,
    ...envelopeQuery("totp.secretEnvelope", state.totp.secretEnvelope),
    "totp.backupCodeHashes": verification.matchingBackupHash
  }, {
    $pull: { "totp.backupCodeHashes": verification.matchingBackupHash }
  });
  return {
    ok: result.modifiedCount === 1,
    required: true,
    method: "backup-code",
    stateBinding: result.modifiedCount === 1 ? state.totp.secretEnvelope : null
  };
}

async function activateTotp({ userId, code }) {
  const state = await UserSecurity.findOne({ userId })
    .select("userId totp.enabled totp.pendingSecretEnvelope")
    .lean();
  if (state?.totp?.enabled) return { ok: false, reason: "already-enabled" };
  if (!state?.totp?.pendingSecretEnvelope) return { ok: false, reason: "setup-required" };

  let verified;
  try {
    const { secret } = decryptJson(state.totp.pendingSecretEnvelope, `totp:${userId}`);
    verified = verifyTotp(secret, code);
  } catch {
    return { ok: false, reason: "invalid-code" };
  }
  if (!verified.ok) return { ok: false, reason: "invalid-code" };

  const { codes, hashes } = generateBackupCodes();
  const result = await UserSecurity.updateOne({
    _id: state._id,
    userId,
    "totp.enabled": { $ne: true },
    ...envelopeQuery("totp.pendingSecretEnvelope", state.totp.pendingSecretEnvelope)
  }, {
    $set: {
      "totp.enabled": true,
      "totp.enabledAt": new Date(),
      "totp.secretEnvelope": state.totp.pendingSecretEnvelope,
      "totp.pendingSecretEnvelope": null,
      "totp.lastUsedStep": verified.step,
      "totp.backupCodeHashes": hashes
    }
  });
  return result.modifiedCount === 1
    ? { ok: true, backupCodes: codes }
    : { ok: false, reason: "conflict" };
}

function disableTotpUpdate() {
  return {
    $set: {
      "totp.enabled": false,
      "totp.enabledAt": null,
      "totp.secretEnvelope": null,
      "totp.pendingSecretEnvelope": null,
      "totp.lastUsedStep": null,
      "totp.backupCodeHashes": []
    }
  };
}

async function disableTotpAfterConsumedFactor({ userId, stateBinding }) {
  if (!stateBinding || typeof stateBinding !== "object") return false;
  const result = await UserSecurity.updateOne({
    userId,
    "totp.enabled": true,
    ...envelopeQuery("totp.secretEnvelope", stateBinding)
  }, disableTotpUpdate());
  return result.modifiedCount === 1;
}

async function disableTotpWithSecondFactor({ userId, factor }) {
  const state = await enabledState(userId);
  if (!state?.totp?.enabled) return { ok: true, alreadyDisabled: true };

  const verification = verifyFactorAgainstState({ state, userId, factor });
  if (!verification.ok) return { ok: false };

  if (verification.method === "totp") {
    const result = await UserSecurity.updateOne({
      _id: state._id,
      userId,
      "totp.enabled": true,
      ...envelopeQuery("totp.secretEnvelope", state.totp.secretEnvelope),
      ...newerStepQuery(verification.step)
    }, disableTotpUpdate());
    return { ok: result.modifiedCount === 1 };
  }

  const result = await UserSecurity.updateOne({
    _id: state._id,
    userId,
    "totp.enabled": true,
    ...envelopeQuery("totp.secretEnvelope", state.totp.secretEnvelope),
    "totp.backupCodeHashes": verification.matchingBackupHash
  }, disableTotpUpdate());
  return { ok: result.modifiedCount === 1 };
}

module.exports = {
  activateTotp,
  consumeSecondFactor,
  disableTotpAfterConsumedFactor,
  disableTotpWithSecondFactor
};
