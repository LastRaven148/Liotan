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
  resetPassword,
  listSessions,
  logoutCurrentSession,
  revokeOneSession,
  logoutOtherSessions
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

router.get(
  "/auth/sessions",
  authMiddleware,
  listSessions
);

router.post(
  "/auth/logout",
  authMiddleware,
  logoutCurrentSession
);

router.delete(
  "/auth/sessions/:id",
  authMiddleware,
  revokeOneSession
);

router.post(
  "/auth/sessions/logout-others",
  authMiddleware,
  logoutOtherSessions
);


module.exports = router;
