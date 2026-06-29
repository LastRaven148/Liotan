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

// Global safety limiter. It must be soft enough for app bootstrap,
// because the client loads profile/dialogs/groups/devices in parallel.
// Strict protection stays on auth/upload/socket-specific limiters.
const strictIpLimiter =
  rateLimit({
    windowMs: 10 * 1000,
    max:
      process.env.NODE_ENV === "production"
        ? 80
        : 1000,
    keyGenerator: hashRequestIp,
    message: createMessage("too many requests"),
    standardHeaders: true,
    legacyHeaders: false
  });

const apiLimiter =
  rateLimit({
    windowMs: 60 * 1000,
    max:
      process.env.NODE_ENV === "production"
        ? 300
        : 3000,
    keyGenerator: userOrIpKey,
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
        ? 60
        : 1000,
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
