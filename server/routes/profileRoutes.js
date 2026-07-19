const express =
  require("express");

const authMiddleware =
  require("../middleware/authMiddleware");

const upload =
  require("../config/upload");

const { restrictedSessionGuard } =
  require("../middleware/restrictedSession");
const { requireReauthentication } = require("../middleware/recentAuth");

const {
  getProfile,
  updateProfile,
  uploadAvatar,
  deleteAccount,
  getAccountDeletionStatus
} = require("../controllers/profileController");

const router =
  express.Router();

router.get(
  "/profile/:username",
  authMiddleware,
  getProfile
);

router.post(
  "/profile/update",
  authMiddleware,
  updateProfile
);

router.post(
  "/upload-avatar",
  authMiddleware,
  upload.single("avatar"),
  uploadAvatar
);

router.delete(
  "/me/account",
  authMiddleware,
  restrictedSessionGuard,
  requireReauthentication,
  deleteAccount
);

router.get(
  "/me/account/deletion/:workflowId",
  authMiddleware,
  getAccountDeletionStatus
);

module.exports = router;
