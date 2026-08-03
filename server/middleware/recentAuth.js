const bcrypt = require("bcrypt");
const User = require("../models/User");
const UserSecurity = require("../models/UserSecurity");
const Session = require("../models/Session");
const { hashSessionId } = require("../utils/sessionSecurity");
const { consumeSecondFactor } = require("../security/totp/secondFactor");

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
  }).select("reauthenticatedAt").lean();

  if (!session) return false;
  const timestamp = new Date(session.reauthenticatedAt || 0).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp <= RECENT_AUTH_WINDOW_MS;
}

async function markRecentlyAuthenticated(req) {
  if (!req.user?.sid) return false;
  const result = await Session.updateOne({
    userId: req.user.userId,
    sessionIdHash: hashSessionId(req.user.sid),
    revokedAt: null,
    expiresAt: { $gt: getNow() }
  }, {
    $set: { reauthenticatedAt: getNow() }
  });
  return result.matchedCount > 0;
}

async function verifyPasswordFallback(user, password) {
  if (!password || !user?.password) return false;
  try {
    return bcrypt.compare(String(password), user.password);
  } catch {
    return false;
  }
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
      req.reauthentication = { method: "recent-session", factorConsumed: false };
      return next();
    }

    const secondFactor = await consumeSecondFactor({
      userId: user._id,
      code: req.body?.totpCode || req.body?.code,
      backupCode: req.body?.backupCode
    });
    if (secondFactor.ok && secondFactor.required) {
      await markRecentlyAuthenticated(req);
      req.reauthentication = { method: secondFactor.method, factorConsumed: true };
      return next();
    }

    if (!secondFactor.required && await verifyPasswordFallback(user, req.body?.currentPassword || req.body?.password)) {
      await markRecentlyAuthenticated(req);
      req.reauthentication = { method: "password", factorConsumed: false };
      return next();
    }

    return res.status(401).json({
      error: "recent authentication required",
      recentAuthRequired: true,
      secondFactorRequired: secondFactor.required
    });
  } catch (err) {
    next(err);
  }
}

async function requireReauthentication(req, res, next) {
  try {
    const user = await User.findOne({ _id: req.user.userId, username: req.user.username });
    if (!user) return res.status(401).json({ error: "auth required" });
    const secondFactor = await consumeSecondFactor({
      userId: user._id,
      code: req.body?.totpCode || req.body?.code,
      backupCode: req.body?.backupCode
    });
    const verified = secondFactor.required
      ? secondFactor.ok
      : await verifyPasswordFallback(user, req.body?.currentPassword || req.body?.password);
    if (!verified) {
      return res.status(401).json({
        error: "explicit reauthentication required",
        recentAuthRequired: true,
        secondFactorRequired: secondFactor.required
      });
    }
    await markRecentlyAuthenticated(req);
    req.reauthentication = {
      method: secondFactor.required ? secondFactor.method : "password",
      factorConsumed: secondFactor.required
    };
    return next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  recentAuth,
  requireReauthentication,
  markRecentlyAuthenticated,
  RECENT_AUTH_WINDOW_MS
};
