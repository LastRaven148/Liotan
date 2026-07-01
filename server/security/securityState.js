const UserSecurity = require("../models/UserSecurity");
const securityPolicy = require("./policies/securityPolicy");

async function getOrCreateUserSecurity(user) {
  const userId = user._id || user.userId;
  const username = user.username;
  let state = await UserSecurity.findOne({ userId });
  if (!state) {
    state = await UserSecurity.create({
      userId,
      username,
      vault: {
        status: "not_configured",
        kdf: {
          name: securityPolicy.vault.kdf,
          iterations: securityPolicy.vault.kdfIterations,
          salt: ""
        }
      }
    });
  }
  return state;
}

function publicSecurityState(state) {
  return {
    totp: {
      enabled: Boolean(state?.totp?.enabled),
      enabledAt: state?.totp?.enabledAt || null,
      backupCodesRemaining: state?.totp?.backupCodeHashes?.length || 0
    },
    vault: {
      status: state?.vault?.status || "not_configured",
      configured: ["prepared", "active", "locked"].includes(state?.vault?.status),
      kdf: state?.vault?.kdf?.name || securityPolicy.vault.kdf,
      kdfIterations: state?.vault?.kdf?.iterations || securityPolicy.vault.kdfIterations
    },
    recovery: {
      backupCodesRemaining: state?.recovery?.backupCodeHashes?.length || 0,
      recoveryPhraseConfigured: Boolean(state?.recovery?.recoveryPhraseVerifier),
      lockedUntil: state?.recovery?.recoveryLockedUntil || null
    },
    deviceTrust: {
      trustedDevices: state?.deviceTrust?.trustedDeviceFingerprints?.length || 0,
      pendingChallenges: state?.deviceTrust?.pendingDeviceChallenges?.length || 0
    },
    highRiskLock: {
      lockedUntil: state?.highRiskLock?.lockedUntil || null,
      reason: state?.highRiskLock?.reason || ""
    }
  };
}

module.exports = {
  getOrCreateUserSecurity,
  publicSecurityState
};
