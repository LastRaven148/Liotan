const rateLimit =
  require("express-rate-limit");

const {
  hashRequestIp,
  hmac
} = require("../utils/securityIds");

const { normalizeEmail } = require("../utils/privacy");

const createMessage =
  (message) => ({
    error: message
  });

function userOrIpKey(req) {
  const rawUserKey =
    req.user?.userId ||
    req.user?.username ||
    req.body?.email ||
    req.body?.username;

  if (rawUserKey) {
    const userKey = String(rawUserKey).includes("@")
      ? normalizeEmail(rawUserKey)
      : String(rawUserKey).trim().toLowerCase();
    return hmac(`user:${userKey}`);
  }

  return hashRequestIp(req);
}

function isReadRequest(req) {
  return req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
}

function isBootstrapPath(req) {
  const path = req.path || "";

  return (
    path === "/health" ||
    path === "/profile" ||
    path.startsWith("/profile/") ||
    path === "/dialogs" ||
    path === "/groups" ||
    path === "/archived-chats" ||
    path === "/pinned-chats" ||
    path === "/me/archived-chats" ||
    path === "/me/pinned-chats" ||
    path === "/sessions" ||
    path === "/devices" ||
    path === "/proxy/status" ||
    path === "/voice/policy" ||
    path === "/calls/policy"
  );
}

// Safety net only. It must never break normal application bootstrap.
// Real strict protection is applied by auth/upload/e2ee/socket-specific limiters.
const strictIpLimiter =
  rateLimit({
    windowMs: 60 * 1000,
    max:
      process.env.NODE_ENV === "production"
        ? 1200
        : 50000,
    keyGenerator: hashRequestIp,
    skip: (req) =>
      isReadRequest(req) && isBootstrapPath(req),
    message: createMessage("too many requests"),
    standardHeaders: true,
    legacyHeaders: false
  });

const apiLimiter =
  rateLimit({
    windowMs: 60 * 1000,
    max:
      process.env.NODE_ENV === "production"
        ? 1200
        : 50000,
    keyGenerator: userOrIpKey,
    skip: (req) =>
      isReadRequest(req) && isBootstrapPath(req),
    message: createMessage("too many requests"),
    standardHeaders: true,
    legacyHeaders: false
  });

const authLimiter =
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max:
      process.env.NODE_ENV === "production"
        ? 12
        : 200,
    keyGenerator: userOrIpKey,
    message: createMessage("too many auth attempts"),
    standardHeaders: true,
    legacyHeaders: false
  });

const codeLimiter =
  rateLimit({
    windowMs: 60 * 1000,
    max:
      process.env.NODE_ENV === "production"
        ? 3
        : 100,
    keyGenerator: userOrIpKey,
    message: createMessage("too many code requests"),
    standardHeaders: true,
    legacyHeaders: false
  });

const uploadLimiter =
  rateLimit({
    windowMs: 60 * 1000,
    max:
      process.env.NODE_ENV === "production"
        ? 30
        : 300,
    keyGenerator: userOrIpKey,
    message: createMessage("too many upload attempts"),
    standardHeaders: true,
    legacyHeaders: false
  });

const e2eeLimiter =
  rateLimit({
    windowMs: 60 * 1000,
    max:
      process.env.NODE_ENV === "production"
        ? 300
        : 5000,
    keyGenerator: userOrIpKey,
    message: createMessage("too many key requests"),
    standardHeaders: true,
    legacyHeaders: false
  });

module.exports = {
  strictIpLimiter,
  apiLimiter,
  authLimiter,
  codeLimiter,
  uploadLimiter,
  e2eeLimiter
};
