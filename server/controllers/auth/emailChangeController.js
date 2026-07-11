const jwt = require("jsonwebtoken");
const User = require("../../models/User");
const { normalizeEmail, hashEmail } = require("../../utils/privacy");
const { isValidEmail, isValidEmailCode } = require("../../utils/validators");
const { assertAcceptableEmail } = require("../../utils/emailRisk");
const { sendEmailCode, sendEmailChangeCancelNotice } = require("../../utils/mailer");
const {
  createPendingEmailChange,
  applyEligiblePendingEmailChanges,
  cancelPendingEmailChange
} = require("../../security/emailChange/emailChangeSecurity");
const {
  authLookupError,
  createCode,
  emailCodeResponse,
  saveEmailCode,
  verifyEmailCode
} = require("./emailCodeService");
const { verifySecondFactorIfEnabled } = require("./secondFactorService");

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
    if (
      payload?.scope !== "email-change" ||
      payload?.userId !== req.user.userId ||
      payload?.username !== req.user.username
    ) {
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
    return res.json(emailCodeResponse({ result, cleanEmail, code }));
  } catch (err) {
    return next(err);
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
    if (!await verifyEmailCode({ emailHash, purpose: "change_current", code })) {
      return res.status(400).json({ error: "invalid code" });
    }
    return res.json({ ok: true, emailChangeToken: signEmailChangeToken(user, emailHash) });
  } catch (err) {
    return next(err);
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
    return res.json(emailCodeResponse({ result, cleanEmail, code }));
  } catch (err) {
    return next(err);
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
    if (!await verifyEmailCode({ emailHash: newEmailHash, purpose: "change_new", code })) {
      return res.status(400).json({ error: "invalid code" });
    }
    const secondFactor = await verifySecondFactorIfEnabled({
      user,
      code: req.body?.totpCode,
      backupCode: req.body?.backupCode
    });
    if (!secondFactor.ok) {
      return res.status(401).json({ error: "second factor required", secondFactorRequired: true });
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
    return res.json({
      ok: true,
      pending: true,
      applyAfter: pending.applyAfter,
      cancelExpiresAt: pending.cancelExpiresAt
    });
  } catch (err) {
    return next(err);
  }
}

async function cancelEmailChange(req, res, next) {
  try {
    const ok = await cancelPendingEmailChange(req.params.token);
    return res.status(ok ? 200 : 400).json({ ok });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  startEmailChangeCurrent,
  verifyEmailChangeCurrent,
  sendEmailChangeNewCode,
  confirmEmailChange,
  cancelEmailChange
};
