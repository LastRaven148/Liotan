const express =
  require("express");

const authMiddleware =
  require("../middleware/authMiddleware");

const upload =
  require("../config/upload");

const {
  createGroup,
  getMyGroups,
  getGroupById,
  updateGroup,
  uploadGroupAvatar,
  addGroupMember,
  removeGroupMember,
  leaveGroup,
  deleteGroup
} = require("../controllers/groupController");

const router =
  express.Router();

router.post(
  "/groups",
  authMiddleware,
  createGroup
);

router.get(
  "/groups",
  authMiddleware,
  getMyGroups
);

router.get(
  "/groups/:id",
  authMiddleware,
  getGroupById
);

router.patch(
  "/groups/:id",
  authMiddleware,
  updateGroup
);

router.post(
  "/groups/:id/avatar",
  authMiddleware,
  upload.single("avatar"),
  uploadGroupAvatar
);

router.post(
  "/groups/:id/members",
  authMiddleware,
  addGroupMember
);

router.delete(
  "/groups/:id/members/:username",
  authMiddleware,
  removeGroupMember
);

router.post(
  "/groups/:id/leave",
  authMiddleware,
  leaveGroup
);

router.delete(
  "/groups/:id",
  authMiddleware,
  deleteGroup
);

module.exports =
  router;