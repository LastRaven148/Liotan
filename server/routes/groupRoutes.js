const express =
  require("express");

const authMiddleware =
  require("../middleware/authMiddleware");

const {
  createGroup,
  getMyGroups,
  getGroupById,
  addGroupMember,
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

router.post(
  "/groups/:id/members",
  authMiddleware,
  addGroupMember
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