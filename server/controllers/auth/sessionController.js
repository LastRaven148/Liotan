const Session = require("../../models/Session");
const UserSecurity = require("../../models/UserSecurity");
const { clearAuthCookie } = require("../../utils/authCookie");
const {
  hashSessionId,
  updateSessionDeviceKey,
  revokeSession,
  revokeAllUserSessions,
  cleanupExpiredSessionsForUser,
  cleanupDuplicateDeviceSessionsForUser,
  getSessionRestrictionState
} = require("../../utils/sessionSecurity");

async function getCurrentSession(req, res, next) {
  try {
    const security = await UserSecurity.findOne({
      userId: req.user.userId
    }).select("totp.enabled totp.backupCodeHashes").lean();

    const sessionRestriction = await getSessionRestrictionState({
      userId: req.user.userId,
      username: req.user.username,
      sessionId: req.user.sid
    });

    res.json({
      ok: true,
      username: req.user.username,
      security: {
        totpEnabled: Boolean(security?.totp?.enabled),
        backupCodesRemaining: security?.totp?.backupCodeHashes?.length || 0
      },
      restrictedSession: sessionRestriction
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
      expiresAt: { $gt: new Date() }
    })
      .select("sessionIdHash deviceName createdAt lastSeenAt expiresAt devicePublicKey deviceKeyFingerprint")
      .sort({ lastSeenAt: -1 })
      .lean();
    const currentHash = hashSessionId(req.user.sid);

    res.json({
      sessions: sessions.map(session => ({
        id: session.sessionIdHash,
        deviceName: session.deviceName,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
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
    const ok = await updateSessionDeviceKey({
      userId: req.user.userId,
      sessionId: req.user.sid,
      devicePublicKey: req.body?.devicePublicKey,
      deviceKeyFingerprint: req.body?.deviceKeyFingerprint
    });

    if (!ok) {
      return res.status(400).json({ error: "invalid device key" });
    }

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

async function logoutAllSessions(req, res, next) {
  try {
    await revokeAllUserSessions({ userId: req.user.userId });
    clearAuthCookie(res);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

async function logoutCurrentSession(req, res, next) {
  try {
    await revokeSession({
      userId: req.user.userId,
      sessionIdHash: hashSessionId(req.user.sid)
    });
    clearAuthCookie(res);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

async function revokeOneSession(req, res, next) {
  try {
    const sessionIdHash = String(req.params.id || "").trim();
    if (!sessionIdHash || sessionIdHash.length > 200) {
      return res.status(400).json({ error: "invalid session" });
    }
    await revokeSession({ userId: req.user.userId, sessionIdHash });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

async function logoutOtherSessions(req, res, next) {
  try {
    await revokeAllUserSessions({
      userId: req.user.userId,
      exceptSessionId: req.user.sid
    });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getCurrentSession,
  listSessions,
  updateCurrentSessionDeviceKey,
  logoutAllSessions,
  logoutCurrentSession,
  revokeOneSession,
  logoutOtherSessions
};
