const rateLimit =
  require("express-rate-limit");

const {
  hashRequestIp,
  hmac
} = require("../utils/securityIds");

const createMessage =
  (message) => ({
    error: message
  });

function userOrIpKey(req) {
  const userKey =
    req.user?.userId ||
    req.user?.username ||
    req.body?.email ||
    req.body?.username;

  if (userKey) {
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
    path.startsWith("/e2ee/identity") ||
    path.startsWith("/e2ee/devices/") ||
    path.startsWith("/e2ee/conversations/") ||
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
        ? 5000
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
        ? 5000
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
        ? 24
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
        ? 5
        : 100,
    keyGenerator: userOrIpKey,
    message: createMessage("too many code requests"),
    standardHeaders: true,
    legacyHeaders: false
  });

const uploadLimiter =
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max:
      process.env.NODE_ENV === "production"
        ? 20
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
        ? 600
        : 5000,
    keyGenerator: userOrIpKey,
    skip: (req) =>
      isReadRequest(req) && isBootstrapPath(req),
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
