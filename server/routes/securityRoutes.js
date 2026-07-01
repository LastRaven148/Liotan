const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { recentAuth } = require("../middleware/recentAuth");
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
router.post("/security/totp/setup", authLimiter, authMiddleware, recentAuth, startTotpSetup);
router.post("/security/totp/enable", authLimiter, authMiddleware, recentAuth, enableTotp);
router.post("/security/totp/disable", authLimiter, authMiddleware, recentAuth, disableTotp);
router.post("/security/vault/prepare", authLimiter, authMiddleware, recentAuth, prepareVault);
router.post("/security/recovery/backup-codes", authLimiter, authMiddleware, recentAuth, rotateRecoveryCodes);
router.post("/security/recovery/phrase-verifier", authLimiter, authMiddleware, recentAuth, setRecoveryPhraseVerifier);

module.exports = router;
