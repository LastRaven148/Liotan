const crypto =
  require("crypto");

const Session =
  require("../models/Session");

const privacy =
  require("../config/privacy");

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

function sanitizeTransportMode(value) {
  return ["direct", "relay", "auto"].includes(value)
    ? value
    : "auto";
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
  const ios = ua.match(/(?:iPhone OS|CPU OS) ([0-9_]+)/i);
  if (/iphone/i.test(ua)) return `iPhone${ios ? ` iOS ${ios[1].replace(/_/g, ".")}` : ""}`;
  if (/ipad/i.test(ua)) return `iPad${ios ? ` iPadOS ${ios[1].replace(/_/g, ".")}` : ""}`;
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

  const devicePublicKey =
    isValidDevicePublicKey(req.body?.devicePublicKey)
      ? req.body.devicePublicKey
      : null;

  await Session.create({
    userId: user._id,
    username: user.username,
    sessionIdHash: hashSessionId(sessionId),
    deviceIdHash:
      deviceId
        ? hmac(String(deviceId).slice(0, 200))
        : "",
    deviceName: detectDeviceName(req),
    devicePublicKey,
    deviceKeyFingerprint: sanitizeFingerprint(
      req.body?.deviceKeyFingerprint
    ),
    transportMode: sanitizeTransportMode(
      req.body?.transportMode ||
      req.headers["x-liotan-transport-mode"]
    ),
    userAgentHash: privacy.storeUserAgentHash
      ? hmac(String(req.headers["user-agent"] || ""))
      : ""
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
  revokeAllUserSessions,
  isValidDevicePublicKey,
  sanitizeFingerprint,
  sanitizeTransportMode
};
