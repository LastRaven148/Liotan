const crypto =
  require("crypto");
const { getRuntimeSecret } = require("../security/secretIsolation");

function getSecret() {
  return getRuntimeSecret("PRIVACY_HASH_SECRET", "privacy-hashes");
}

function hmac(value) {
  return crypto
    .createHmac(
      "sha256",
      getSecret()
    )
    .update(String(value || ""))
    .digest("hex");
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function hashEmail(email) {
  return hmac(
    normalizeEmail(email)
  );
}

function hashIp(value) {
  return hmac(
    String(value || "")
  );
}

module.exports = {
  hmac,
  hashIp,
  normalizeEmail,
  hashEmail
};
