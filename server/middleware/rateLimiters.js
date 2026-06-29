const crypto =
  require("crypto");

const rateLimit =
  require("express-rate-limit");

const createMessage =
  (message) => ({
    error: message
  });

function privacyKey(req) {
  const secret =
    process.env.PRIVACY_HASH_SECRET ||
    process.env.JWT_SECRET ||
    "liotan-local-dev";

  const rawKey =
    req.user?.username ||
    req.body?.email ||
    req.body?.username ||
    "anonymous";

  return crypto
    .createHmac("sha256", secret)
    .update(String(rawKey))
    .digest("hex");
}

const apiLimiter =
  rateLimit({
    windowMs:
      60 * 1000,

    max:
      process.env.NODE_ENV === "production"
        ? 300
        : 3000,

    keyGenerator:
      privacyKey,

    message:
      createMessage(
        "too many requests"
      ),

    standardHeaders: true,
    legacyHeaders: false
  });

const authLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    max:
      process.env.NODE_ENV === "production"
        ? 20
        : 200,

    keyGenerator:
      privacyKey,

    message:
      createMessage(
        "too many auth attempts"
      ),

    standardHeaders: true,
    legacyHeaders: false
  });


const uploadLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    max:
      process.env.NODE_ENV === "production"
        ? 30
        : 300,

    keyGenerator:
      privacyKey,

    message:
      createMessage(
        "too many upload attempts"
      ),

    standardHeaders: true,
    legacyHeaders: false
  });

module.exports = {
  apiLimiter,
  authLimiter,
  uploadLimiter
};
