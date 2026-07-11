const UserSecurity = require("../../models/UserSecurity");
const { decryptJson } = require("../../security/crypto/secureEnvelope");
const { consumeBackupCode } = require("../../security/recovery/backupCodes");
const { verifyTotp } = require("../../security/totp/totp");

async function verifySecondFactorIfEnabled({ user, code, backupCode }) {
  const security = await UserSecurity.findOne({ userId: user._id });
  if (!security?.totp?.enabled) {
    return { ok: true, required: false };
  }

  if (code) {
    try {
      const { secret } = decryptJson(security.totp.secretEnvelope, `totp:${user._id}`);
      const verified = verifyTotp(secret, code, { lastUsedStep: security.totp.lastUsedStep });
      if (verified.ok) {
        security.totp.lastUsedStep = verified.step;
        await security.save();
        return { ok: true, required: true };
      }
    } catch {
      return { ok: false, required: true };
    }
  }

  if (backupCode) {
    const backup = consumeBackupCode(security.totp.backupCodeHashes || [], backupCode);
    if (backup.ok) {
      security.totp.backupCodeHashes = backup.hashes;
      await security.save();
      return { ok: true, required: true };
    }
  }

  return { ok: false, required: true };
}

module.exports = { verifySecondFactorIfEnabled };
