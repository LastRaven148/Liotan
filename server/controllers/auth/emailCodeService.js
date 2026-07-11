const crypto = require("crypto");
const EmailCode = require("../../models/EmailCode");
const privacy = require("../../config/privacy");
const { normalizeEmail, hmac } = require("../../utils/privacy");
const { isValidEmailCode } = require("../../utils/validators");

function createCode() {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const code = String(crypto.randomInt(10000000, 100000000));
    const counts = new Map();
    for (const digit of code) {
      counts.set(digit, (counts.get(digit) || 0) + 1);
    }
    if (counts.size >= 5 && Math.max(...counts.values()) <= 2) {
      return code;
    }
  }
  return String(crypto.randomInt(10000000, 100000000));
}

function authLookupError(message) {
  return privacy.genericAuthErrors ? "invalid credentials" : message;
}

function maskEmail(email) {
  const cleanEmail = normalizeEmail(email);
  const [name, domain] = cleanEmail.split("@");
  return name && domain ? `${name[0]}********@${domain}` : "";
}

function emailCodeResponse({ result, cleanEmail, code }) {
  const exposeCode = !result.sent && process.env.NODE_ENV !== "production" && privacy.exposeDevEmailCodes;
  return {
    ok: true,
    sent: result.sent,
    maskedEmail: maskEmail(cleanEmail),
    devCode: exposeCode ? code : undefined
  };
}

async function saveEmailCode({ emailHash, purpose, code }) {
  await EmailCode.deleteMany({ emailHash, purpose });
  await EmailCode.create({ emailHash, purpose, codeHash: hmac(code) });
}

async function verifyEmailCode({ emailHash, purpose, code, consume = true }) {
  if (!isValidEmailCode(code)) {
    return false;
  }
  const record = await EmailCode.findOne({ emailHash, purpose });
  if (!record) {
    return false;
  }
  if (record.attempts >= 5) {
    await EmailCode.deleteOne({ _id: record._id });
    return false;
  }
  if (record.codeHash !== hmac(code)) {
    record.attempts += 1;
    await record.save();
    return false;
  }
  if (consume) {
    await EmailCode.deleteOne({ _id: record._id });
  }
  return true;
}

async function consumeEmailCode({ emailHash, purpose }) {
  await EmailCode.deleteOne({ emailHash, purpose });
}

module.exports = {
  authLookupError,
  consumeEmailCode,
  createCode,
  emailCodeResponse,
  maskEmail,
  saveEmailCode,
  verifyEmailCode
};
