const express =
  require("express");

const authMiddleware =
  require("../middleware/authMiddleware");

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
  setIdentity
);

router.get(
  "/e2ee/identity-backup",
  authMiddleware,
  getIdentityBackup
);

router.post(
  "/e2ee/identity-backup",
  authMiddleware,
  setIdentityBackup
);

router.get(
  "/e2ee/identity/:username",
  authMiddleware,
  getIdentity
);

router.post(
  "/e2ee/identities",
  authMiddleware,
  getIdentities
);

router.get(
  "/e2ee/conversations/:conversationId/key",
  authMiddleware,
  getConversationKey
);

router.post(
  "/e2ee/conversations/:conversationId/keys",
  authMiddleware,
  setConversationKeys
);

module.exports = router;
