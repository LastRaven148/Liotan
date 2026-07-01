const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

function getRootKey() {
  const secret = String(process.env.SECURITY_ENCRYPTION_SECRET || process.env.JWT_SECRET || "");
  if (secret.length < 32) {
    throw new Error("SECURITY_ENCRYPTION_SECRET or JWT_SECRET must be at least 32 characters");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptJson(value, aad = "liotan") {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getRootKey(), iv);
  cipher.setAAD(Buffer.from(String(aad)));
  const plaintext = Buffer.from(JSON.stringify(value));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: VERSION,
    algorithm: ALGORITHM,
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
    data: encrypted.toString("base64url")
  };
}

function decryptJson(envelope, aad = "liotan") {
  if (!envelope || envelope.version !== VERSION || envelope.algorithm !== ALGORITHM) {
    throw new Error("invalid encrypted envelope");
  }
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getRootKey(),
    Buffer.from(envelope.iv, "base64url")
  );
  decipher.setAAD(Buffer.from(String(aad)));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, "base64url")),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function timingSafeEqualHex(a, b) {
  const left = Buffer.from(String(a || ""), "hex");
  const right = Buffer.from(String(b || ""), "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

module.exports = {
  encryptJson,
  decryptJson,
  randomToken,
  sha256,
  timingSafeEqualHex
};
