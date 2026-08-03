const UserSecurity = require("../../models/UserSecurity");
const { decryptJson } = require("../crypto/secureEnvelope");
const { findBackupCodeHash, generateBackupCodes } = require("../recovery/backupCodes");
const { verifyTotp } = require("./totp");

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

async function consumeSecondFactor({ userId, code, backupCode }) {
  const state = await enabledState(userId);
  if (!state?.totp?.enabled) {
    return { ok: true, required: false, method: "none" };
  }

  if (code) {
    let verified;
    try {
      const { secret } = decryptJson(state.totp.secretEnvelope, `totp:${userId}`);
      verified = verifyTotp(secret, code, { lastUsedStep: state.totp.lastUsedStep });
    } catch {
      return { ok: false, required: true, method: "totp" };
    }

    if (verified.ok) {
      const result = await UserSecurity.updateOne({
        _id: state._id,
        userId,
        "totp.enabled": true,
        ...envelopeQuery("totp.secretEnvelope", state.totp.secretEnvelope),
        ...newerStepQuery(verified.step)
      }, {
        $set: { "totp.lastUsedStep": verified.step }
      });
      return {
        ok: result.modifiedCount === 1,
        required: true,
        method: "totp"
      };
    }
  }

  if (backupCode) {
    const matchingHash = findBackupCodeHash(state.totp.backupCodeHashes || [], backupCode);
    if (matchingHash) {
      const result = await UserSecurity.updateOne({
        _id: state._id,
        userId,
        "totp.enabled": true,
        "totp.backupCodeHashes": matchingHash
      }, {
        $pull: { "totp.backupCodeHashes": matchingHash }
      });
      return {
        ok: result.modifiedCount === 1,
        required: true,
        method: "backup-code"
      };
    }
  }

  return { ok: false, required: true, method: "none" };
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

async function disableTotpAfterConsumedFactor({ userId }) {
  const result = await UserSecurity.updateOne({
    userId,
    "totp.enabled": true
  }, disableTotpUpdate());
  return result.modifiedCount === 1;
}

async function disableTotpWithSecondFactor({ userId, code, backupCode }) {
  const state = await enabledState(userId);
  if (!state?.totp?.enabled) return { ok: true, alreadyDisabled: true };

  if (code) {
    let verified;
    try {
      const { secret } = decryptJson(state.totp.secretEnvelope, `totp:${userId}`);
      verified = verifyTotp(secret, code, { lastUsedStep: state.totp.lastUsedStep });
    } catch {
      return { ok: false };
    }
    if (verified.ok) {
      const result = await UserSecurity.updateOne({
        _id: state._id,
        userId,
        "totp.enabled": true,
        ...envelopeQuery("totp.secretEnvelope", state.totp.secretEnvelope),
        ...newerStepQuery(verified.step)
      }, disableTotpUpdate());
      return { ok: result.modifiedCount === 1 };
    }
  }

  if (backupCode) {
    const matchingHash = findBackupCodeHash(state.totp.backupCodeHashes || [], backupCode);
    if (matchingHash) {
      const result = await UserSecurity.updateOne({
        _id: state._id,
        userId,
        "totp.enabled": true,
        "totp.backupCodeHashes": matchingHash
      }, disableTotpUpdate());
      return { ok: result.modifiedCount === 1 };
    }
  }

  return { ok: false };
}

module.exports = {
  activateTotp,
  consumeSecondFactor,
  disableTotpAfterConsumedFactor,
  disableTotpWithSecondFactor
};
