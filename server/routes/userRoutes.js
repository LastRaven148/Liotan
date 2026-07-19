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
const { blockUser, listBlocks, unblockUser } = require("../controllers/blockController");
const { getNotificationSettings, updateNotificationSettings } = require("../controllers/notificationSettingsController");

const router =
  express.Router();

router.get("/me/blocks", authMiddleware, listBlocks);
router.put("/me/blocks/:username", authMiddleware, blockUser);
router.delete("/me/blocks/:username", authMiddleware, unblockUser);
router.get("/me/notification-settings", authMiddleware, getNotificationSettings);
router.patch("/me/notification-settings", authMiddleware, updateNotificationSettings);

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
