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
const MAX_EMAIL_CODE_ATTEMPTS = 5;

function emailCodeTtlSeconds() {
  const configured = Number(process.env.EMAIL_CODE_TTL_SECONDS || 600);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : 600;
}

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

function currentEmailCodeId(lookup) {
  return `email-code:${crypto.createHash("sha256")
    .update(`${lookup.emailHash}:${lookup.purpose}`, "utf8")
    .digest("hex")}`;
}

function currentLookup(emailHash, purpose) {
  const lookup = validatedLookup(emailHash, purpose);
  return { ...lookup, _id: currentEmailCodeId(lookup) };
}

function unexpiredLookup(lookup) {
  return {
    ...lookup,
    attempts: { $lt: MAX_EMAIL_CODE_ATTEMPTS },
    createdAt: { $gte: new Date(Date.now() - emailCodeTtlSeconds() * 1000) }
  };
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
  const lookup = currentLookup(emailHash, purpose);
  await EmailCode.findOneAndUpdate(
    { _id: lookup._id },
    {
      $set: {
        emailHash: lookup.emailHash,
        purpose: lookup.purpose,
        codeHash: hmac(code),
        attempts: 0,
        createdAt: new Date()
      }
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true
    }
  );

  // Pre-remediation ObjectId records never participate in verification because
  // every security query is bound to the deterministic current-record id. They
  // are removed after the new record exists, so issuing a code has no validity gap.
  await EmailCode.deleteMany({
    emailHash: lookup.emailHash,
    purpose: lookup.purpose,
    _id: { $ne: lookup._id }
  });
}

async function verifyEmailCode({ emailHash, purpose, code, consume = true }) {
  if (!isValidEmailCode(code)) {
    return false;
  }
  const lookup = currentLookup(emailHash, purpose);
  const codeHash = hmac(code);
  const validCodeQuery = {
    ...unexpiredLookup(lookup),
    codeHash
  };
  const accepted = consume
    ? await EmailCode.findOneAndDelete(validCodeQuery)
    : await EmailCode.exists(validCodeQuery);
  if (accepted) return true;

  await EmailCode.updateOne(
    {
      ...unexpiredLookup(lookup),
      codeHash: { $ne: codeHash }
    },
    { $inc: { attempts: 1 } }
  );
  return false;
}

async function consumeEmailCode({ emailHash, purpose, code }) {
  if (!isValidEmailCode(code)) return false;
  const lookup = currentLookup(emailHash, purpose);
  const consumed = await EmailCode.findOneAndDelete({
    ...unexpiredLookup(lookup),
    codeHash: hmac(code)
  });
  return Boolean(consumed);
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
