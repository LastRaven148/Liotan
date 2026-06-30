const express =
  require("express");

const authMiddleware =
  require("../middleware/authMiddleware");

const upload =
  require("../config/upload");

const {
  getProfile,
  updateProfile,
  uploadAvatar,
  deleteAccount
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
  deleteAccount
);

module.exports = router;