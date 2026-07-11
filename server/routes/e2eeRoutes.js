const express =
  require("express");

const authMiddleware =
  require("../middleware/authMiddleware");

const {
  e2eeLimiter
} = require("../middleware/rateLimiters");

const {
  getIdentity,
  getIdentities,
  getDeviceIdentities,
  getConversationKey
} = require("../controllers/e2eeController");

const router =
  express.Router();

function legacyWriteGone(_req, res) {
  return res.status(410).json({
    error: "legacy E2EE writes disabled; MLS v4 required",
    protocol: "mls-1.0"
  });
}

router.post(
  "/e2ee/identity",
  authMiddleware,
  e2eeLimiter,
  legacyWriteGone
);

router.get(
  "/e2ee/identity-backup",
  authMiddleware,
  e2eeLimiter,
  legacyWriteGone
);

router.post(
  "/e2ee/identity-backup",
  authMiddleware,
  e2eeLimiter,
  legacyWriteGone
);

router.get(
  "/e2ee/identity/:username",
  authMiddleware,
  e2eeLimiter,
  getIdentity
);

router.post(
  "/e2ee/identities",
  authMiddleware,
  e2eeLimiter,
  getIdentities
);

router.get(
  "/e2ee/devices/:username",
  authMiddleware,
  e2eeLimiter,
  getDeviceIdentities
);

router.get(
  "/e2ee/conversations/:conversationId/key",
  authMiddleware,
  e2eeLimiter,
  getConversationKey
);

router.post(
  "/e2ee/conversations/:conversationId/keys",
  authMiddleware,
  e2eeLimiter,
  legacyWriteGone
);

module.exports = router;
