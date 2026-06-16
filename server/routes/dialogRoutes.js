const express =
  require("express");

const authMiddleware =
  require("../middleware/authMiddleware");

const {
  getDialogs
} = require("../controllers/dialogController");

const router =
  express.Router();

router.get(
  "/dialogs",
  authMiddleware,
  getDialogs
);

module.exports = router;