const crypto = require("crypto");
const securityPolicy = require("../policies/securityPolicy");

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input) {
  const clean = String(input || "").replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error("invalid base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(securityPolicy.totp.secretBytes));
}

function hotp(secret, counter, digits = securityPolicy.totp.digits) {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** digits).padStart(digits, "0");
}

function currentStep(now = Date.now()) {
  return Math.floor(now / 1000 / securityPolicy.totp.period);
}

function verifyTotp(secret, code, { lastUsedStep = null } = {}) {
  const cleanCode = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleanCode)) {
    return { ok: false };
  }
  const step = currentStep();
  const window = securityPolicy.totp.window;
  for (let offset = -window; offset <= window; offset += 1) {
    const candidateStep = step + offset;
    if (lastUsedStep !== null && candidateStep <= Number(lastUsedStep)) {
      continue;
    }
    if (hotp(secret, candidateStep) === cleanCode) {
      return { ok: true, step: candidateStep };
    }
  }
  return { ok: false };
}

function otpauthUrl({ secret, accountName }) {
  const label = encodeURIComponent(`${securityPolicy.totp.issuer}:${accountName}`);
  const issuer = encodeURIComponent(securityPolicy.totp.issuer);
  return `otpauth://totp/${label}?secret=${encodeURIComponent(secret)}&issuer=${issuer}&algorithm=SHA1&digits=${securityPolicy.totp.digits}&period=${securityPolicy.totp.period}`;
}

module.exports = {
  generateSecret,
  verifyTotp,
  otpauthUrl
};
