const rateLimit =
  require("express-rate-limit");

const createMessage =
  (message) => ({
    error: message
  });

const apiLimiter =
  rateLimit({
    windowMs:
      60 * 1000,

    max:
      process.env.NODE_ENV === "production"
        ? 300
        : 3000,

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

    message:
      createMessage(
        "too many auth attempts"
      ),

    standardHeaders: true,
    legacyHeaders: false
  });

module.exports = {
  apiLimiter,
  authLimiter
};