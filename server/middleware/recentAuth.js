const bcrypt = require("bcrypt");
const User = require("../models/User");
const UserSecurity = require("../models/UserSecurity");
const Session = require("../models/Session");
const { hashSessionId } = require("../utils/sessionSecurity");
const { decryptJson } = require("../security/crypto/secureEnvelope");
const { verifyTotp } = require("../security/totp/totp");
const { consumeBackupCode } = require("../security/recovery/backupCodes");

const RECENT_AUTH_WINDOW_MS = Number(process.env.RECENT_AUTH_WINDOW_MINUTES || 15) * 60 * 1000;

function getNow() {
  return new Date();
}

async function isRecentlyAuthenticated(req) {
  if (!req.user?.sid) return false;
  const session = await Session.findOne({
    userId: req.user.userId,
    sessionIdHash: hashSessionId(req.user.sid),
    revokedAt: null,
    expiresAt: { $gt: getNow() }
  }).select("createdAt lastSeenAt").lean();

  if (!session) return false;
  const timestamps = [session.createdAt, session.lastSeenAt]
    .filter(Boolean)
    .map(value => new Date(value).getTime())
    .filter(Number.isFinite);
  if (!timestamps.length) return false;
  return Date.now() - Math.max(...timestamps) <= RECENT_AUTH_WINDOW_MS;
}

async function verifyPasswordFallback(user, password) {
  if (!password || !user?.password) return false;
  try {
    return bcrypt.compare(String(password), user.password);
  } catch {
    return false;
  }
}

async function verifySecondFactor(state, userId, { totpCode, backupCode }) {
  if (!state?.totp?.enabled) return false;

  if (totpCode) {
    try {
      const { secret } = decryptJson(state.totp.secretEnvelope, `totp:${userId}`);
      const verified = verifyTotp(secret, totpCode, { lastUsedStep: state.totp.lastUsedStep });
      if (verified.ok) {
        state.totp.lastUsedStep = verified.step;
        await state.save();
        return true;
      }
    } catch {
      return false;
    }
  }

  if (backupCode) {
    const backup = consumeBackupCode(state.totp.backupCodeHashes || [], backupCode);
    if (backup.ok) {
      state.totp.backupCodeHashes = backup.hashes;
      await state.save();
      return true;
    }
  }

  return false;
}

async function recentAuth(req, res, next) {
  try {
    const user = await User.findOne({ _id: req.user.userId, username: req.user.username });
    if (!user) {
      return res.status(401).json({ error: "auth required" });
    }

    const state = await UserSecurity.findOne({ userId: user._id });
    const lockedUntil = state?.highRiskLock?.lockedUntil ? new Date(state.highRiskLock.lockedUntil) : null;
    if (lockedUntil && lockedUntil > getNow()) {
      return res.status(423).json({
        error: "security window active",
        recentAuthRequired: true,
        lockedUntil,
        reason: state.highRiskLock.reason || "security_window"
      });
    }

    if (await isRecentlyAuthenticated(req)) {
      return next();
    }

    if (await verifySecondFactor(state, user._id, {
      totpCode: req.body?.totpCode || req.body?.code,
      backupCode: req.body?.backupCode
    })) {
      return next();
    }

    if (!state?.totp?.enabled && await verifyPasswordFallback(user, req.body?.currentPassword || req.body?.password)) {
      return next();
    }

    return res.status(401).json({
      error: "recent authentication required",
      recentAuthRequired: true,
      secondFactorRequired: Boolean(state?.totp?.enabled)
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  recentAuth,
  RECENT_AUTH_WINDOW_MS
};
