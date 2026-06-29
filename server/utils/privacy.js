const crypto =
  require("crypto");

function getSecret() {
  return (
    process.env.PRIVACY_HASH_SECRET ||
    process.env.JWT_SECRET ||
    "liotan-dev-secret"
  );
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
