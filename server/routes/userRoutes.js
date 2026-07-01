const express =
  require("express");

const authMiddleware =
  require("../middleware/authMiddleware");

const {
  searchUsers,
  getPinnedChats,
  togglePinnedChat,
  getArchivedChats,
  toggleArchivedChat
} = require("../controllers/userController");

const router =
  express.Router();

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


module.exports = router;