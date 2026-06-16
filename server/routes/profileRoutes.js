const express =
  require("express");

const authMiddleware =
  require("../middleware/authMiddleware");

const upload =
  require("../config/upload");

const {
  getProfile,
  updateProfile,
  uploadAvatar
} = require("../controllers/profileController");

const router =
  express.Router();

router.get(
  "/profile/:username",
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

module.exports = router;