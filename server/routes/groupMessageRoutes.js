const express =
  require("express");

const authMiddleware =
  require("../middleware/authMiddleware");

const {
  getGroupMessages
} =
require("../controllers/groupMessageController");

const router =
  express.Router();

router.get(
  "/groups/:id/messages",
  authMiddleware,
  getGroupMessages
);

module.exports =
  router;