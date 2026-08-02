const crypto = require("crypto");
const EmailCode = require("../../models/EmailCode");
const privacy = require("../../config/privacy");
const { normalizeEmail, hmac } = require("../../utils/privacy");
const { isValidEmailCode } = require("../../utils/validators");

const EMAIL_CODE_PURPOSES = new Set([
  "register",
  "reset",
  "bind",
  "login",
  "change_current",
  "change_new"
]);

function validatedLookup(emailHash, purpose) {
  const safeEmailHash = String(emailHash || "").toLowerCase();
  const safePurpose = String(purpose || "");
  if (!/^[0-9a-f]{64}$/.test(safeEmailHash) || !EMAIL_CODE_PURPOSES.has(safePurpose)) {
    const error = new Error("invalid email code lookup");
    error.status = 400;
    throw error;
  }
  return { emailHash: safeEmailHash, purpose: safePurpose };
}

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
  const lookup = validatedLookup(emailHash, purpose);
  await EmailCode.deleteMany(lookup);
  await EmailCode.create({ ...lookup, codeHash: hmac(code) });
}

async function verifyEmailCode({ emailHash, purpose, code, consume = true }) {
  if (!isValidEmailCode(code)) {
    return false;
  }
  const record = await EmailCode.findOne(validatedLookup(emailHash, purpose));
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
  await EmailCode.deleteOne(validatedLookup(emailHash, purpose));
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
