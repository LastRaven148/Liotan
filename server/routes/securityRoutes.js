const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
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
router.post("/security/totp/setup", authLimiter, authMiddleware, startTotpSetup);
router.post("/security/totp/enable", authLimiter, authMiddleware, enableTotp);
router.post("/security/totp/disable", authLimiter, authMiddleware, disableTotp);
router.post("/security/vault/prepare", authLimiter, authMiddleware, prepareVault);
router.post("/security/recovery/backup-codes", authLimiter, authMiddleware, rotateRecoveryCodes);
router.post("/security/recovery/phrase-verifier", authLimiter, authMiddleware, setRecoveryPhraseVerifier);

module.exports = router;
