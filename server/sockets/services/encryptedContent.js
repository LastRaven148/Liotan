function isValidEncryptedContent(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof value.ciphertext === "string" &&
    value.ciphertext.length > 0 &&
    value.ciphertext.length <= 100000 &&
    typeof value.iv === "string" &&
    value.iv.length > 0 &&
    value.iv.length <= 500 &&
    typeof value.salt === "string" &&
    value.salt.length > 0 &&
    value.salt.length <= 500 &&
    typeof value.nonce === "string" &&
    value.nonce.length >= 16 &&
    value.nonce.length <= 200 &&
    typeof value.alg === "string" &&
    value.alg.length > 0 &&
    value.alg.length <= 100
  );
}

function normalizeEncryptedContent(value) {
  if (!isValidEncryptedContent(value)) {
    return null;
  }

  return {
    ciphertext: value.ciphertext,
    iv: value.iv,
    salt: value.salt,
    alg: value.alg,
    kdf: String(value.kdf || "PBKDF2-SHA256").slice(0, 100),
    iter: Number.isFinite(Number(value.iter))
      ? Math.min(1000000, Math.max(1, Math.floor(Number(value.iter))))
      : 200000,
    kid: String(value.kid || "").slice(0, 300),
    nonce: value.nonce,
    version: Number.isFinite(Number(value.version))
      ? Math.max(1, Math.floor(Number(value.version)))
      : 2
  };
}

function buildMessageContentPayload({ text = "", encryptedContent = null }) {
  const normalizedEncryptedContent = normalizeEncryptedContent(encryptedContent);

  if (normalizedEncryptedContent) {
    return {
      contentMode: "e2ee",
      text: "",
      encryptedContent: normalizedEncryptedContent
    };
  }

  return {
    contentMode: "plain",
    text,
    encryptedContent: undefined
  };
}

module.exports = {
  isValidEncryptedContent,
  normalizeEncryptedContent,
  buildMessageContentPayload
};
