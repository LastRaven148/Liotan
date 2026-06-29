const express =
  require("express");

const authMiddleware =
  require("../middleware/authMiddleware");

const {
  e2eeLimiter
} = require("../middleware/rateLimiters");

const {
  setIdentity,
  getIdentityBackup,
  setIdentityBackup,
  getIdentity,
  getIdentities,
  getConversationKey,
  setConversationKeys
} = require("../controllers/e2eeController");

const router =
  express.Router();

router.post(
  "/e2ee/identity",
  authMiddleware,
  e2eeLimiter,
  setIdentity
);

router.get(
  "/e2ee/identity-backup",
  authMiddleware,
  e2eeLimiter,
  getIdentityBackup
);

router.post(
  "/e2ee/identity-backup",
  authMiddleware,
  e2eeLimiter,
  setIdentityBackup
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
  "/e2ee/conversations/:conversationId/key",
  authMiddleware,
  e2eeLimiter,
  getConversationKey
);

router.post(
  "/e2ee/conversations/:conversationId/keys",
  authMiddleware,
  e2eeLimiter,
  setConversationKeys
);

module.exports = router;
