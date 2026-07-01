const { randomToken, sha256, timingSafeEqualHex } = require("../crypto/secureEnvelope");
const securityPolicy = require("../policies/securityPolicy");

function formatCode(token) {
  return token.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20).match(/.{1,4}/g).join("-").toUpperCase();
}

function generateBackupCodes(count = securityPolicy.recovery.backupCodeCount) {
  const codes = [];
  const hashes = [];
  for (let i = 0; i < count; i += 1) {
    const code = formatCode(randomToken(securityPolicy.recovery.backupCodeBytes));
    codes.push(code);
    hashes.push(sha256(normalizeBackupCode(code)));
  }
  return { codes, hashes };
}

function normalizeBackupCode(code) {
  return String(code || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function consumeBackupCode(hashes, code) {
  const hash = sha256(normalizeBackupCode(code));
  const index = hashes.findIndex(item => timingSafeEqualHex(item, hash));
  if (index === -1) {
    return { ok: false, hashes };
  }
  return {
    ok: true,
    hashes: hashes.filter((_, currentIndex) => currentIndex !== index)
  };
}

module.exports = {
  generateBackupCodes,
  consumeBackupCode,
  normalizeBackupCode
};
