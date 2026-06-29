const express =
  require("express");

const {
  authLimiter
} = require("../middleware/rateLimiters");

const authMiddleware =
  require("../middleware/authMiddleware");

const {
  sendAuthCode,
  verifyAuthCode,
  sendBindEmailCode,
  bindEmail,
  sendLoginCode,
  register,
  login,
  resetPassword
} = require("../controllers/authController");

const router =
  express.Router();

router.post(
  "/auth/email-code",
  authLimiter,
  sendAuthCode
);

router.post(
  "/auth/verify-code",
  authLimiter,
  verifyAuthCode
);

router.post(
  "/me/email-code",
  authMiddleware,
  authLimiter,
  sendBindEmailCode
);

router.post(
  "/me/email",
  authMiddleware,
  authLimiter,
  bindEmail
);


router.post(
  "/register",
  authLimiter,
  register
);

router.post(
  "/login/code",
  authLimiter,
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
