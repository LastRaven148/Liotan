const crypto =
  require("crypto");

const Session =
  require("../models/Session");

const {
  hmac
} = require("./privacy");

function createSessionId() {
  return crypto
    .randomBytes(32)
    .toString("base64url");
}

function hashSessionId(sessionId) {
  return hmac(String(sessionId || ""));
}

function sanitizeDeviceName(value) {
  const raw =
    String(value || "")
      .replace(/[<>]/g, "")
      .trim();

  if (!raw) {
    return "Unknown device";
  }

  return raw.slice(0, 80);
}

function detectDeviceName(req) {
  const explicit =
    req.body?.deviceName ||
    req.headers["x-liotan-device-name"];

  if (explicit) {
    return sanitizeDeviceName(explicit);
  }

  const ua =
    String(req.headers["user-agent"] || "");

  if (/iphone|ipad|ios/i.test(ua)) {
    return "iOS device";
  }

  if (/android/i.test(ua)) {
    return "Android device";
  }

  if (/windows/i.test(ua)) {
    return "Windows device";
  }

  if (/macintosh|mac os/i.test(ua)) {
    return "Mac device";
  }

  if (/linux/i.test(ua)) {
    return "Linux device";
  }

  return "Web device";
}

async function createUserSession({
  req,
  user
}) {
  const sessionId =
    createSessionId();

  const deviceId =
    req.body?.deviceId ||
    req.headers["x-liotan-device-id"] ||
    "";

  await Session.create({
    userId: user._id,
    username: user.username,
    sessionIdHash: hashSessionId(sessionId),
    deviceIdHash:
      deviceId
        ? hmac(String(deviceId).slice(0, 200))
        : "",
    deviceName: detectDeviceName(req),
    userAgentHash: hmac(
      String(req.headers["user-agent"] || "")
    )
  });

  return sessionId;
}

async function touchSession(sessionId) {
  if (!sessionId) {
    return false;
  }

  const result =
    await Session.updateOne(
      {
        sessionIdHash: hashSessionId(sessionId),
        revokedAt: null
      },
      {
        $set: {
          lastSeenAt: new Date()
        }
      }
    );

  return result.modifiedCount > 0 ||
    result.matchedCount > 0;
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
      revokedAt: null
    }).select("_id").lean();

  return Boolean(session);
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

  await Session.updateMany(
    query,
    {
      $set: {
        revokedAt: new Date()
      }
    }
  );
}

module.exports = {
  createUserSession,
  hashSessionId,
  touchSession,
  isSessionActive,
  revokeSession,
  revokeAllUserSessions
};
