const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { recentAuth } = require("../middleware/recentAuth");
const { restrictedSessionGuard } = require("../middleware/restrictedSession");
const { authLimiter } = require("../middleware/rateLimiters");
const {
  getSecurityStatus,
  getSecurityPolicy,
  startTotpSetup,
  enableTotp,
  disableTotp,
  prepareVault,
  rotateRecoveryCodes,
  setRecoveryPhraseVerifier
} = require("../controllers/securityController");

const router = express.Router();

router.get("/security/policy", getSecurityPolicy);
router.get("/security/status", authMiddleware, getSecurityStatus);
router.post("/security/totp/setup", authLimiter, authMiddleware, restrictedSessionGuard, recentAuth, startTotpSetup);
router.post("/security/totp/enable", authLimiter, authMiddleware, restrictedSessionGuard, recentAuth, enableTotp);
router.post("/security/totp/disable", authLimiter, authMiddleware, restrictedSessionGuard, recentAuth, disableTotp);
router.post("/security/vault/prepare", authLimiter, authMiddleware, restrictedSessionGuard, recentAuth, prepareVault);
router.post("/security/recovery/backup-codes", authLimiter, authMiddleware, restrictedSessionGuard, recentAuth, rotateRecoveryCodes);
router.post("/security/recovery/phrase-verifier", authLimiter, authMiddleware, restrictedSessionGuard, recentAuth, setRecoveryPhraseVerifier);

module.exports = router;
