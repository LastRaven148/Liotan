const crypto = require("crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { signAuthToken } = require("../utils/authToken");
const { setAuthCookie, clearAuthCookie } = require("../utils/authCookie");
const User = require("../models/User");
const EmailCode = require("../models/EmailCode");
const E2EEKey = require("../models/E2EEKey");
const Session = require("../models/Session");
const UserSecurity = require("../models/UserSecurity");
const PendingEmailChange = require("../models/PendingEmailChange");
const RegistrationCancel = require("../models/RegistrationCancel");
const {
  normalizeEmail,
  hashEmail,
  hmac
} = require("../utils/privacy");
const {
  createUserSession,
  hashSessionId,
  updateSessionDeviceKey,
  revokeSession,
  revokeAllUserSessions,
  cleanupExpiredSessionsForUser,
  cleanupDuplicateDeviceSessionsForUser
} = require("../utils/sessionSecurity");
const {
  sendEmailCode,
  sendEmailChangeCancelNotice,
  sendRegistrationNotice,
  sendLoginNotice
} = require("../utils/mailer");
const {
  isValidUsername,
  isValidPassword,
  isValidEmail,
  isValidEmailCode
} = require("../utils/validators");
const {
  assertAcceptableEmail
} = require("../utils/emailRisk");
const { decryptJson, randomToken, sha256 } = require("../security/crypto/secureEnvelope");
const { verifyTotp } = require("../security/totp/totp");
const deleteAccountData = require("../utils/deleteAccountData");
const { consumeBackupCode } = require("../security/recovery/backupCodes");
const privacy = require("../config/privacy");
const {
  createPendingEmailChange,
  applyEligiblePendingEmailChanges,
  cancelPendingEmailChange
} = require("../security/emailChange/emailChangeSecurity");
function createCode() {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const code = String(crypto.randomInt(10000000, 100000000));
    const counts = new Map();
    for (const digit of code) {
      counts.set(digit, (counts.get(digit) || 0) + 1);
    }

    const uniqueDigits = counts.size;
    const maxRepeats = Math.max(...counts.values());

    if (uniqueDigits >= 5 && maxRepeats <= 2) {
      return code;
    }
  }

  return String(crypto.randomInt(10000000, 100000000));
}

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


function getRegistrationCancelUrl(token) {
  const base = String(
    process.env.PUBLIC_API_URL ||
    process.env.API_URL ||
    "https://api.liotan.com"
  ).replace(/\/$/, "");

  return `${base}/auth/register/cancel/${encodeURIComponent(token)}`;
}

function sendRegistrationCancelPage(res, { ok, title, message }) {
  const safeTitle = String(title || "Liotan").replace(/[<>&"]/g, "");
  const safeMessage = String(message || "").replace(/[<>&"]/g, "");

  res.status(ok ? 200 : 400).send(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0e1621;color:#fff;font-family:Arial,Helvetica,sans-serif}
    .card{width:min(420px,calc(100vw - 32px));background:#17212b;border:1px solid #243447;border-radius:18px;padding:28px;box-shadow:0 18px 60px rgba(0,0,0,.35)}
    h1{margin:0 0 12px;font-size:24px}.text{color:#9aaabc;line-height:1.5}.ok{color:#6ee7a8}.bad{color:#ff8f8f}
  </style>
</head>
<body><main class="card"><h1 class="${ok ? "ok" : "bad"}">${safeTitle}</h1><div class="text">${safeMessage}</div></main></body>
</html>`);
}

async function createRegistrationCancelLink(user) {
  const token = randomToken(32);
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

  await RegistrationCancel.deleteMany({
    userId: user._id,
    usedAt: null
  });

  await RegistrationCancel.create({
    userId: user._id,
    username: user.username,
    emailHash: user.emailHash,
    tokenHash,
    expiresAt
  });

  return {
    cancelUrl: getRegistrationCancelUrl(token),
    expiresAt
  };
}

function shouldExposeDevEmailCode(result) {
  return (
    !result.sent &&
    process.env.NODE_ENV !== "production" &&
    privacy.exposeDevEmailCodes
  );
}

function authLookupError(message) {
  return privacy.genericAuthErrors ? "invalid credentials" : message;
}

function emailCodeResponse({ result, cleanEmail, code }) {
  return {
    ok: true,
    sent: result.sent,
    maskedEmail: maskEmail(cleanEmail),
    devCode: shouldExposeDevEmailCode(result) ? code : undefined
  };
}
function maskEmail(email) {
  const cleanEmail = normalizeEmail(email);
  const [name, domain] = cleanEmail.split("@");
  if (!name || !domain) {
    return "";
  }
  return `${name[0]}***************@${domain}`;
}
async function signToken(req, user) {
  const sessionId = await createUserSession({
    req,
    user
  });

  return signAuthToken(user, sessionId);
}

function sendSessionResponse(res, { token, username }) {
  setAuthCookie(res, token);

  res.json({
    ok: true,
    username
  });
}
async function saveEmailCode({
  emailHash,
  purpose,
  code
}) {
  await EmailCode.deleteMany({
    emailHash,
    purpose
  });
  await EmailCode.create({
    emailHash,
    purpose,
    codeHash: hmac(code)
  });
}
async function verifyEmailCode({
  emailHash,
  purpose,
  code,
  consume = true
}) {
  if (!isValidEmailCode(code)) {
    return false;
  }
  const record = await EmailCode.findOne({
    emailHash,
    purpose
  });
  if (!record) {
    return false;
  }
  if (record.attempts >= 5) {
    await EmailCode.deleteOne({
      _id: record._id
    });
    return false;
  }
  const ok = record.codeHash === hmac(code);
  if (!ok) {
    record.attempts += 1;
    await record.save();
    return false;
  }
  if (consume) {
    await EmailCode.deleteOne({
      _id: record._id
    });
  }
  return true;
}

async function consumeEmailCode({ emailHash, purpose }) {
  await EmailCode.deleteOne({
    emailHash,
    purpose
  });
}
async function sendAuthCode(req, res, next) {
  try {
    const {
      email,
      purpose = "register"
    } = req.body;
    if (!isValidEmail(email) || !["register", "reset"].includes(purpose)) {
      return res.status(400).json({
        error: "invalid email"
      });
    }
    const cleanEmail = normalizeEmail(email);
    if (purpose === "register") {
      await assertAcceptableEmail(cleanEmail);
    }
    const emailHash = hashEmail(cleanEmail);
    await applyEligiblePendingEmailChanges({ emailHash });
    const exists = await User.findOne({
      emailHash
    });
    if (privacy.genericAuthErrors) {
      if (purpose === "register" && exists) {
        return res.json({ ok: true, sent: true, maskedEmail: maskEmail(cleanEmail) });
      }
      if (purpose === "reset" && !exists) {
        return res.json({ ok: true, sent: true, maskedEmail: maskEmail(cleanEmail) });
      }
    } else {
      if (purpose === "register" && exists) {
        return res.status(400).json({
          error: authLookupError("email already used")
        });
      }
      if (purpose === "reset" && !exists) {
        return res.status(400).json({
          error: authLookupError("email not found")
        });
      }
    }
    const code = createCode();
    await saveEmailCode({
      emailHash,
      purpose,
      code
    });
    const result = await sendEmailCode({
      to: cleanEmail,
      code,
      purpose
    });
    res.json(emailCodeResponse({ result, cleanEmail, code }));
  } catch (err) {
    next(err);
  }
}
async function verifyAuthCode(req, res, next) {
  try {
    const {
      email,
      purpose = "register",
      code
    } = req.body;
    if (!isValidEmail(email) || !isValidEmailCode(code) || !["register", "reset"].includes(purpose)) {
      return res.status(400).json({
        error: "invalid code"
      });
    }
    const cleanEmail = normalizeEmail(email);
    if (purpose === "register") {
      await assertAcceptableEmail(cleanEmail);
    }
    const emailHash = hashEmail(cleanEmail);
    const exists = await User.findOne({
      emailHash
    });
    if (purpose === "register" && exists) {
      return res.status(400).json({
        error: authLookupError("email already used")
      });
    }
    if (purpose === "reset" && !exists) {
      return res.status(400).json({
        error: authLookupError("email not found")
      });
    }
    const record = await EmailCode.findOne({
      emailHash,
      purpose
    });
    if (!record) {
      return res.status(400).json({
        error: "invalid code"
      });
    }
    if (record.attempts >= 5) {
      await EmailCode.deleteOne({
        _id: record._id
      });
      return res.status(400).json({
        error: "invalid code"
      });
    }
    const ok = record.codeHash === hmac(code);
    if (!ok) {
      record.attempts += 1;
      await record.save();
      return res.status(400).json({
        error: "invalid code"
      });
    }
    res.json({
      ok: true
    });
  } catch (err) {
    next(err);
  }
}
async function sendLoginCode(req, res, next) {
  try {
    const {
      email,
      password
    } = req.body;
    if (!isValidEmail(email) || !isValidPassword(password)) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }
    const cleanEmail = normalizeEmail(email);
    const emailHash = hashEmail(cleanEmail);
    await applyEligiblePendingEmailChanges({ emailHash });
    const user = await User.findOne({
      emailHash,
      emailVerified: true
    });
    if (!user) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }
    const passwordOk = await bcrypt.compare(password, user.password);
    if (!passwordOk) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }
    const code = createCode();
    await saveEmailCode({
      emailHash,
      purpose: "login",
      code
    });
    const result = await sendEmailCode({
      to: cleanEmail,
      code,
      purpose: "login"
    });
    res.json(emailCodeResponse({ result, cleanEmail, code }));
  } catch (err) {
    next(err);
  }
}
async function register(req, res, next) {
  try {
    const {
      username,
      password,
      email,
      code
    } = req.body;
    if (!isValidUsername(username) || !isValidPassword(password) || !isValidEmail(email) || !isValidEmailCode(code)) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }
    const cleanUsername = username.trim();
    const cleanEmail = normalizeEmail(email);
    await assertAcceptableEmail(cleanEmail);
    const emailHash = hashEmail(cleanEmail);
    await applyEligiblePendingEmailChanges({ emailHash });
    const exists = await User.findOne({
      $or: [{
        username: cleanUsername
      }, {
        emailHash
      }]
    });
    if (exists) {
      return res.status(400).json({
        error: authLookupError("exists")
      });
    }
    const verified = await verifyEmailCode({
      emailHash,
      purpose: "register",
      code
    });
    if (!verified) {
      return res.status(400).json({
        error: "invalid code"
      });
    }
    const hash = await bcrypt.hash(password, 12);
    const user = await User.create({
      username: cleanUsername,
      password: hash,
      emailHash,
      emailVerified: true,
      lastSeen: new Date()
    });
    const registrationCancel = await createRegistrationCancelLink(user);

    await sendRegistrationNotice({
      to: cleanEmail,
      username: user.username,
      cancelUrl: registrationCancel.cancelUrl,
      expiresAt: registrationCancel.expiresAt
    }).catch(() => null);

    sendSessionResponse(res, {
      token: await signToken(req, user),
      username: user.username
    });
  } catch (err) {
    next(err);
  }
}
async function login(req, res, next) {
  try {
    const {
      email,
      password,
      code,
      totpCode,
      backupCode
    } = req.body;
    if (!isValidEmail(email) || !isValidPassword(password) || !isValidEmailCode(code)) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }
    const cleanEmail = normalizeEmail(email);
    const emailHash = hashEmail(cleanEmail);
    await applyEligiblePendingEmailChanges({ emailHash });
    const user = await User.findOne({
      emailHash,
      emailVerified: true
    });
    if (!user) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }
    const passwordOk = await bcrypt.compare(password, user.password);
    if (!passwordOk) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }
    const verified = await verifyEmailCode({
      emailHash,
      purpose: "login",
      code,
      consume: false
    });
    if (!verified) {
      return res.status(400).json({
        error: "invalid code"
      });
    }
    const secondFactor = await verifySecondFactorIfEnabled({
      user,
      code: totpCode,
      backupCode
    });
    if (!secondFactor.ok) {
      return res.status(401).json({
        error: "second factor required",
        secondFactorRequired: true
      });
    }
    await consumeEmailCode({
      emailHash,
      purpose: "login"
    });
    user.lastSeen = new Date();
    await user.save();

    await sendLoginNotice({
      to: cleanEmail,
      username: user.username,
      at: new Date()
    }).catch(() => null);

    sendSessionResponse(res, {
      token: await signToken(req, user),
      username: user.username
    });
  } catch (err) {
    next(err);
  }
}
async function resetPassword(req, res, next) {
  try {
    const {
      email,
      code,
      password
    } = req.body;
    if (!isValidEmail(email) || !isValidEmailCode(code) || !isValidPassword(password)) {
      return res.status(400).json({
        error: "invalid credentials"
      });
    }
    const cleanEmail = normalizeEmail(email);
    const emailHash = hashEmail(cleanEmail);
    await applyEligiblePendingEmailChanges({ emailHash });
    const user = await User.findOne({
      emailHash
    });
    if (!user) {
      return res.status(400).json({
        error: authLookupError("email not found")
      });
    }
    const verified = await verifyEmailCode({
      emailHash,
      purpose: "reset",
      code
    });
    if (!verified) {
      return res.status(400).json({
        error: "invalid code"
      });
    }
    const secondFactor = await verifySecondFactorIfEnabled({
      user,
      code: req.body?.totpCode,
      backupCode: req.body?.backupCode
    });
    if (!secondFactor.ok) {
      return res.status(401).json({
        error: "second factor required",
        secondFactorRequired: true
      });
    }
    user.password = await bcrypt.hash(password, 12);
    await user.save();
    await revokeAllUserSessions({
      userId: user._id
    });
    res.json({
      ok: true
    });
  } catch (err) {
    next(err);
  }
}
function signEmailChangeToken(user, currentEmailHash) {
  return jwt.sign({
    userId: user._id.toString(),
    username: user.username,
    emailHash: currentEmailHash,
    scope: "email-change"
  }, process.env.JWT_SECRET, {
    expiresIn: "15m",
    algorithm: "HS256"
  });
}

function verifyEmailChangeToken(emailChangeToken, req) {
  try {
    const payload = jwt.verify(String(emailChangeToken || ""), process.env.JWT_SECRET, {
      algorithms: ["HS256"]
    });
    if (payload?.scope !== "email-change" || payload?.userId !== req.user.userId || payload?.username !== req.user.username) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

async function startEmailChangeCurrent(req, res, next) {
  try {
    const cleanEmail = normalizeEmail(req.body?.currentEmail);
    if (!isValidEmail(cleanEmail)) {
      return res.status(400).json({ error: "invalid email" });
    }
    const emailHash = hashEmail(cleanEmail);
    const user = await User.findOne({ _id: req.user.userId, username: req.user.username });
    if (!user || user.emailHash !== emailHash) {
      return res.status(400).json({ error: "invalid email" });
    }
    const code = createCode();
    await saveEmailCode({ emailHash, purpose: "change_current", code });
    const result = await sendEmailCode({ to: cleanEmail, code, purpose: "change_current" });
    res.json(emailCodeResponse({ result, cleanEmail, code }));
  } catch (err) {
    next(err);
  }
}

async function verifyEmailChangeCurrent(req, res, next) {
  try {
    const cleanEmail = normalizeEmail(req.body?.currentEmail);
    const code = req.body?.code;
    if (!isValidEmail(cleanEmail) || !isValidEmailCode(code)) {
      return res.status(400).json({ error: "invalid code" });
    }
    const emailHash = hashEmail(cleanEmail);
    const user = await User.findOne({ _id: req.user.userId, username: req.user.username });
    if (!user || user.emailHash !== emailHash) {
      return res.status(400).json({ error: "invalid email" });
    }
    const verified = await verifyEmailCode({ emailHash, purpose: "change_current", code });
    if (!verified) {
      return res.status(400).json({ error: "invalid code" });
    }
    res.json({ ok: true, emailChangeToken: signEmailChangeToken(user, emailHash) });
  } catch (err) {
    next(err);
  }
}

async function sendEmailChangeNewCode(req, res, next) {
  try {
    const tokenPayload = verifyEmailChangeToken(req.body?.token, req);
    const cleanEmail = normalizeEmail(req.body?.newEmail);
    if (!tokenPayload || !isValidEmail(cleanEmail)) {
      return res.status(400).json({ error: "invalid request" });
    }
    await assertAcceptableEmail(cleanEmail);
    const newEmailHash = hashEmail(cleanEmail);
    await applyEligiblePendingEmailChanges({ emailHash: newEmailHash });
    const exists = await User.findOne({ emailHash: newEmailHash, _id: { $ne: req.user.userId } });
    if (exists) {
      return res.status(400).json({ error: authLookupError("email already used") });
    }
    const code = createCode();
    await saveEmailCode({ emailHash: newEmailHash, purpose: "change_new", code });
    const result = await sendEmailCode({ to: cleanEmail, code, purpose: "change_new" });
    res.json(emailCodeResponse({ result, cleanEmail, code }));
  } catch (err) {
    next(err);
  }
}

async function confirmEmailChange(req, res, next) {
  try {
    const tokenPayload = verifyEmailChangeToken(req.body?.token, req);
    const cleanEmail = normalizeEmail(req.body?.newEmail);
    const currentEmail = normalizeEmail(req.body?.currentEmail);
    const code = req.body?.code;
    if (!tokenPayload || !isValidEmail(cleanEmail) || !isValidEmailCode(code) || !isValidEmail(currentEmail)) {
      return res.status(400).json({ error: "invalid request" });
    }
    await assertAcceptableEmail(cleanEmail);
    const newEmailHash = hashEmail(cleanEmail);
    const currentEmailHash = hashEmail(currentEmail);
    const user = await User.findOne({ _id: req.user.userId, username: req.user.username });
    if (!user || user.emailHash !== tokenPayload.emailHash || currentEmailHash !== tokenPayload.emailHash) {
      return res.status(400).json({ error: "invalid request" });
    }
    await applyEligiblePendingEmailChanges({ emailHash: newEmailHash });
    const exists = await User.findOne({ emailHash: newEmailHash, _id: { $ne: req.user.userId } });
    if (exists) {
      return res.status(400).json({ error: authLookupError("email already used") });
    }
    const verified = await verifyEmailCode({ emailHash: newEmailHash, purpose: "change_new", code });
    if (!verified) {
      return res.status(400).json({ error: "invalid code" });
    }
    const secondFactor = await verifySecondFactorIfEnabled({
      user,
      code: req.body?.totpCode,
      backupCode: req.body?.backupCode
    });
    if (!secondFactor.ok) {
      return res.status(401).json({
        error: "second factor required",
        secondFactorRequired: true
      });
    }
    const { pending, cancelUrl } = await createPendingEmailChange({
      user,
      oldEmailHash: tokenPayload.emailHash,
      newEmail: cleanEmail,
      newEmailHash,
      exceptSessionId: req.user.sid
    });
    await sendEmailChangeCancelNotice({
      to: currentEmail,
      cancelUrl,
      applyAfter: pending.applyAfter
    }).catch(() => null);
    res.json({
      ok: true,
      pending: true,
      applyAfter: pending.applyAfter,
      cancelExpiresAt: pending.cancelExpiresAt
    });
  } catch (err) {
    next(err);
  }
}

async function cancelEmailChange(req, res, next) {
  try {
    const ok = await cancelPendingEmailChange(req.params.token);
    res.status(ok ? 200 : 400).json({ ok });
  } catch (err) {
    next(err);
  }
}


async function cancelRegistration(req, res, next) {
  try {
    const tokenHash = sha256(req.params.token || "");
    const record = await RegistrationCancel.findOne({
      tokenHash,
      usedAt: null,
      expiresAt: { $gt: new Date() }
    });

    if (!record) {
      return sendRegistrationCancelPage(res, {
        ok: false,
        title: "Ссылка недействительна",
        message: "Эта ссылка отмены регистрации уже использована или истекла."
      });
    }

    record.usedAt = new Date();
    await record.save();

    const result = await deleteAccountData(record.username);

    await RegistrationCancel.updateMany(
      { userId: record.userId, usedAt: null },
      { $set: { usedAt: new Date() } }
    );

    return sendRegistrationCancelPage(res, {
      ok: result.ok,
      title: result.ok ? "Регистрация отменена" : "Не удалось отменить регистрацию",
      message: result.ok
        ? "Аккаунт Liotan был удалён. Если это сделали не вы, создайте новый аккаунт и включите 2FA."
        : "Аккаунт уже не найден или ссылка больше не может быть применена."
    });
  } catch (err) {
    next(err);
  }
}

async function getCurrentSession(req, res, next) {
  try {
    const security = await UserSecurity.findOne({
      userId: req.user.userId
    }).select("totp.enabled totp.backupCodeHashes").lean();

    res.json({
      ok: true,
      username: req.user.username,
      security: {
        totpEnabled: Boolean(security?.totp?.enabled),
        backupCodesRemaining: security?.totp?.backupCodeHashes?.length || 0
      }
    });
  } catch (err) {
    next(err);
  }
}

async function listSessions(req, res, next) {
  try {
    await cleanupExpiredSessionsForUser(req.user.userId);
    await cleanupDuplicateDeviceSessionsForUser(req.user.userId);

    const sessions = await Session.find({
      userId: req.user.userId,
      revokedAt: null,
      expiresAt: {
        $gt: new Date()
      }
    }).select("sessionIdHash deviceName createdAt lastSeenAt expiresAt transportMode devicePublicKey deviceKeyFingerprint").sort({
      lastSeenAt: -1
    }).lean();
    const currentHash = hashSessionId(req.user.sid);
    res.json({
      sessions: sessions.map(session => ({
        id: session.sessionIdHash,
        deviceName: session.deviceName,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
        transportMode: session.transportMode || "auto",
        hasDevicePublicKey: Boolean(session.devicePublicKey),
        deviceKeyFingerprint: session.deviceKeyFingerprint || "",
        current: session.sessionIdHash === currentHash
      }))
    });
  } catch (err) {
    next(err);
  }
}

async function updateCurrentSessionDeviceKey(req, res, next) {
  try {
    const ok =
      await updateSessionDeviceKey({
        userId: req.user.userId,
        sessionId: req.user.sid,
        devicePublicKey: req.body?.devicePublicKey,
        deviceKeyFingerprint: req.body?.deviceKeyFingerprint
      });

    if (!ok) {
      return res.status(400).json({
        error: "invalid device key"
      });
    }

    res.json({
      ok: true
    });
  } catch (err) {
    next(err);
  }
}

async function logoutAllSessions(req, res, next) {
  try {
    await revokeAllUserSessions({
      userId: req.user.userId
    });

    clearAuthCookie(res);

    res.json({
      ok: true
    });
  } catch (err) {
    next(err);
  }
}

async function logoutCurrentSession(req, res, next) {
  try {
    await revokeSession({
      userId: req.user.userId,
      sessionIdHash: hashSessionId(req.user.sid)
    });

    clearAuthCookie(res);

    res.json({
      ok: true
    });
  } catch (err) {
    next(err);
  }
}
async function revokeOneSession(req, res, next) {
  try {
    const sessionIdHash = String(req.params.id || "").trim();
    if (!sessionIdHash || sessionIdHash.length > 200) {
      return res.status(400).json({
        error: "invalid session"
      });
    }
    await revokeSession({
      userId: req.user.userId,
      sessionIdHash
    });
    res.json({
      ok: true
    });
  } catch (err) {
    next(err);
  }
}
async function logoutOtherSessions(req, res, next) {
  try {
    await revokeAllUserSessions({
      userId: req.user.userId,
      exceptSessionId: req.user.sid
    });
    res.json({
      ok: true
    });
  } catch (err) {
    next(err);
  }
}
module.exports = {
  sendAuthCode,
  verifyAuthCode,
  sendLoginCode,
  register,
  login,
  resetPassword,
  getCurrentSession,
  listSessions,
  logoutCurrentSession,
  revokeOneSession,
  logoutOtherSessions,
  logoutAllSessions,
  updateCurrentSessionDeviceKey,
  startEmailChangeCurrent,
  verifyEmailChangeCurrent,
  sendEmailChangeNewCode,
  confirmEmailChange,
  cancelEmailChange,
  cancelRegistration
};
