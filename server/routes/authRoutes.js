const express =
  require("express");

const {
  authLimiter,
  codeLimiter
} = require("../middleware/rateLimiters");

const authMiddleware =
  require("../middleware/authMiddleware");

const { recentAuth } =
  require("../middleware/recentAuth");

const {
  sendAuthCode,
  verifyAuthCode,
  sendLoginCode,
  register,
  login,
  resetPassword,
  getCurrentSession,
  listSessions,
  logoutCurrentSession,
  revokeOneSession,
  logoutOtherSessions,
  logoutAllSessions,
  updateCurrentSessionDeviceKey,
  startEmailChangeCurrent,
  verifyEmailChangeCurrent,
  sendEmailChangeNewCode,
  confirmEmailChange,
  cancelEmailChange,
  cancelRegistration,
  handleRegistrationSecurityAction
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


router.post(
  "/auth/email-change/current",
  authLimiter,
  authMiddleware,
  startEmailChangeCurrent
);

router.post(
  "/auth/email-change/verify-current",
  authLimiter,
  authMiddleware,
  verifyEmailChangeCurrent
);

router.post(
  "/auth/email-change/new-code",
  codeLimiter,
  authMiddleware,
  sendEmailChangeNewCode
);

router.post(
  "/auth/email-change/confirm",
  authLimiter,
  authMiddleware,
  recentAuth,
  confirmEmailChange
);

router.get(
  "/auth/email-change/cancel/:token",
  authLimiter,
  cancelEmailChange
);

router.get(
  "/auth/register/cancel/:token",
  cancelRegistration
);

router.get(
  "/auth/register/cancel/:token/action/:action",
  handleRegistrationSecurityAction
);

router.post(
  "/auth/register/cancel/:token/action/:action",
  handleRegistrationSecurityAction
);

router.get(
  "/auth/session",
  authMiddleware,
  getCurrentSession
);

router.get(
  "/auth/sessions",
  authMiddleware,
  listSessions
);

router.patch(
  "/auth/session/device-key",
  authLimiter,
  authMiddleware,
  updateCurrentSessionDeviceKey
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

router.post(
  "/auth/sessions/logout-all",
  authMiddleware,
  logoutAllSessions
);


module.exports = router;
