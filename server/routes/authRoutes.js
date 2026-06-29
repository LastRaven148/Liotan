const express =
  require("express");

const {
  authLimiter,
  codeLimiter
} = require("../middleware/rateLimiters");

const authMiddleware =
  require("../middleware/authMiddleware");

const {
  sendAuthCode,
  verifyAuthCode,
  sendLoginCode,
  register,
  login,
  resetPassword
} = require("../controllers/authController");

const router =
  express.Router();

router.post(
  "/auth/email-code",
  codeLimiter,
  sendAuthCode
);

router.post(
  "/auth/verify-code",
  authLimiter,
  verifyAuthCode
);


router.post(
  "/register",
  authLimiter,
  register
);

router.post(
  "/login/code",
  codeLimiter,
  sendLoginCode
);

router.post(
  "/login",
  authLimiter,
  login
);

router.post(
  "/password/reset",
  authLimiter,
  resetPassword
);


module.exports = router;
