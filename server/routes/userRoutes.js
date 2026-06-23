const express =
  require("express");

const authMiddleware =
  require("../middleware/authMiddleware");

const {
  getUsers,
  searchUsers,
  getPinnedChats,
  togglePinnedChat,
  getArchivedChats,
  toggleArchivedChat,
  devAdminPage,
  devListUsers,
  devResetUserPassword,
  devDeleteUser
} = require("../controllers/userController");

const router =
  express.Router();

router.get(
  "/users",
  getUsers
);

router.get(
  "/users/search",
  authMiddleware,
  searchUsers
);

router.get(
  "/me/pinned-chats",
  authMiddleware,
  getPinnedChats
);

router.post(
  "/me/pinned-chats/toggle",
  authMiddleware,
  togglePinnedChat
);

router.get(
  "/me/archived-chats",
  authMiddleware,
  getArchivedChats
);

router.post(
  "/me/archived-chats/toggle",
  authMiddleware,
  toggleArchivedChat
);

router.get(
  "/dev/admin",
  devAdminPage
);

router.get(
  "/dev/users",
  devListUsers
);

router.patch(
  "/dev/users/:username/reset-password",
  devResetUserPassword
);

router.delete(
  "/dev/users/:username",
  devDeleteUser
);

module.exports = router;