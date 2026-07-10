const crypto =
  require("crypto");

const Session =
  require("../models/Session");

const privacy =
  require("../config/privacy");

const sessionConfig =
  require("../config/sessions");

const securityPolicy =
  require("../security/policies/securityPolicy");

const {
  hmac
} = require("./privacy");

const {
  disconnectSessionHash,
  disconnectSessionHashes
} = require("../sockets/sessionRegistry");

function createSessionId() {
  return crypto
    .randomBytes(32)
    .toString("base64url");
}

function hashSessionId(sessionId) {
  return hmac(String(sessionId || ""));
}


function getNewSessionRestrictionMs() {
  return Number(securityPolicy?.devices?.newSessionRestrictionMs || 0);
}

function getNewSessionRestrictionHours() {
  return Math.ceil(getNewSessionRestrictionMs() / (60 * 60 * 1000));
}

function getRestrictedUntil(createdAt) {
  const createdTime = new Date(createdAt || 0).getTime();
  const restrictionMs = getNewSessionRestrictionMs();

  if (!createdTime || !restrictionMs) {
    return null;
  }

  return new Date(createdTime + restrictionMs);
}

function isSessionRestrictedByAge(session) {
  const restrictedUntil = getRestrictedUntil(session?.createdAt);
  return Boolean(restrictedUntil && restrictedUntil.getTime() > Date.now());
}

function getSessionExpiryDate() {
  return new Date(
    Date.now() + sessionConfig.ttlDays * 24 * 60 * 60 * 1000
  );
}

function isValidDevicePublicKey(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    value.kty === "EC" &&
    value.crv === "P-256" &&
    typeof value.x === "string" &&
    value.x.length < 200 &&
    typeof value.y === "string" &&
    value.y.length < 200
  );
}

function sanitizeFingerprint(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9:_-]/g, "")
    .slice(0, 80);
}

function sanitizeDeviceName(value) {
  const raw =
    String(value || "")
      .replace(/[<>]/g, "")
      .trim();

  if (!raw) {
    return "Web device";
  }

  return raw.slice(0, 80);
}

function detectBrowserName(ua) {
  if (/Edg\//i.test(ua)) return "Microsoft Edge";
  if (/CriOS\//i.test(ua)) return "Chrome";
  if (/FxiOS\//i.test(ua)) return "Firefox";
  if (/OPR\//i.test(ua)) return "Opera";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  return "Browser";
}

function detectOsName(ua) {
  if (/iphone/i.test(ua)) return "iPhone";
  if (/ipad/i.test(ua)) return "iPad";

  const android = ua.match(/Android ([0-9.]+)/i);
  if (android) return `Android ${android[1]}`;

  if (/windows nt/i.test(ua)) return "Windows";
  if (/macintosh|mac os/i.test(ua)) return "macOS";
  if (/linux/i.test(ua)) return "Linux";

  return "Web";
}

function detectDeviceName(req) {
  const explicit =
    req.body?.deviceName ||
    req.headers["x-liotan-device-name"];

  if (explicit) {
    return sanitizeDeviceName(explicit);
  }

  if (!privacy.storeDerivedDeviceName) {
    return "Web device";
  }

  const ua =
    String(req.headers["user-agent"] || "");

  const os = detectOsName(ua);
  const browser = detectBrowserName(ua);

  return sanitizeDeviceName(
    os === "Web"
      ? `${browser} Web`
      : `${os} · ${browser}`
  );
}

function getDeviceKeyPayload(req) {
  const devicePublicKey =
    isValidDevicePublicKey(req.body?.devicePublicKey)
      ? req.body.devicePublicKey
      : null;

  return {
    devicePublicKey,
    deviceKeyFingerprint: sanitizeFingerprint(
      req.body?.deviceKeyFingerprint
    )
  };
}

async function cleanupExpiredSessionsForUser(userId) {
  await Session.updateMany(
    {
      userId,
      revokedAt: null,
      expiresAt: {
        $lte: new Date()
      }
    },
    {
      $set: {
        revokedAt: new Date()
      }
    }
  );
}

async function cleanupDuplicateDeviceSessionsForUser(userId) {
  const now = new Date();

  const sessions =
    await Session.find(
      {
        userId,
        revokedAt: null,
        expiresAt: {
          $gt: now
        },
        deviceIdHash: {
          $ne: ""
        }
      },
      "_id deviceIdHash lastSeenAt createdAt"
    )
      .sort({
        deviceIdHash: 1,
        lastSeenAt: -1,
        createdAt: -1
      })
      .lean();

  const seen = new Set();
  const duplicates = [];

  for (const session of sessions) {
    if (!session.deviceIdHash) {
      continue;
    }

    if (seen.has(session.deviceIdHash)) {
      duplicates.push(session._id);
      continue;
    }

    seen.add(session.deviceIdHash);
  }

  if (!duplicates.length) {
    return 0;
  }

  const result =
    await Session.updateMany(
      {
        _id: {
          $in: duplicates
        },
        revokedAt: null
      },
      {
        $set: {
          revokedAt: new Date()
        }
      }
    );

  return result.modifiedCount || 0;
}

async function enforceSessionLimit(userId) {
  const maxActive =
    sessionConfig.maxActiveSessionsPerUser;

  if (!maxActive) {
    return;
  }

  const activeSessions =
    await Session.find(
      {
        userId,
        revokedAt: null,
        expiresAt: {
          $gt: new Date()
        }
      },
      "_id"
    )
      .sort({
        lastSeenAt: -1,
        createdAt: -1
      })
      .skip(maxActive)
      .lean();

  if (!activeSessions.length) {
    return;
  }

  await Session.updateMany(
    {
      _id: {
        $in: activeSessions.map(session => session._id)
      }
    },
    {
      $set: {
        revokedAt: new Date()
      }
    }
  );
}

function getRequestDeviceId(req) {
  return String(
    req.body?.deviceId ||
    req.headers["x-liotan-device-id"] ||
    ""
  )
    .trim()
    .slice(0, 200);
}

function hashDeviceId(deviceId) {
  return deviceId ? hmac(deviceId) : "";
}

async function createUserSession({
  req,
  user
}) {
  const sessionId =
    createSessionId();

  const deviceIdHash =
    hashDeviceId(getRequestDeviceId(req));

  const {
    devicePublicKey,
    deviceKeyFingerprint
  } = getDeviceKeyPayload(req);

  const now =
    new Date();

  const nextSession = {
    username: user.username,
    sessionIdHash: hashSessionId(sessionId),
    deviceName: detectDeviceName(req),
    userAgentHash: privacy.storeUserAgentHash
      ? hmac(String(req.headers["user-agent"] || ""))
      : "",
    lastSeenAt: now,
    reauthenticatedAt: now,
    expiresAt: getSessionExpiryDate(),
    revokedAt: null
  };

  if (devicePublicKey) {
    nextSession.devicePublicKey = devicePublicKey;
    nextSession.deviceKeyFingerprint = deviceKeyFingerprint;
  }

  await cleanupExpiredSessionsForUser(user._id);
  await cleanupDuplicateDeviceSessionsForUser(user._id);

  if (deviceIdHash) {
    const reused =
      await Session.findOneAndUpdate(
        {
          userId: user._id,
          deviceIdHash,
          revokedAt: null,
          expiresAt: {
            $gt: now
          }
        },
        {
          $set: nextSession,
          $setOnInsert: {
            userId: user._id,
            deviceIdHash,
            createdAt: now
          }
        },
        {
          returnDocument: "after",
          upsert: true,
          setDefaultsOnInsert: true
        }
      );

    if (reused) {
      await enforceSessionLimit(user._id);
      return sessionId;
    }
  }

  await Session.create({
    userId: user._id,
    username: user.username,
    sessionIdHash: hashSessionId(sessionId),
    deviceIdHash,
    deviceName: nextSession.deviceName,
    devicePublicKey,
    deviceKeyFingerprint,
    userAgentHash: nextSession.userAgentHash,
    reauthenticatedAt: now,
    expiresAt: nextSession.expiresAt
  });

  await enforceSessionLimit(user._id);

  return sessionId;
}

async function touchSession(sessionId) {
  if (!sessionId) {
    return false;
  }

  const now = new Date();
  const minLastSeenAt = new Date(
    Date.now() - sessionConfig.touchThrottleMs
  );

  const result =
    await Session.updateOne(
      {
        sessionIdHash: hashSessionId(sessionId),
        revokedAt: null,
        expiresAt: {
          $gt: now
        },
        $or: [
          {
            lastSeenAt: {
              $lte: minLastSeenAt
            }
          },
          {
            expiresAt: {
              $lte: new Date(Date.now() + 24 * 60 * 60 * 1000)
            }
          }
        ]
      },
      {
        $set: {
          lastSeenAt: now,
          expiresAt: getSessionExpiryDate()
        }
      }
    );

  if (result.modifiedCount > 0 || result.matchedCount > 0) {
    return true;
  }

  const active =
    await Session.exists({
      sessionIdHash: hashSessionId(sessionId),
      revokedAt: null,
      expiresAt: {
        $gt: now
      }
    });

  return Boolean(active);
}

async function isSessionActive({
  userId,
  username,
  sessionId
}) {
  if (!sessionId) {
    return false;
  }

  const session =
    await Session.findOne({
      userId,
      username,
      sessionIdHash: hashSessionId(sessionId),
      revokedAt: null,
      expiresAt: {
        $gt: new Date()
      }
    }).select("_id").lean();

  return Boolean(session);
}


async function getSessionRestrictionState({
  userId,
  username,
  sessionId
}) {
  if (!sessionId) {
    return {
      restricted: false,
      restrictedUntil: null,
      restrictedForHours: getNewSessionRestrictionHours()
    };
  }

  const session =
    await Session.findOne({
      userId,
      username,
      sessionIdHash: hashSessionId(sessionId),
      revokedAt: null,
      expiresAt: {
        $gt: new Date()
      }
    })
      .select("createdAt")
      .lean();

  const restrictedUntil = getRestrictedUntil(session?.createdAt);

  return {
    restricted: Boolean(restrictedUntil && restrictedUntil.getTime() > Date.now()),
    restrictedUntil,
    restrictedForHours: getNewSessionRestrictionHours()
  };
}

async function isSessionHashRestricted({
  userId,
  sessionIdHash
}) {
  if (!sessionIdHash) {
    return false;
  }

  const session =
    await Session.findOne({
      userId,
      sessionIdHash,
      revokedAt: null,
      expiresAt: {
        $gt: new Date()
      }
    })
      .select("createdAt")
      .lean();

  return isSessionRestrictedByAge(session);
}

async function updateSessionDeviceKey({
  userId,
  sessionId,
  devicePublicKey,
  deviceKeyFingerprint
}) {
  if (!isValidDevicePublicKey(devicePublicKey)) {
    return false;
  }

  const result =
    await Session.updateOne(
      {
        userId,
        sessionIdHash: hashSessionId(sessionId),
        revokedAt: null,
        expiresAt: {
          $gt: new Date()
        }
      },
      {
        $set: {
          devicePublicKey,
          deviceKeyFingerprint: sanitizeFingerprint(deviceKeyFingerprint)
        }
      }
    );

  return result.modifiedCount > 0 ||
    result.matchedCount > 0;
}

async function revokeSession({
  userId,
  sessionIdHash
}) {
  await Session.updateOne(
    {
      userId,
      sessionIdHash,
      revokedAt: null
    },
    {
      $set: {
        revokedAt: new Date()
      }
    }
  );
  disconnectSessionHash(sessionIdHash);
}

async function revokeAllUserSessions({
  userId,
  exceptSessionId
}) {
  const query = {
    userId,
    revokedAt: null
  };

  if (exceptSessionId) {
    query.sessionIdHash = {
      $ne: hashSessionId(exceptSessionId)
    };
  }

  const sessions = await Session.find(query, "sessionIdHash").lean();

  await Session.updateMany(
    query,
    {
      $set: {
        revokedAt: new Date()
      }
    }
  );
  disconnectSessionHashes(sessions.map(session => session.sessionIdHash));
}

async function cleanupExpiredSessions() {
  const result =
    await Session.updateMany(
      {
        revokedAt: null,
        expiresAt: {
          $lte: new Date()
        }
      },
      {
        $set: {
          revokedAt: new Date()
        }
      }
    );

  return result.modifiedCount || 0;
}

module.exports = {
  createUserSession,
  hashSessionId,
  touchSession,
  isSessionActive,
  updateSessionDeviceKey,
  getSessionRestrictionState,
  isSessionHashRestricted,
  revokeSession,
  revokeAllUserSessions,
  cleanupExpiredSessions,
  cleanupExpiredSessionsForUser,
  cleanupDuplicateDeviceSessionsForUser,
  isValidDevicePublicKey,
  sanitizeFingerprint
};
