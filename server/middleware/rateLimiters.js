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

const strictIpLimiter =
  rateLimit({
    windowMs: 1000,
    max:
      process.env.NODE_ENV === "production"
        ? 5
        : 60,
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
        ? 120
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
