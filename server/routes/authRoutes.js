const express =
  require("express");

const {
  authLimiter
} = require("../middleware/rateLimiters");

const authMiddleware =
  require("../middleware/authMiddleware");

const {
  sendAuthCode,
  register,
  login,
  resetPassword,
  deleteMe
} = require("../controllers/authController");

const router =
  express.Router();

router.post(
  "/auth/email-code",
  authLimiter,
  sendAuthCode
);

router.post(
  "/register",
  authLimiter,
  register
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

router.delete(
  "/me",
  authMiddleware,
  deleteMe
);

module.exports = router;
